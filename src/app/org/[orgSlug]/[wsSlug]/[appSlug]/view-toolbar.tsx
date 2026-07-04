"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CategoryOption, FieldType } from "@/lib/fields";

type Field = {
  id: string;
  label: string;
  type: FieldType;
  config: { options?: CategoryOption[] };
};
type Member = { user_id: string; full_name: string | null };
type SavedView = { id: string; name: string; visibility: string };
export type Filter = { field_id: string; op: string; value?: any };
export type Sort = { field_id: string; dir: "asc" | "desc" };

const OPS: Record<string, { value: string; label: string; needsValue: boolean }[]> = {
  textish: [
    { value: "contains", label: "contains", needsValue: true },
    { value: "equals", label: "equals", needsValue: true },
    { value: "not_empty", label: "is not empty", needsValue: false },
    { value: "is_empty", label: "is empty", needsValue: false },
  ],
  numberish: [
    { value: "eq", label: "=", needsValue: true },
    { value: "gt", label: ">", needsValue: true },
    { value: "gte", label: "≥", needsValue: true },
    { value: "lt", label: "<", needsValue: true },
    { value: "lte", label: "≤", needsValue: true },
  ],
  date: [
    { value: "on", label: "on", needsValue: true },
    { value: "before", label: "before", needsValue: true },
    { value: "after", label: "after", needsValue: true },
  ],
  select: [
    { value: "is", label: "is", needsValue: true },
    { value: "is_not", label: "is not", needsValue: true },
    { value: "not_empty", label: "is not empty", needsValue: false },
    { value: "is_empty", label: "is empty", needsValue: false },
  ],
};

function opGroup(t: FieldType): keyof typeof OPS {
  if (["number", "money", "progress", "duration"].includes(t)) return "numberish";
  if (t === "date") return "date";
  if (["category", "contact"].includes(t)) return "select";
  return "textish";
}

