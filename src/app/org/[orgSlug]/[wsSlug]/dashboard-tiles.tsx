"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AppInfo = {
  id: string;
  name: string;
  numberFields: { id: string; label: string }[];
  categoryFields: { id: string; label: string }[];
};

export type TileData = {
  id: string;
  title: string;
  kind: string;
  value?: number;
  groups?: { label: string; color: string; value: number }[];
};

export function DashboardTiles({
  wsId,
  apps,
  tiles,
}: {
  wsId: string;
  apps: AppInfo[];
  tiles: TileData[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [appId, setAppId] = useState("");
  const [kind, setKind] = useState("count");
  const [numberField, setNumberField] = useState("");
  const [groupField, setGroupField] = useState("");
  const [error, setError] = useState<string | null>(null);

  const app = apps.find((a) => a.id === appId);

  async function addTile() {
    setError(null);
    if (!title.trim() || !appId) return setError("Title and app required.");
    if ((kind === "sum" || kind === "avg") && !numberField)
      return setError("Pick a number field.");
    if (kind === "grouped" && !groupField)
      return setError("Pick a category field to group by.");
    // "fieldId:columnId" = a numeric column inside a table field (the picker
    // lists them as "Invoices → Amount"); split back into the two config keys.
    const [numFieldId, tableColumnId] = numberField.split(":");
    const { error: insError } = await supabase.from("dashboard_tiles").insert({
      workspace_id: wsId,
      app_id: appId,
      title,
      kind,
      config: {
        number_field_id: numFieldId || null,
        table_column_id: tableColumnId || null,
        group_field_id: groupField || null,
      },
    });
    if (insError) return setError(insError.message);
    setOpen(false);
    setTitle("");
    router.refresh();
  }

  async function removeTile(id: string) {
    await supabase.from("dashboard_tiles").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.id} className="group rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {t.title}
              </p>
              <button onClick={() => removeTile(t.id)}
                className="hidden text-xs text-slate-300 hover:text-red-500 group-hover:block">
                ✕
              </button>
            </div>
            {t.groups ? (
              <div className="mt-2 space-y-1.5">
                {t.groups.map((g) => {
                  const max = Math.max(...t.groups!.map((x) => x.value), 1);
                  return (
                    <div key={g.label} className="flex items-center gap-2 text-xs">
                      <span className="w-20 truncate text-slate-500">{g.label}</span>
                      <div className="h-3 flex-1 rounded bg-slate-100">
                        <div className="h-3 rounded"
                          style={{ width: `${(g.value / max) * 100}%`, backgroundColor: g.color }} />
                      </div>
                      <span className="w-10 text-right font-medium">
                        {Number.isInteger(g.value) ? g.value : g.value.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
                {t.groups.length === 0 && (
                  <p className="text-xs text-slate-300">No data</p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-3xl font-semibold">
                {t.value != null
                  ? Number.isInteger(t.value)
                    ? t.value.toLocaleString()
                    : t.value.toLocaleString(undefined, { maximumFractionDigits: 1 })
                  : "—"}
              </p>
            )}
          </div>
        ))}
      </div>

      {open ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-podio-border bg-white p-3 text-sm">
          <input placeholder="Tile title" value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <select value={appId} onChange={(e) => { setAppId(e.target.value); setNumberField(""); setGroupField(""); }}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">— app —</option>
            {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="count">Count</option>
            <option value="sum">Sum</option>
            <option value="avg">Average</option>
            <option value="grouped">Grouped chart</option>
          </select>
          {(kind === "sum" || kind === "avg" || (kind === "grouped" && app?.numberFields.length)) && app && (
            <select value={numberField} onChange={(e) => setNumberField(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">{kind === "grouped" ? "count items" : "— number field —"}</option>
              {app.numberFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
          {kind === "grouped" && app && (
            <select value={groupField} onChange={(e) => setGroupField(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">— group by —</option>
              {app.categoryFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
          <button onClick={addTile}
            className="rounded bg-podio-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-podio-teal-dark">
            Add
          </button>
          <button onClick={() => setOpen(false)}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">
            Cancel
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      ) : (
        <button onClick={() => setOpen(true)}
          className="mt-3 rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
          + Add tile
        </button>
      )}
    </div>
  );
}
