"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function providerFromUrl(url: string): string {
  const h = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  if (h.includes("drive.google") || h.includes("docs.google")) return "google_drive";
  if (h.includes("dropbox")) return "dropbox";
  if (h.includes("onedrive") || h.includes("sharepoint") || h.includes("1drv.ms")) return "onedrive";
  return "link";
}

export function AttachLink({
  orgId, wsId, itemId, currentUserId,
}: {
  orgId: string; wsId: string; itemId: string; currentUserId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function attach() {
    if (!/^https?:\/\//i.test(url)) return setErr("Enter a full https:// link.");
    setErr(null);
    const { data: fileRow, error } = await supabase
      .from("files")
      .insert({
        organization_id: orgId,
        workspace_id: wsId,
        external_url: url,
        provider: providerFromUrl(url),
        name: name.trim() || url.replace(/^https?:\/\//, "").slice(0, 80),
        uploaded_by: currentUserId,
      })
      .select().single();
    if (error) return setErr(error.message);
    const { error: linkError } = await supabase.from("file_attachments").insert({
      file_id: fileRow.id,
      target_type: "item",
      target_id: itemId,
      attached_by: currentUserId,
    });
    if (linkError) return setErr(linkError.message);
    setOpen(false); setUrl(""); setName("");
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
        🔗 Attach link (Drive / Dropbox / OneDrive)
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)}
        className="w-64 rounded border border-slate-300 px-2 py-1 text-xs font-mono" />
      <input placeholder="Display name (optional)" value={name} onChange={(e) => setName(e.target.value)}
        className="w-40 rounded border border-slate-300 px-2 py-1 text-xs" />
      <button onClick={attach}
        className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white">Attach</button>
      <button onClick={() => setOpen(false)} className="text-xs text-slate-400">✕</button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}