export function ViewToolbar({
  appId,
  baseHref,
  layout, // "table" | "board" | "calendar"
  fields,
  members,
  savedViews,
  activeViewId,
  initialFilters,
  initialSort,
}: {
  appId: string;
  baseHref: string;
  layout: string;
  fields: Field[];
  members: Member[];
  savedViews: SavedView[];
  activeViewId: string | null;
  initialFilters: Filter[];
  initialSort: Sort[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const filterable = fields.filter(
    (f) => !["separator", "calculation", "image", "file", "relationship"].includes(f.type)
  );
  const [filters, setFilters] = useState<Filter[]>(initialFilters);
  const [sortField, setSortField] = useState(initialSort[0]?.field_id ?? "");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSort[0]?.dir ?? "asc");
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const [makeDefault, setMakeDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildQuery(extra?: Record<string, string>) {
    const q = new URLSearchParams();
    if (layout !== "table") q.set("view", layout);
    const clean = filters.filter((f) => f.field_id && f.op);
    if (clean.length) q.set("f", JSON.stringify(clean));
    if (sortField) q.set("s", JSON.stringify([{ field_id: sortField, dir: sortDir }]));
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
    return q.toString();
  }

  function apply() {
    router.push(`${baseHref}?${buildQuery()}`);
  }

  async function saveView() {
    setError(null);
    if (!viewName.trim()) return setError("View name required.");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: view, error: insError } = await supabase
      .from("app_views")
      .insert({
        app_id: appId,
        name: viewName,
        layout: layout === "board" ? "card" : layout,
        visibility,
        owner_id: user?.id,
        filters: filters.filter((f) => f.field_id && f.op),
        sort: sortField ? [{ field_id: sortField, dir: sortDir }] : [],
      })
      .select()
      .single();
    if (insError) return setError(insError.message);
    if (makeDefault) {
      await supabase.from("app_views").update({ is_default: false })
        .eq("app_id", appId).neq("id", view.id);
      await supabase.from("app_views").update({ is_default: true })
        .eq("id", view.id);
    }
    setSaveOpen(false);
    setViewName("");
    router.push(`${baseHref}?viewId=${view.id}`);
    router.refresh();
  }

  async function deleteView(id: string) {
    await supabase.from("app_views").delete().eq("id", id);
    router.push(baseHref);
    router.refresh();
  }

  function valueInput(flt: Filter, i: number) {
    const field = filterable.find((f) => f.id === flt.field_id);
    if (!field) return null;
    const ops = OPS[opGroup(field.type)];
    const op = ops.find((o) => o.value === flt.op);
    if (!op?.needsValue) return null;

    const setVal = (v: any) =>
      setFilters(filters.map((x, xi) => (xi === i ? { ...x, value: v } : x)));

    if (field.type === "category")
      return (
        <select value={flt.value ?? ""} onChange={(e) => setVal(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm">
          <option value="">— option —</option>
          {(field.config.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      );
    if (field.type === "contact")
      return (
        <select value={flt.value ?? ""} onChange={(e) => setVal(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm">
          <option value="">— member —</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name ?? m.user_id.slice(0, 8)}
            </option>
          ))}
        </select>
      );
    if (field.type === "date")
      return (
        <input type="date" value={flt.value ?? ""} onChange={(e) => setVal(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm" />
      );
    if (opGroup(field.type) === "numberish")
      return (
        <input type="number" step="any" value={flt.value ?? ""}
          onChange={(e) => setVal(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-28 rounded border border-slate-300 px-2 py-1 text-sm" />
      );
    return (
      <input value={flt.value ?? ""} onChange={(e) => setVal(e.target.value)}
        placeholder="value"
        className="w-36 rounded border border-slate-300 px-2 py-1 text-sm" />
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
      {/* Saved views row */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={activeViewId ?? ""}
          onChange={(e) => {
            const id = e.target.value;
            router.push(id ? `${baseHref}?viewId=${id}` : baseHref);
          }}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All items</option>
          {savedViews.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} {v.visibility === "private" ? "🔒" : ""}
            </option>
          ))}
        </select>
        {activeViewId && (
          <button onClick={() => deleteView(activeViewId)}
            className="text-xs text-slate-400 hover:text-red-600">
            delete view
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">Sort:</span>
          <select value={sortField} onChange={(e) => setSortField(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm">
            <option value="">Created (newest)</option>
            {filterable.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          {sortField && (
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value as any)}
              className="rounded border border-slate-300 px-2 py-1 text-sm">
              <option value="asc">↑ asc</option>
              <option value="desc">↓ desc</option>
            </select>
          )}
        </div>
      </div>

      {/* Filter rows */}
      <div className="mt-2 space-y-2">
        {filters.map((flt, i) => {
          const field = filterable.find((f) => f.id === flt.field_id);
          const ops = field ? OPS[opGroup(field.type)] : [];
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={flt.field_id}
                onChange={(e) => {
                  const fid = e.target.value;
                  const nf = filterable.find((f) => f.id === fid);
                  setFilters(filters.map((x, xi) =>
                    xi === i
                      ? { field_id: fid, op: nf ? OPS[opGroup(nf.type)][0].value : "", value: "" }
                      : x
                  ));
                }}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="">— field —</option>
                {filterable.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              {field && (
                <select value={flt.op}
                  onChange={(e) =>
                    setFilters(filters.map((x, xi) => (xi === i ? { ...x, op: e.target.value } : x)))
                  }
                  className="rounded border border-slate-300 px-2 py-1 text-sm">
                  {ops.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
              {valueInput(flt, i)}
              <button
                onClick={() => setFilters(filters.filter((_, xi) => xi !== i))}
                className="text-xs text-slate-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilters([...filters, { field_id: "", op: "", value: "" }])}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          + Add filter
        </button>
        <button onClick={apply}
          className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700">
          Apply
        </button>
        <button onClick={() => setSaveOpen(!saveOpen)}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
          Save as view…
        </button>
        {saveOpen && (
          <span className="flex items-center gap-2">
            <input placeholder="View name" value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm" />
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}
              className="rounded border border-slate-300 px-2 py-1 text-sm">
              <option value="team">Team view</option>
              <option value="private">Private view</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={makeDefault}
                onChange={(e) => setMakeDefault(e.target.checked)} />
              default view
            </label>
            <button onClick={saveView}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">
              Save
            </button>
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
