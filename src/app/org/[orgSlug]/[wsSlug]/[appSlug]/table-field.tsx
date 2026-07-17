"use client";

// Embedded table-field grid (beyond-Podio): typed cell inputs, per-row remove,
// "+ Add row" and a number/money totals footer. Adds two definition-level
// column affordances the user asked for:
//   • drag-to-resize column widths (pointer capture, mirrors sheet-table.tsx)
//   • drag-to-reorder columns (HTML5 DnD on the header cells)
// Both persist onto app_fields.config.columns (order + `width` per column) via
// a direct update — RLS `p_app_fields_write` (can_edit_items) gates it, and the
// change applies for every user and every record, plus the template editor.
//
// Row DATA is keyed by column *id* inside value.rows, so reordering columns is
// purely a display/definition change and never rewrites a single cell value.

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  currencySymbol,
  tableColumnTotals,
  type TableColumn,
  type TableRow,
} from "@/lib/fields";

const MIN_WIDTH = 80;
const MAX_WIDTH = 560;
const DRAG_THRESHOLD = 3;

export function TableField({
  fieldId,
  config,
  value,
  onChange,
}: {
  fieldId: string;
  config: { columns?: TableColumn[]; currency?: string };
  value: { rows?: TableRow[] } | null | undefined;
  onChange: (value: { rows: TableRow[] }) => void;
}) {
  const supabase = createClient();
  const [columns, setColumns] = useState<TableColumn[]>(config.columns ?? []);
  const [savingCols, setSavingCols] = useState(false);
  const [dragCol, setDragCol] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);

  const rows: TableRow[] = Array.isArray(value?.rows) ? value!.rows! : [];
  const currency = config.currency ?? "USD";
  const numericCols = columns.filter((c) => c.type === "number" || c.type === "money");
  const totals = tableColumnTotals(rows, columns);
  const anyFixed = columns.some((c) => typeof c.width === "number");

  // ----- Row data (keyed by column id) -----
  const setRows = (next: TableRow[]) => onChange({ rows: next });
  const updCell = (ri: number, colId: string, cv: any) =>
    setRows(rows.map((r, i) => (i === ri ? { ...r, [colId]: cv } : r)));
  const addRow = () =>
    setRows([
      ...rows,
      Object.fromEntries(
        columns.map((c) => [c.id, c.type === "checkbox" ? false : null])
      ) as TableRow,
    ]);

  // ----- Persist column order/width to the field definition -----
  async function persistColumns(next: TableColumn[]) {
    setColumns(next);
    setSavingCols(true);
    // Preserve every other config key (currency, etc.); only columns change.
    await supabase
      .from("app_fields")
      .update({ config: { ...config, columns: next } })
      .eq("id", fieldId);
    setSavingCols(false);
  }

  // ----- Column resize (pointer capture; resizingRef blocks header drag) -----
  const resizeRef = useRef<{
    index: number;
    startX: number;
    startWidth: number;
    lastWidth: number;
  } | null>(null);
  const resizingRef = useRef(false);

  function onHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.closest("th");
    const startWidth =
      columns[index]?.width ?? Math.round(th?.getBoundingClientRect().width ?? 150);
    resizeRef.current = { index, startX: e.clientX, startWidth, lastWidth: startWidth };
    resizingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = resizeRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) < DRAG_THRESHOLD && d.lastWidth === d.startWidth) return;
    const w = Math.min(Math.max(Math.round(d.startWidth + dx), MIN_WIDTH), MAX_WIDTH);
    if (w === d.lastWidth) return;
    d.lastWidth = w;
    setColumns((prev) => prev.map((c, i) => (i === d.index ? { ...c, width: w } : c)));
  }

  function onHandlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = resizeRef.current;
    resizeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // Defer clearing the guard so the click that follows pointerup is swallowed.
    setTimeout(() => (resizingRef.current = false), 0);
    if (d && d.lastWidth !== d.startWidth) {
      persistColumns(columns.map((c, i) => (i === d.index ? { ...c, width: d.lastWidth } : c)));
    }
  }

  function resetWidth(index: number) {
    persistColumns(
      columns.map((c, i) => {
        if (i !== index) return c;
        const { width: _drop, ...rest } = c;
        return rest;
      })
    );
  }

  // ----- Column reorder (HTML5 DnD on headers) -----
  function onColDrop(target: number) {
    const from = dragCol;
    setDragCol(null);
    setDragOverCol(null);
    if (from === null || from === target) return;
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    persistColumns(next);
  }

  function cell(row: TableRow, ri: number, c: TableColumn) {
    const cv = row?.[c.id];
    const cellCls =
      "w-full rounded border border-podio-border bg-white px-2 py-1 text-sm text-podio-ink focus:border-podio-teal focus:outline-none";
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
            <span className="shrink-0 text-xs text-podio-meta">{currencySymbol(currency)}</span>
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
  }

  if (columns.length === 0) {
    return (
      <p className="rounded border border-dashed border-podio-border px-3 py-2 text-sm text-podio-meta">
        No columns yet — add columns to this table in the template editor.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-podio-border">
      <table
        className="w-full text-sm"
        style={anyFixed ? { tableLayout: "fixed" } : undefined}
      >
        <colgroup>
          {columns.map((c) => (
            <col key={c.id} style={c.width ? { width: c.width } : undefined} />
          ))}
          <col style={{ width: 36 }} />
        </colgroup>
        <thead>
          <tr className="bg-podio-row-alt">
            {columns.map((c, ci) => (
              <th
                key={c.id}
                draggable={!resizingRef.current}
                onDragStart={(e) => {
                  if (resizingRef.current) return e.preventDefault();
                  setDragCol(ci);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (dragCol === null) return;
                  e.preventDefault();
                  setDragOverCol(ci);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onColDrop(ci);
                }}
                onDragEnd={() => {
                  setDragCol(null);
                  setDragOverCol(null);
                }}
                title="Drag to reorder"
                className={`group/th relative cursor-grab select-none px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-podio-meta active:cursor-grabbing ${
                  dragOverCol === ci && dragCol !== ci ? "border-l-2 border-podio-teal" : ""
                } ${dragCol === ci ? "opacity-40" : ""}`}
              >
                <span className="block truncate pr-1">{c.label}</span>
                {/* Right-edge resize grab zone (draggable={false} so it never
                    starts a column reorder). */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  draggable={false}
                  title="Drag to resize · double-click to reset"
                  onPointerDown={(e) => onHandlePointerDown(e, ci)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onPointerCancel={onHandlePointerUp}
                  onDoubleClick={(e) => { e.stopPropagation(); resetWidth(ci); }}
                  onClick={(e) => e.stopPropagation()}
                  onDragStart={(e) => e.preventDefault()}
                  className="group/handle absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none select-none"
                >
                  <span className="absolute inset-y-0 right-0 w-px bg-podio-border opacity-0 group-hover/th:opacity-100 group-hover/handle:bg-podio-teal" />
                </div>
              </th>
            ))}
            <th className="w-9 px-2 py-1.5" aria-label="Remove row" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-podio-border">
              {columns.map((c) => (
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
              <td colSpan={columns.length + 1}
                className="px-3 py-3 text-center text-xs text-podio-meta">
                No rows yet.
              </td>
            </tr>
          )}
        </tbody>
        {numericCols.length > 0 && rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-podio-border">
              {columns.map((c) => (
                <td key={c.id} className="px-2 py-1.5 text-sm font-semibold text-podio-ink">
                  {c.type === "money" &&
                    `${currencySymbol(currency)}${(totals[c.id] ?? 0).toLocaleString(
                      "en-US", { maximumFractionDigits: 2 })}`}
                  {c.type === "number" &&
                    (totals[c.id] ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}
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
      {savingCols && (
        <span className="sr-only" role="status">Saving column layout…</span>
      )}
    </div>
  );
}
