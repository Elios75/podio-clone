"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CURRENCIES,
  FORM_GRID_COLS,
  currencySymbol,
  normalizeColumns,
  splitSections,
  tableColumnTotals,
  type CategoryOption,
  type FieldType,
  type TableColumn,
  type TableRow,
} from "@/lib/fields";
import { PodioIcon } from "@/components/podio-icon";

type Field = {
  id: string;
  label: string;
  type: FieldType;
  is_required: boolean;
  help_text: string | null;
  config: {
    options?: CategoryOption[];
    related_app_id?: string;
    formula?: string;
    multiple?: boolean;
    end_date?: boolean;
    default?: any;
    column?: number; // layout column (multi-column layouts; absent = 0)
    columns?: TableColumn[]; // table field sub-table schema
    currency?: string; // table field money-column currency
  };
};

type Member = { user_id: string; full_name: string | null };
type RelatedItem = { id: string; title: string | null; item_number: number };

const inputCls =
  "w-full rounded border border-podio-border bg-white px-3 py-2 text-[15px] text-podio-ink focus:border-podio-teal focus:outline-none";
const compactInputCls =
  "rounded border border-podio-border bg-white px-3 py-2 text-[15px] text-podio-ink focus:border-podio-teal focus:outline-none";

export function ItemForm({
  appId,
  fields,
  members,
  relatedItemsByField,
  itemId,
  initialValues,
  signedUrls,
  backHref,
  itemName = "Item",
  columns = 1,
}: {
  appId: string;
  fields: Field[];
  members: Member[];
  relatedItemsByField: Record<string, RelatedItem[]>;
  itemId?: string;
  initialValues?: Record<string, any>;
  signedUrls?: Record<string, string>;
  backHref: string;
  itemName?: string;
  // Multi-column layout from apps.layout_settings.columns (absent = 1).
  columns?: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [values, setValues] = useState<Record<string, any>>(initialValues ?? {});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [draftRestored, setDraftRestored] = useState(false);
  const cameraInputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Offline drafts (create mode only): persist typed values on this device so
  // a dropped connection or closed tab doesn't lose the entry.
  const draftKey = `podio-draft-${appId}`;
  const isCreate = !itemId;

  useEffect(() => {
    if (!isCreate) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { values?: Record<string, any> };
      if (draft?.values && Object.keys(draft.values).length > 0) {
        setValues(draft.values);
        setDraftRestored(true);
      }
    } catch {
      // Corrupt draft — ignore it.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isCreate) return;
    const t = setTimeout(() => {
      if (Object.keys(values).length === 0) return;
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ values, savedAt: new Date().toISOString() })
        );
      } catch {
        // Storage full/unavailable — drafts are best-effort.
      }
    }, 500);
    return () => clearTimeout(t);
  }, [values, isCreate, draftKey]);

  function clearDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    setValues(initialValues ?? {});
    setDraftRestored(false);
  }

  function set(fieldId: string, v: any) {
    setValues((prev) => ({ ...prev, [fieldId]: v }));
  }

  async function uploadFile(fieldId: string, file: File) {
    setUploading(fieldId);
    setError(null);
    const path = `${appId}/${crypto.randomUUID()}-${file.name}`;
    const { error: upError } = await supabase.storage
      .from("podio-files")
      .upload(path, file);
    setUploading(null);
    if (upError) {
      setError(upError.message);
      return;
    }
    setLocalPreviews((p) => ({ ...p, [path]: URL.createObjectURL(file) }));
    set(fieldId, { path, name: file.name });
  }

  const fileHref = (path: string) =>
    localPreviews[path] ?? signedUrls?.[path] ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    // Table fields save { rows: [...] } into the value jsonb; an empty table
    // normalizes to null so the field clears like any other empty value.
    const payload: Record<string, any> = { ...values };
    for (const f of fields) {
      if (f.type !== "table" || !(f.id in payload)) continue;
      const rows = payload[f.id]?.rows;
      payload[f.id] =
        Array.isArray(rows) && rows.length > 0 ? { rows } : null;
    }

    const { error: rpcError } = await supabase.rpc("save_item", {
      p_app: appId,
      p_item: itemId ?? null,
      p_values: payload,
    });

    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (isCreate) {
      try {
        localStorage.removeItem(draftKey);
      } catch {}
    }
    router.push(backHref);
    router.refresh();
  }

  function renderInput(f: Field) {
    switch (f.type) {
      case "text":
        return (
          <input required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value)} className={inputCls} />
        );
      case "organization":
      case "location":
        return (
          <input required={f.is_required} value={values[f.id] ?? ""}
            placeholder={f.type === "location" ? "Address" : "Company name"}
            onChange={(e) => set(f.id, e.target.value)} className={inputCls} />
        );
      case "phone":
        return (
          <input type="tel" required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value)} className={inputCls} />
        );
      case "email":
        return (
          <input type="email" required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value)} className={inputCls} />
        );
      case "link":
        return (
          <input type="url" placeholder="https://…" required={f.is_required}
            value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value)} className={inputCls} />
        );
      case "number":
        return (
          <input type="number" step="any" required={f.is_required}
            value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value === "" ? null : Number(e.target.value))}
            className={inputCls} />
        );
      case "money": {
        const v = values[f.id] ?? {};
        return (
          <div className="flex gap-2">
            <input type="number" step="0.01" required={f.is_required}
              placeholder="Amount" value={v.amount ?? ""}
              onChange={(e) =>
                set(f.id, e.target.value === "" ? null : { ...v, amount: Number(e.target.value), currency: v.currency ?? "USD" })
              }
              className={inputCls} />
            <select value={v.currency ?? "USD"}
              onChange={(e) => set(f.id, { ...v, currency: e.target.value })}
              className={compactInputCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        );
      }
      case "progress":
        return (
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={100}
              value={values[f.id] ?? 0}
              onChange={(e) => set(f.id, Number(e.target.value))}
              className="flex-1" />
            <span className="w-12 text-right text-sm text-podio-secondary">
              {values[f.id] ?? 0}%
            </span>
          </div>
        );
      case "duration": {
        const total = values[f.id] ?? 0;
        const h = Math.floor(total / 3600);
        const m = Math.round((total % 3600) / 60);
        return (
          <div className="flex items-center gap-2">
            <input type="number" min={0} value={h || ""}
              placeholder="0"
              onChange={(e) => set(f.id, Number(e.target.value || 0) * 3600 + m * 60)}
              className={`w-20 ${compactInputCls}`} />
            <span className="text-sm text-podio-meta">h</span>
            <input type="number" min={0} max={59} value={m || ""}
              placeholder="0"
              onChange={(e) => set(f.id, h * 3600 + Number(e.target.value || 0) * 60)}
              className={`w-20 ${compactInputCls}`} />
            <span className="text-sm text-podio-meta">m</span>
          </div>
        );
      }
      case "date": {
        const v = values[f.id] ?? {};
        return (
          <div className="flex items-center gap-2">
            <input type="date" required={f.is_required}
              value={v.start ?? ""}
              onChange={(e) =>
                set(f.id, e.target.value ? { ...v, start: e.target.value } : null)}
              className={compactInputCls} />
            {f.config.end_date && (
              <>
                <span className="text-xs text-podio-meta">→</span>
                <input type="date" value={v.end ?? ""}
                  min={v.start ?? undefined}
                  onChange={(e) => set(f.id, { ...v, end: e.target.value || undefined })}
                  className={compactInputCls} />
              </>
            )}
          </div>
        );
      }
      case "category": {
        // Podio-style bordered pill buttons for both single and multi select.
        const multi = !!f.config.multiple;
        const selected: string[] = multi
          ? (Array.isArray(values[f.id]) ? values[f.id] : [])
          : (values[f.id] ? [values[f.id]] : []);
        return (
          <div className="flex flex-wrap gap-2">
            {(f.config.options ?? []).map((o) => {
              const on = selected.includes(o.id);
              return (
                <button key={o.id} type="button"
                  onClick={() => {
                    if (multi) {
                      set(f.id, on
                        ? selected.filter((x) => x !== o.id)
                        : [...selected, o.id]);
                    } else {
                      set(f.id, on ? null : o.id);
                    }
                  }}
                  className={`rounded border bg-white px-5 py-2.5 text-[15px] ${
                    on
                      ? "border-podio-teal font-semibold text-podio-teal"
                      : "border-podio-border text-podio-ink hover:border-podio-teal"}`}>
                  {o.label}
                </button>
              );
            })}
          </div>
        );
      }
      case "contact":
        return (
          <select required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value || null)}
            className={compactInputCls}>
            <option value="">— Select member —</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name ?? m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
        );
      case "relationship":
        return (
          <select required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value || null)}
            className={compactInputCls}>
            <option value="">Type to search for items</option>
            {(relatedItemsByField[f.id] ?? []).map((it) => (
              <option key={it.id} value={it.id}>
                #{it.item_number} {it.title ?? ""}
              </option>
            ))}
          </select>
        );
      case "image":
      case "file": {
        const v = values[f.id];
        return (
          <div className="space-y-2">
            {v?.path && f.type === "image" && fileHref(v.path) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileHref(v.path)!} alt={v.name}
                className="h-24 rounded border border-podio-border object-cover" />
            )}
            {v?.path && f.type === "file" && (
              fileHref(v.path) ? (
                <a href={fileHref(v.path)!} target="_blank"
                  className="text-sm text-podio-teal hover:underline">
                  {v.name}
                </a>
              ) : (
                <span className="text-sm text-podio-secondary">{v.name}</span>
              )
            )}
            <div className="flex items-center gap-2">
              <input type="file"
                accept={f.type === "image" ? "image/*" : undefined}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFile(f.id, file);
                }}
                className="block text-sm" />
              {f.type === "image" && (
                <>
                  <button type="button"
                    onClick={() => cameraInputs.current[f.id]?.click()}
                    className="flex shrink-0 items-center gap-1 rounded border border-podio-border px-2 py-1 text-xs text-podio-secondary hover:bg-podio-row-hover">
                    <PodioIcon icon="camera" className="h-4 w-4" /> Camera
                  </button>
                  <input
                    ref={(el) => { cameraInputs.current[f.id] = el; }}
                    type="file" accept="image/*" capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadFile(f.id, file);
                    }} />
                </>
              )}
            </div>
            {uploading === f.id && (
              <p className="text-xs text-podio-meta">Uploading…</p>
            )}
          </div>
        );
      }
      case "table": {
        // Embedded sub-table (beyond-Podio): editable grid with typed cells,
        // per-row ✕, "+ Add row" and a totals footer for number/money columns.
        const cols = (f.config.columns ?? []) as TableColumn[];
        const rows: TableRow[] = Array.isArray(values[f.id]?.rows)
          ? values[f.id].rows
          : [];
        if (cols.length === 0) {
          return (
            <p className="rounded border border-dashed border-podio-border px-3 py-2 text-sm text-podio-meta">
              No columns yet — add columns to this table in the template editor.
            </p>
          );
        }
        const currency = f.config.currency ?? "USD";
        const numericCols = cols.filter(
          (c) => c.type === "number" || c.type === "money"
        );
        const totals = tableColumnTotals(rows, cols);
        const setRows = (next: TableRow[]) => set(f.id, { rows: next });
        const updCell = (ri: number, colId: string, cv: any) =>
          setRows(rows.map((r, i) => (i === ri ? { ...r, [colId]: cv } : r)));
        const addRow = () =>
          setRows([
            ...rows,
            Object.fromEntries(
              cols.map((c) => [c.id, c.type === "checkbox" ? false : null])
            ) as TableRow,
          ]);
        const cellCls =
          "w-full rounded border border-podio-border bg-white px-2 py-1 text-sm text-podio-ink focus:border-podio-teal focus:outline-none";
        const cell = (row: TableRow, ri: number, c: TableColumn) => {
          const cv = row?.[c.id];
          switch (c.type) {
            case "number":
              return (
                <input type="number" step="any" value={typeof cv === "number" ? cv : ""}
                  onChange={(e) =>
                    updCell(ri, c.id, e.target.value === "" ? null : Number(e.target.value))}
                  className={cellCls} />
              );
            case "money":
              return (
                <div className="flex items-center gap-1">
                  <span className="shrink-0 text-xs text-podio-meta">
                    {currencySymbol(currency)}
                  </span>
                  <input type="number" step="0.01" value={typeof cv === "number" ? cv : ""}
                    onChange={(e) =>
                      updCell(ri, c.id, e.target.value === "" ? null : Number(e.target.value))}
                    className={cellCls} />
                </div>
              );
            case "date":
              return (
                <input type="date" value={typeof cv === "string" ? cv : ""}
                  onChange={(e) => updCell(ri, c.id, e.target.value || null)}
                  className={cellCls} />
              );
            case "checkbox":
              return (
                <div className="flex justify-center">
                  <input type="checkbox" checked={cv === true}
                    onChange={(e) => updCell(ri, c.id, e.target.checked)} />
                </div>
              );
            case "category": {
              const opt = (c.options ?? []).find((o) => o.id === cv);
              return (
                <div className="flex items-center gap-1.5">
                  {opt && (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: opt.color }} />
                  )}
                  <select value={typeof cv === "string" ? cv : ""}
                    onChange={(e) => updCell(ri, c.id, e.target.value || null)}
                    className={cellCls}>
                    <option value="">—</option>
                    {(c.options ?? []).map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
              );
            }
            default:
              return (
                <input value={typeof cv === "string" ? cv : ""}
                  onChange={(e) => updCell(ri, c.id, e.target.value || null)}
                  className={cellCls} />
              );
          }
        };
        return (
          <div className="overflow-x-auto rounded border border-podio-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-podio-row-alt">
                  {cols.map((c) => (
                    <th key={c.id}
                      className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-podio-meta">
                      {c.label}
                    </th>
                  ))}
                  <th className="w-8 px-2 py-1.5" aria-label="Remove row" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="border-t border-podio-border">
                    {cols.map((c) => (
                      <td key={c.id} className="px-1.5 py-1 align-middle">
                        {cell(row, ri, c)}
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center">
                      <button type="button" title="Remove row"
                        onClick={() => setRows(rows.filter((_, i) => i !== ri))}
                        className="text-xs text-podio-meta hover:text-red-600">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr className="border-t border-podio-border">
                    <td colSpan={cols.length + 1}
                      className="px-3 py-3 text-center text-xs text-podio-meta">
                      No rows yet.
                    </td>
                  </tr>
                )}
              </tbody>
              {numericCols.length > 0 && rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-podio-border">
                    {cols.map((c) => (
                      <td key={c.id} className="px-2 py-1.5 text-sm font-semibold text-podio-ink">
                        {c.type === "money" &&
                          `${currencySymbol(currency)}${(totals[c.id] ?? 0).toLocaleString(
                            "en-US", { maximumFractionDigits: 2 })}`}
                        {c.type === "number" &&
                          (totals[c.id] ?? 0).toLocaleString("en-US", {
                            maximumFractionDigits: 2,
                          })}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
            <button type="button" onClick={addRow}
              className="block w-full border-t border-podio-border px-3 py-2 text-left text-sm font-semibold text-podio-teal hover:bg-podio-row-alt">
              + Add row
            </button>
          </div>
        );
      }
      case "calculation": {
        const v = values[f.id];
        return (
          <p className="rounded bg-podio-row-alt px-3 py-2 text-sm text-podio-ink">
            {typeof v === "number" ? (
              <span className="font-medium">= {v.toLocaleString()}</span>
            ) : (
              <span className="text-podio-meta">Computed on save</span>
            )}
            {f.config.formula && (
              <span className="ml-2 font-mono text-xs text-podio-meta">
                {f.config.formula}
              </span>
            )}
          </p>
        );
      }
      default:
        return null;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {draftRestored && (
        <div className="flex items-center justify-between gap-3 rounded border border-[#E3E3E3] bg-[#CDEDED] px-3 py-2 text-sm text-[#136570]">
          <span>Draft restored from this device.</span>
          <span className="flex shrink-0 items-center gap-3">
            <button type="button" onClick={clearDraft}
              className="font-medium underline hover:no-underline">
              clear draft
            </button>
            <button type="button" onClick={() => setDraftRestored(false)}
              aria-label="Dismiss" className="font-medium hover:opacity-70">
              ✕
            </button>
          </span>
        </div>
      )}
      {/* Sections split at separators; each section renders its own N-column
          grid (collapsing to one column on small screens). Separators span
          the full width as a hairline with an optional section label, and
          table fields span the full width too (label on top, grid below). */}
      {(() => {
        const nCols = normalizeColumns(columns);
        return splitSections(fields, nCols, (f) => f.config?.column ?? 0).map(
          (sec, si) => (
            <div key={sec.separator?.id ?? sec.fullWidth?.id ?? `section-${si}`}>
              {sec.separator && (
                <div className="mb-5 border-t border-podio-border pt-3">
                  {sec.separator.label.trim() !== "" && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-podio-meta">
                      {sec.separator.label}
                    </p>
                  )}
                </div>
              )}
              {sec.fullWidth && (
                <div
                  className={`flex flex-col gap-1.5 ${
                    sec.columns.some((c) => c.length > 0) ? "mb-5" : ""
                  }`}
                >
                  <label className="text-[15px] font-semibold text-podio-ink">
                    {sec.fullWidth.is_required && (
                      <span className="text-[#E5484D]">* </span>
                    )}
                    {sec.fullWidth.label}
                  </label>
                  <div className="min-w-0">
                    {renderInput(sec.fullWidth)}
                    {sec.fullWidth.help_text && (
                      <p className="mt-1 text-sm text-podio-meta">
                        {sec.fullWidth.help_text}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div className={`grid grid-cols-1 gap-x-6 ${FORM_GRID_COLS[nCols]}`}>
                {sec.columns.map((colFields, ci) => (
                  <div key={ci} className="min-w-0 space-y-5">
                    {colFields.map((f) => (
                      <div key={f.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                        <label className="text-[15px] font-semibold text-podio-ink sm:w-44 sm:shrink-0 sm:pt-2.5 sm:text-right">
                          {f.is_required && <span className="text-[#E5484D]">* </span>}
                          {f.label}
                        </label>
                        <div className="min-w-0 flex-1">
                          {renderInput(f)}
                          {f.help_text && (
                            <p className="mt-1 text-sm text-podio-meta">{f.help_text}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )
        );
      })()}

      {error && <p className="text-right text-sm text-[#E5484D]">{error}</p>}
      <div className="flex justify-end pt-2">
        <button type="button" onClick={() => router.push(backHref)}
          className="rounded-sm bg-podio-row-hover px-6 py-2.5 text-[15px] font-semibold text-podio-ink hover:bg-podio-border">
          Cancel
        </button>
        <button type="submit" disabled={saving || uploading !== null}
          className="rounded-sm bg-podio-teal px-6 py-2.5 text-[15px] font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50">
          {saving ? "Saving…" : `Save ${itemName}`}
        </button>
      </div>
    </form>
  );
}
