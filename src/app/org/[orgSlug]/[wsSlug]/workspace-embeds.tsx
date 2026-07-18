"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizeEmbedUrl } from "./tiles/iframe-tile";
import { TileBody, type TileData } from "./dashboard-tiles";
import { AddTileModal, type TileApp, type TileSpec } from "./tiles/add-tile-modal";

// Beyond-Podio: a tab bar above the workspace dashboard. "Dashboard" is
// always the first tab and the default on every visit. The "+" opens the
// STANDARD tile picker (Overviews / Apps / Reports & Charts / Text / Web
// Embed / YouTube) and the chosen tile becomes a tab rendered FULL-CANVAS —
// a website or Google Sheet fills the viewport, any other kind renders as a
// full-width card. Tabs are shared per workspace (podio.workspace_embeds).

export type CanvasTab = { id: string; title: string; tile: TileData };

export function WorkspaceCanvas({
  wsId,
  wsName,
  apps,
  tabs,
  children,
}: {
  wsId: string;
  wsName: string;
  apps: TileApp[];
  tabs: CanvasTab[];
  children: ReactNode; // the panel board (server-rendered)
}) {
  const router = useRouter();
  const supabase = createClient();
  const [activeId, setActiveId] = useState<string | null>(null); // null = Dashboard
  const [picking, setPicking] = useState(false);

  const active = tabs.find((t) => t.id === activeId) ?? null;

  async function addTab(spec: TileSpec): Promise<string | null> {
    const { data: row, error } = await supabase
      .from("workspace_embeds")
      .insert({
        workspace_id: wsId,
        title: spec.title,
        kind: spec.kind,
        app_id: spec.appId,
        config: spec.config,
        url: spec.config?.url ?? "",
        position: tabs.length,
      })
      .select()
      .single();
    if (error) return error.message;
    setPicking(false);
    if (row) setActiveId(row.id);
    router.refresh();
    return null;
  }

  async function removeTab(id: string) {
    await supabase.from("workspace_embeds").delete().eq("id", id);
    if (activeId === id) setActiveId(null);
    router.refresh();
  }

  const tabBase = "rounded px-3 py-1 text-sm";
  const tabActive = `${tabBase} bg-podio-orange font-semibold text-white`;
  const tabIdle = `${tabBase} text-podio-teal hover:underline`;

  // Full-viewport iframe for embed tabs; every other kind renders through
  // the shared TileBody in a full-width card.
  function tabContent(tab: CanvasTab) {
    if (tab.tile.kind === "iframe") {
      const frame = normalizeEmbedUrl(tab.tile.config?.url ?? "");
      if (!frame.url) {
        return (
          <div className="rounded border border-podio-border bg-podio-row-alt p-6 text-sm text-podio-meta">
            {frame.reason ?? "This link can't be embedded."}
          </div>
        );
      }
      return (
        <>
          <iframe
            src={frame.url}
            title={tab.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            className="h-[calc(100dvh_-_13rem)] min-h-[420px] w-full rounded border border-podio-border bg-white"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-podio-meta">
            <span className="min-w-0 truncate">{new URL(frame.url).hostname}</span>
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
      );
    }
    return (
      <div className={tab.tile.kind === "youtube" ? "max-w-4xl" : undefined}>
        <div className="rounded border border-podio-border bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-podio-meta">
            {tab.title}
          </p>
          <TileBody t={tab.tile} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Tab bar above the dashboard canvas */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 md:px-6">
        <button
          type="button"
          onClick={() => setActiveId(null)}
          className={active === null ? tabActive : tabIdle}
        >
          Dashboard
        </button>
        {tabs.map((t) => (
          <span key={t.id} className="flex items-center">
            <button
              type="button"
              onClick={() => setActiveId(t.id)}
              className={active?.id === t.id ? tabActive : tabIdle}
            >
              {t.title}
            </button>
            <button
              type="button"
              onClick={() => void removeTab(t.id)}
              title={`Remove ${t.title}`}
              aria-label={`Remove ${t.title}`}
              className="ml-1 rounded px-1 text-xs text-podio-disabled hover:bg-podio-row-alt hover:text-red-600"
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setPicking(true)}
          title="Add a tab"
          className="ml-2 rounded border border-podio-border bg-white px-2.5 py-0.5 text-sm text-podio-secondary hover:bg-podio-row-alt"
        >
          +
        </button>
      </div>

      {active ? (
        <div className="px-4 pb-8 pt-3 md:px-6">{tabContent(active)}</div>
      ) : (
        children
      )}

      <AddTileModal
        open={picking}
        onClose={() => setPicking(false)}
        onAdd={addTab}
        apps={apps}
        wsName={wsName}
      />
    </div>
  );
}
