"use client";

// OAuth file pickers (Phase 13b): Google Drive, Dropbox, OneDrive.
// Each provider's own client-side picker SDK runs the OAuth popup and hands
// back a shareable link; we store it as an external `files` row (same shape
// AttachLink writes). Buttons only render for providers with env keys set:
//   NEXT_PUBLIC_GOOGLE_CLIENT_ID + NEXT_PUBLIC_GOOGLE_PICKER_API_KEY
//   NEXT_PUBLIC_DROPBOX_APP_KEY
//   NEXT_PUBLIC_ONEDRIVE_CLIENT_ID

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

declare const window: any;

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
const DROPBOX_APP_KEY = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY;
const ONEDRIVE_CLIENT_ID = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID;

function loadScript(src: string, attrs: Record<string, string> = {}) {
  return new Promise<void>((resolve, reject) => {
    const id = "sdk-" + src.replace(/[^a-z0-9]/gi, "");
    if (document.getElementById(id)) return resolve();
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

export function FilePickers({
  orgId, wsId, itemId, currentUserId,
}: {
  orgId: string; wsId: string; itemId: string; currentUserId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function attachExternal(provider: string, name: string, url: string) {
    const { data: fileRow, error } = await supabase
      .from("files")
      .insert({
        organization_id: orgId,
        workspace_id: wsId,
        external_url: url,
        provider,
        name: (name || url).slice(0, 120),
        uploaded_by: currentUserId,
      })
      .select().single();
    if (error) throw new Error(error.message);
    const { error: linkError } = await supabase.from("file_attachments").insert({
      file_id: fileRow.id,
      target_type: "item",
      target_id: itemId,
      attached_by: currentUserId,
    });
    if (linkError) throw new Error(linkError.message);
    router.refresh();
  }

  async function run(provider: string, fn: () => Promise<void>) {
    setErr(null);
    setBusy(provider);
    try {
      await fn();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  // --- Google Drive: GIS token client + Picker API ---
  async function pickGoogle() {
    await loadScript("https://accounts.google.com/gsi/client");
    await loadScript("https://apis.google.com/js/api.js");
    await new Promise<void>((res) => window.gapi.load("picker", () => res()));
    const token: string = await new Promise((resolve, reject) => {
      const tc = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: "https://www.googleapis.com/auth/drive.readonly",
        callback: (resp: any) =>
          resp.access_token ? resolve(resp.access_token) : reject(new Error(resp.error ?? "No token")),
      });
      tc.requestAccessToken();
    });
    await new Promise<void>((resolve, reject) => {
      const picker = new window.google.picker.PickerBuilder()
        .addView(window.google.picker.ViewId.DOCS)
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback(async (data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const doc = data.docs?.[0];
            try {
              await attachExternal(
                "google_drive",
                doc?.name ?? "Google Drive file",
                doc?.url ?? `https://drive.google.com/file/d/${doc?.id}/view`,
              );
              resolve();
            } catch (e) { reject(e); }
          } else if (data.action === window.google.picker.Action.CANCEL) {
            resolve();
          }
        })
        .build();
      picker.setVisible(true);
    });
  }

  // --- Dropbox Chooser ---
  async function pickDropbox() {
    await loadScript("https://www.dropbox.com/static/api/2/dropins.js", {
      "data-app-key": DROPBOX_APP_KEY!,
    });
    await new Promise<void>((resolve, reject) => {
      window.Dropbox.choose({
        linkType: "preview",
        multiselect: false,
        success: async (files: any[]) => {
          try {
            await attachExternal("dropbox", files[0]?.name ?? "Dropbox file", files[0]?.link);
            resolve();
          } catch (e) { reject(e); }
        },
        cancel: () => resolve(),
      });
    });
  }

  // --- OneDrive File Picker (v7.2) ---
  async function pickOneDrive() {
    await loadScript("https://js.live.net/v7.2/OneDrive.js");
    await new Promise<void>((resolve, reject) => {
      window.OneDrive.open({
        clientId: ONEDRIVE_CLIENT_ID,
        action: "share",
        multiSelect: false,
        advanced: { redirectUri: window.location.origin },
        success: async (files: any) => {
          const f = files?.value?.[0];
          const url =
            f?.permissions?.[0]?.link?.webUrl ?? f?.webUrl ?? f?.["@microsoft.graph.downloadUrl"];
          if (!url) return reject(new Error("OneDrive returned no shareable link."));
          try {
            await attachExternal("onedrive", f?.name ?? "OneDrive file", url);
            resolve();
          } catch (e) { reject(e); }
        },
        cancel: () => resolve(),
        error: (e: any) => reject(new Error(e?.message ?? "OneDrive picker error")),
      });
    });
  }

  const providers = [
    GOOGLE_CLIENT_ID && GOOGLE_API_KEY
      ? { key: "google_drive", label: "Google Drive", fn: pickGoogle }
      : null,
    DROPBOX_APP_KEY ? { key: "dropbox", label: "Dropbox", fn: pickDropbox } : null,
    ONEDRIVE_CLIENT_ID ? { key: "onedrive", label: "OneDrive", fn: pickOneDrive } : null,
  ].filter(Boolean) as { key: string; label: string; fn: () => Promise<void> }[];

  if (providers.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {providers.map((p) => (
        <button key={p.key} disabled={busy !== null}
          onClick={() => run(p.key, p.fn)}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          {busy === p.key ? "Opening…" : `📎 ${p.label}`}
        </button>
      ))}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}
