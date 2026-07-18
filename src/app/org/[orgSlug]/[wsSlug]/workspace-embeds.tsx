"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizeEmbedUrl } from "./tiles/iframe-tile";

// Beyond-Podio: a tab bar above the workspace dashboard holding saved
// external embeds (websites, Google Sheets…). "Dashboard" is always the
// first tab and the default on every visit; clicking an embed tab swaps the
// whole canvas for that site full-width WITHOUT leaving the workspace.
// Embeds are shared per workspace (podio.workspace_embeds, migration 78).

type Embed = { id: string; title: string; url: string };

export function WorkspaceCanvas({
  wsId,
  embeds,
  children,
}: {
  wsId: string;
  embeds: Embed[];
  children: ReactNode; // the panel board (server-rendered)
}) {
  const router = useRouter();
  const supabase = createClient();
  const [activeId, setActiveId] = useState<string | null>(null); // null = Dashboard
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = embeds.find((e) => e.id === activeId) ?? null;

  async function addEmbed() {
    const t = title.trim();
    const u = url.trim();
    if (!t || busy) return;
    const normalized = normalizeEmbedUrl(u);
    if (!normalized.url) {
      setError(normalized.reason ?? "Enter a valid http(s) URL.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data: row, error: insError } = await supabase
      .from("workspace_embeds")
      .insert({ workspace_id: wsId, title: t, url: u, position: embeds.length })
      .select()
      .single();
    setBusy(false);
    if (insError) {
      setError(insError.message);
      return;
    }
    setAdding(false);
    setTitle("");
    setUrl("");
    if (row) setActiveId(row.id);
    router.refresh();
  }

  async function removeEmbed(id: string) {
    await supabase.from("workspace_embeds").delete().eq("id", id);
    if (activeId === id) setActiveId(null);
    router.refresh();
  }

  const tabBase = "rounded px-3 py-1 text-sm";
  const tabActive = `${tabBase} bg-podio-orange font-semibold text-white`;
  const tabIdle = `${tabBase} text-podio-teal hover:underline`;

  const frame = active ? normalizeEmbedUrl(active.url) : null;

  return (
    <div>
      {/* Tab bar above the dashboard canvas */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 md:px-6">
        <button
          type="button"
          onClick={() => setActiveId(null)}
          className={active === null ? tabActive : tabIdle}
        >
          Dashboard
        </button>
        {embeds.map((e) => (
          <span key={e.id} className="group relative">
            <button
              type="button"
              onClick={() => setActiveId(e.id)}
              className={`${active?.id === e.id ? tabActive : tabIdle} ${
                active?.id === e.id ? "pr-6" : "group-hover:pr-6"
              }`}
            >
              {e.title}
            </button>
            <button
              type="button"
              onClick={() => void removeEmbed(e.id)}
              title={`Remove ${e.title}`}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-xs ${
                active?.id === e.id
                  ? "text-white/80 hover:text-white"
                  : "hidden text-podio-meta hover:text-red-600 group-hover:inline"
              }`}
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => {
            setAdding(!adding);
            setError(null);
          }}
          title="Add an embed tab"
          className="rounded border border-podio-border bg-white px-2 py-0.5 text-sm text-podio-secondary hover:bg-podio-row-alt"
        >
          +
        </button>

        {adding && (
          <span className="flex flex-wrap items-center gap-1.5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tab name"
              className="w-32 rounded border border-podio-border bg-white px-2 py-1 text-sm text-podio-ink outline-none placeholder:text-podio-meta focus:border-podio-teal"
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addEmbed();
              }}
              placeholder="https://…"
              className="w-64 rounded border border-podio-border bg-white px-2 py-1 text-sm text-podio-ink outline-none placeholder:text-podio-meta focus:border-podio-teal"
            />
            <button
              type="button"
              onClick={() => void addEmbed()}
              disabled={busy}
              className="rounded bg-podio-teal px-3 py-1 text-sm font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add"}
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </span>
        )}
      </div>

      {active && frame ? (
        <div className="px-4 pb-8 pt-3 md:px-6">
          {frame.url ? (
            <>
              <iframe
                src={frame.url}
                title={active.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                className="h-[calc(100vh-15rem)] w-full rounded border border-podio-border bg-white"
              />
              <div className="mt-1 flex items-center justify-between text-xs text-podio-meta">
                <span className="min-w-0 truncate">
                  {new URL(frame.url).hostname}
                </span>
                <a
                  href={frame.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 shrink-0 text-podio-teal hover:underline"
                >
                  Open ↗
                </a>
              </div>
            </>
          ) : (
            <div className="rounded border border-podio-border bg-podio-row-alt p-6 text-sm text-podio-meta">
              {"This link can't be embedded."}
            </div>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
