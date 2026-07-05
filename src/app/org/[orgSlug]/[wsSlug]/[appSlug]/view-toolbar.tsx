"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";
import type { CategoryOption, FieldType } from "@/lib/fields";

type Field = {
  id: string;
  label: string;
  type: FieldType;
  config: { options?: CategoryOption[] };
};
type Member = { user_id: string; full_name: string | null };
export type Filter = { field_id: string; op: string; value?: any };
export type Sort = { field_id: string; dir: "asc" | "desc" };
export type LayoutToggle = {
  key: string;
  label: string;
  href?: string;
  disabledTitle?: string;
};

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

// Podio view toolbar: filter cluster + item count on the left; layout toggles
// (active = orange pill, inactive = plain teal) and the single solid-teal
// "Add <item>" action on the right. Filter/sort/column editing lives in a
// collapsible white panel underneath.
// See docs/design/podio-design-skill/references/layouts.md §4.
export function ViewToolbar({
  appId,
  baseHref,
  layout, // "table" | "board" | "calendar" | "badge" | "stream"
  layouts,
  newHref,
  itemName,
  filteredCount,
  totalCount,
  fields,
  members,
  activeViewId,
  initialFilters,
  initialSort,
  tableFields,
  initialCols,
}: {
  appId: string;
  baseHref: string;
  layout: string;
  layouts: LayoutToggle[];
  newHref: string;
  itemName: string;
  filteredCount: number;
  totalCount: number;
  fields: Field[];
  members: Member[];
  activeViewId: string | null;
  initialFilters: Filter[];
  initialSort: Sort[];
  tableFields: { id: string; label: string }[];
  initialCols: string[] | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const filterable = fields.filter(
    (f) => !["separator", "calculation", "image", "file", "relationship"].includes(f.type)
  );
  const [filters, setFilters] = useState<Filter[]>(initialFilters);
  const [sortField, setSortField] = useState(initialSort[0]?.field_id ?? "");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSort[0]?.dir ?? "asc");
  const [panelOpen, setPanelOpen] = useState(
    initialFilters.length > 0 || initialSort.length > 0
  );
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const [makeDefault, setMakeDefault] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [cols, setCols] = useState<string[] | null>(initialCols);

  function toggleCol(id: string) {
    const current = cols ?? tableFields.map((f) => f.id);
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    setCols(next.length === tableFields.length ? null : next);
  }
  const [error, setError] = useState<string | null>(null);

  const activeFilterCount = filters.filter((f) => f.field_id && f.op).length;

  function buildQuery(extra?: Record<string, string>) {
    const q = new URLSearchParams();
    if (layout !== "table") q.set("view", layout);
    const clean = filters.filter((f) => f.field_id && f.op);
    if (clean.length) q.set("f", JSON.stringify(clean));
    if (sortField) q.set("s", JSON.stringify([{ field_id: sortField, dir: sortDir }]));
    if (cols && cols.length > 0) q.set("cols", cols.join(","));
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
    return q.toString();
  }

  function apply() {
    router.push(`${baseHref}?${buildQuery()}`);
  }

  function showAll() {
    setFilters([]);
    router.push(layout !== "table" ? `${baseHref}?view=${layout}` : baseHref);
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
        columns: cols,
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
          className="rounded border border-podio-border px-2 py-1 text-sm">
          <option value="">— option —</option>
          {(field.config.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      );
    if (field.type === "contact")
      return (
        <select value={flt.value ?? ""} onChange={(e) => setVal(e.target.value)}
          className="rounded border border-podio-border px-2 py-1 text-sm">
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
          className="rounded border border-podio-border px-2 py-1 text-sm" />
      );
    if (opGroup(field.type) === "numberish")
      return (
        <input type="number" step="any" value={flt.value ?? ""}
          onChange={(e) => setVal(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-28 rounded border border-podio-border px-2 py-1 text-sm" />
      );
    return (
      <input value={flt.value ?? ""} onChange={(e) => setVal(e.target.value)}
        placeholder="value"
        className="w-36 rounded border border-podio-border px-2 py-1 text-sm" />
    );
  }

  return (
    <div className="mt-1">
      {/* Main toolbar row */}
      <div className="flex flex-wrap items-center gap-3 py-2 text-[15px]">
        {/* Quiet layout/sort affordances (visual parity with Podio) */}
        <span className="text-podio-secondary" aria-hidden>
          <PodioIcon icon="grid" className="h-5 w-5" />
        </span>
        <span className="text-podio-secondary" aria-hidden>
          <PodioIcon icon="sort" className="h-5 w-5" />
        </span>
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="flex items-center gap-1.5 text-podio-secondary hover:text-podio-ink"
          title="Filter & sort"
        >
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-[#4E5E5E] px-1.5 text-xs font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
          <PodioIcon icon="funnel" className="h-5 w-5" />
        </button>
        <span className="text-podio-secondary">
          {filteredCount.toLocaleString()} of {totalCount.toLocaleString()}
        </span>
        {activeFilterCount > 0 && (
          <button onClick={showAll} className="text-podio-teal hover:underline">
            Show all
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-4">
          {layouts.map((l) =>
            l.key === layout ? (
              <span
                key={l.key}
                className="rounded bg-podio-orange px-3 py-1.5 font-semibold text-white"
              >
                {l.label}
              </span>
            ) : l.href ? (
              <Link key={l.key} href={l.href} className="text-podio-teal hover:underline">
                {l.label}
              </Link>
            ) : (
              <span
                key={l.key}
                title={l.disabledTitle}
                className="cursor-not-allowed text-podio-disabled"
              >
                {l.label}
              </span>
            )
          )}
          <Link
            href={newHref}
            className="rounded bg-podio-teal px-4 py-2 text-sm font-semibold text-white hover:bg-podio-teal-dark"
          >
            Add {itemName}
          </Link>
        </div>
      </div>

      {panelOpen && (
        <div className="rounded border border-podio-border bg-white p-3 shadow-sm">
          {/* Sort row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-podio-meta">Sort:</span>
            <select value={sortField} onChange={(e) => setSortField(e.target.value)}
              className="rounded border border-podio-border px-2 py-1 text-sm">
              <option value="">Created (newest)</option>
              {filterable.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            {sortField && (
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value as any)}
                className="rounded border border-podio-border px-2 py-1 text-sm">
                <option value="asc">↑ asc</option>
                <option value="desc">↓ desc</option>
              </select>
            )}
            {activeViewId && (
              <button onClick={() => deleteView(activeViewId)}
                className="ml-auto text-xs text-podio-meta hover:text-red-600">
                delete view
              </button>
            )}
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
                    className="rounded border border-podio-border px-2 py-1 text-sm"
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
                      className="rounded border border-podio-border px-2 py-1 text-sm">
                      {ops.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                  {valueInput(flt, i)}
                  <button
                    onClick={() => setFilters(filters.filter((_, xi) => xi !== i))}
                    className="text-xs text-podio-meta hover:text-red-600"
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
              className="rounded border border-podio-border px-2 py-1 text-xs text-podio-ink hover:bg-podio-row-alt"
            >
              + Add filter
            </button>
            <button
              onClick={() => setColsOpen(!colsOpen)}
              className="rounded border border-podio-border px-2 py-1 text-xs text-podio-ink hover:bg-podio-row-alt"
            >
              Columns {cols ? `(${cols.length}/${tableFields.length})` : "▾"}
            </button>
            {colsOpen && (
              <span className="flex flex-wrap gap-x-3 gap-y-1 rounded border border-podio-border bg-podio-row-alt px-2 py-1">
                {tableFields.map((f) => (
                  <label key={f.id} className="flex items-center gap-1 text-xs text-podio-secondary">
                    <input
                      type="checkbox"
                      checked={(cols ?? tableFields.map((x) => x.id)).includes(f.id)}
                      onChange={() => toggleCol(f.id)}
                    />
                    {f.label}
                  </label>
                ))}
              </span>
            )}
            <button onClick={apply}
              className="rounded bg-podio-teal px-3 py-1 text-xs font-semibold text-white hover:bg-podio-teal-dark">
              Apply
            </button>
            <button onClick={() => setSaveOpen(!saveOpen)}
              className="rounded border border-podio-border px-2 py-1 text-xs text-podio-ink hover:bg-podio-row-alt">
              Save as view…
            </button>
            {saveOpen && (
              <span className="flex items-center gap-2">
                <input placeholder="View name" value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                  className="rounded border border-podio-border px-2 py-1 text-sm" />
                <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}
                  className="rounded border border-podio-border px-2 py-1 text-sm">
                  <option value="team">Team view</option>
                  <option value="private">Private view</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-podio-secondary">
                  <input type="checkbox" checked={makeDefault}
                    onChange={(e) => setMakeDefault(e.target.checked)} />
                  default view
                </label>
                <button onClick={saveView}
                  className="rounded bg-podio-teal px-3 py-1 text-xs font-semibold text-white hover:bg-podio-teal-dark">
                  Save
                </button>
              </span>
            )}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
