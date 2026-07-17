"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AddTileModal, type TileApp, type TileSpec } from "./tiles/add-tile-modal";
import {
  TasksTile,
  CalendarTile,
  FilesTile,
  ContactsTile,
  TextTile,
} from "./tiles/overview-tiles";
import { IframeTile } from "./tiles/iframe-tile";
import { YouTubeTile } from "./tiles/youtube-tile";

// Workspace dashboard tiles. "+ Add tile" opens the Podio-style picker modal
// (Overviews / Apps / Reports & Charts); the server page computes each tile's
// data (counts, groups, overview lists, app items) and this component renders
// them. Web-embed (iframe) and YouTube tiles are beyond-Podio extras.

export type TileData = {
  id: string;
  title: string;
  kind: string;
  value?: number;
  groups?: { label: string; color: string; value: number }[];
  config?: Record<string, any>; // text / iframe / youtube
  tasks?: { id: string; title: string; due_date: string | null }[];
  events?: { id: string; title: string; when: string; href: string }[];
  files?: { id: string; name: string; href: string | null; created_at: string }[];
  members?: { user_id: string; full_name: string | null; avatar_url: string | null }[];
  items?: { id: string; title: string; href: string }[]; // app tile
};

// Wide-content kinds span two grid columns so embeds stay usable.
const WIDE_KINDS = new Set(["iframe", "youtube", "grouped"]);

function TileBody({ t }: { t: TileData }) {
  if (t.kind === "tasks") return <TasksTile tasks={t.tasks ?? []} moreHref="/tasks" />;
  if (t.kind === "calendar") return <CalendarTile events={t.events ?? []} />;
  if (t.kind === "files") return <FilesTile files={t.files ?? []} />;
  if (t.kind === "contacts") return <ContactsTile members={t.members ?? []} />;
  if (t.kind === "text") return <TextTile text={t.config?.text ?? ""} />;
  if (t.kind === "iframe")
    return <IframeTile url={t.config?.url ?? ""} height={t.config?.height} />;
  if (t.kind === "youtube")
    return <YouTubeTile url={t.config?.url ?? ""} title={t.title} />;
  if (t.kind === "app")
    return (t.items ?? []).length ? (
      <ul className="divide-y divide-podio-border">
        {(t.items ?? []).map((i) => (
          <li key={i.id} className="py-1.5">
            <Link
              href={i.href}
              className="block truncate text-[15px] text-podio-ink hover:text-podio-teal"
            >
              {i.title}
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-[13px] italic text-podio-disabled">No items yet.</p>
    );
  if (t.groups)
    return (
      <div className="space-y-1.5">
        {t.groups.map((g) => {
          const max = Math.max(...t.groups!.map((x) => x.value), 1);
          return (
            <div key={g.label} className="flex items-center gap-2 text-xs">
              <span className="w-20 truncate text-podio-secondary">{g.label}</span>
              <div className="h-3 flex-1 rounded bg-podio-row-alt">
                <div
                  className="h-3 rounded"
                  style={{ width: `${(g.value / max) * 100}%`, backgroundColor: g.color }}
                />
              </div>
              <span className="w-10 text-right font-medium text-podio-ink">
                {Number.isInteger(g.value) ? g.value : g.value.toFixed(1)}
              </span>
            </div>
          );
        })}
        {t.groups.length === 0 && (
          <p className="text-xs text-podio-disabled">No data</p>
        )}
      </div>
    );
  // count / sum / avg — the big number
  return (
    <p className="mt-1 text-3xl font-semibold text-podio-ink">
      {t.value != null
        ? Number.isInteger(t.value)
          ? t.value.toLocaleString()
          : t.value.toLocaleString(undefined, { maximumFractionDigits: 1 })
        : "—"}
    </p>
  );
}

export function DashboardTiles({
  wsId,
  wsName,
  apps,
  tiles,
}: {
  wsId: string;
  wsName: string;
  apps: TileApp[];
  tiles: TileData[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function addTile(spec: TileSpec): Promise<string | null> {
    const { error } = await supabase.from("dashboard_tiles").insert({
      workspace_id: wsId,
      app_id: spec.appId,
      title: spec.title,
      kind: spec.kind,
      config: spec.config,
    });
    if (error) return error.message;
    setOpen(false);
    router.refresh();
    return null;
  }

  async function removeTile(id: string) {
    await supabase.from("dashboard_tiles").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <div
            key={t.id}
            className={`group rounded border border-podio-border bg-white p-4 ${
              WIDE_KINDS.has(t.kind) ? "sm:col-span-2" : ""
            }`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-podio-meta">
                {t.title}
              </p>
              <button
                onClick={() => removeTile(t.id)}
                title="Remove tile"
                className="hidden text-xs text-podio-disabled hover:text-red-500 group-hover:block"
              >
                ✕
              </button>
            </div>
            <div className="mt-2">
              <TileBody t={t} />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setOpen(true)}
        className="mt-3 rounded border border-podio-border px-3 py-1.5 text-xs text-podio-secondary hover:bg-podio-row-hover"
      >
        + Add tile
      </button>

      <AddTileModal
        open={open}
        onClose={() => setOpen(false)}
        onAdd={addTile}
        apps={apps}
        wsName={wsName}
      />
    </div>
  );
}
