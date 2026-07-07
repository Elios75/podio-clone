"use client";

// Sheet (table) view chrome: click-to-sort column headers + drag-to-resize
// column widths. Row CELLS are rendered on the SERVER (page.tsx `render()`)
// and passed in as ReactNodes, so field rendering — signed URLs, member
// names, category chips — stays exactly where it was; this component only
// owns the <table> skeleton, header affordances and column geometry.
//
// Sorting reuses the view toolbar's URL convention: `?s=` holds a JSON
// array of { field_id, dir } that the server feeds to the query_items RPC
// as p_sort. Header clicks cycle asc → desc → clear, preserving every other
// search param (f, cols, viewId, …) so filters and saved views keep working.
//
// Column widths are a client-only preference persisted per app in
// localStorage `podio.sheet-widths.${appId}` as { [fieldId]: px }. They are
// hydrated in a useEffect so the FIRST client render matches SSR (no
// hydration mismatch); widths apply as inline styles on <col> elements
// (dynamic Tailwind class names never compile) and the table flips to
// table-layout: fixed once any custom width exists. Double-clicking a
// resize handle resets that column. Resizable columns are a deliberate
// beyond-Podio affordance — see layouts.md §5.

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Sort } from "./view-toolbar";

export type SheetColumn = {
  id: string;
  label: string;
  // False for NON_SORTABLE_FIELD_TYPES (image, file, table, …): the header
  // renders as plain text, matching the toolbar's sort-field exclusions.
  sortable: boolean;
};

export type SheetRow = {
  id: string;
  // The teal item-number link (server-rendered <Link>).
  numberCell: ReactNode;
  // One server-rendered cell per entry in `columns`, same order.
  cells: ReactNode[];
};

const MIN_WIDTH = 80;
const MAX_WIDTH = 640;
const DRAG_THRESHOLD = 3; // px of movement before a pointerdown counts as a drag

export function SheetTable({
  appId,
  columns,
  rows,
  sort,
  activeViewId,
  emptyText,
}: {
  appId: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  sort: Sort[];
  activeViewId: string | null;
  emptyText: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ----- Header sorting (same ?s= JSON + query_items path as the toolbar) --
  const activeSort = sort[0] ?? null;

  function toggleSort(fieldId: string) {
    const q = new URLSearchParams(searchParams.toString());
    if (activeSort?.field_id === fieldId && activeSort.dir === "asc") {
      q.set("s", JSON.stringify([{ field_id: fieldId, dir: "desc" }]));
    } else if (activeSort?.field_id === fieldId && activeSort.dir === "desc") {
      // Third click clears. If a saved view is in play its own sort would
      // win again on a bare URL, so pin an explicit empty sort instead.
      if (activeViewId || q.has("viewId")) q.set("s", "[]");
      else q.delete("s");
    } else {
      q.set("s", JSON.stringify([{ field_id: fieldId, dir: "asc" }]));
    }
    // Pin the active saved view: the server only auto-applies the default
    // view when NO state params are present, so adding ?s= without this
    // would silently drop the view's filters/columns.
    if (activeViewId && !q.has("viewId")) q.set("viewId", activeViewId);
    const qs = q.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // ----- Column widths (localStorage, hydrated post-mount) ----------------
  const storageKey = `podio.sheet-widths.${appId}`;
  const [widths, setWidths] = useState<Record<string, number>>({});
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  useEffect(() => {
    // localStorage is read ONLY here so SSR and the first client render
    // agree (auto layout); stored widths appear right after hydration.
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) {
          clean[k] = Math.min(Math.max(Math.round(v), MIN_WIDTH), MAX_WIDTH);
        }
      }
      if (Object.keys(clean).length) setWidths(clean);
    } catch {
      // Corrupt storage: ignore, fall back to auto widths.
    }
  }, [storageKey]);

  function persist(next: Record<string, number>) {
    try {
      if (Object.keys(next).length) {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Storage full/blocked: resize still works for the session.
    }
  }

  // Live drag state in refs (no re-render churn); `dragged` doubles as the
  // guard that keeps a resize from firing the header's sort click.
  const dragRef = useRef<{
    fieldId: string;
    startX: number;
    startWidth: number;
    lastWidth: number;
  } | null>(null);
  const draggedRef = useRef(false);

  function onHandlePointerDown(
    e: ReactPointerEvent<HTMLDivElement>,
    fieldId: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.closest("th");
    const startWidth =
      widthsRef.current[fieldId] ??
      Math.round(th?.getBoundingClientRect().width ?? 150);
    dragRef.current = { fieldId, startX: e.clientX, startWidth, lastWidth: startWidth };
    draggedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!draggedRef.current && Math.abs(dx) < DRAG_THRESHOLD) return;
    draggedRef.current = true;
    const w = Math.min(Math.max(Math.round(d.startWidth + dx), MIN_WIDTH), MAX_WIDTH);
    if (w === d.lastWidth) return;
    d.lastWidth = w;
    setWidths((prev) => ({ ...prev, [d.fieldId]: w }));
  }

  function onHandlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (d && draggedRef.current) {
      persist({ ...widthsRef.current, [d.fieldId]: d.lastWidth });
    }
  }

  function onHandleDoubleClick(
    e: ReactMouseEvent<HTMLDivElement>,
    fieldId: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    const next = { ...widthsRef.current };
    delete next[fieldId];
    setWidths(next);
    persist(next);
  }

  const anyFixed = Object.keys(widths).length > 0;

  return (
    // Sheet sits directly on the white surface (no floating card wrapper);
    // the table keeps its own header background and row hairlines.
    <div className="overflow-x-auto">
      <table
        className="w-full text-left text-[15px]"
        style={anyFixed ? { tableLayout: "fixed" } : undefined}
      >
        {/* Pixel widths live on <col>s: one place, header + body agree. */}
        <colgroup>
          <col style={{ width: 40 }} />
          <col style={{ width: 64 }} />
          {columns.map((c) => (
            <col
              key={c.id}
              style={widths[c.id] ? { width: widths[c.id] } : undefined}
            />
          ))}
        </colgroup>
        <thead className="bg-podio-row-alt font-semibold text-podio-ink">
          <tr>
            {/* Leading row-index and # columns stay non-sortable. */}
            <th className="border-b border-podio-border px-2 py-2" />
            <th className="border-b border-podio-border px-3 py-2 font-semibold">
              #
            </th>
            {columns.map((c) => {
              const isActive = activeSort?.field_id === c.id;
              return (
                <th
                  key={c.id}
                  className="group/th relative border-b border-podio-border p-0 font-semibold"
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (draggedRef.current) {
                          draggedRef.current = false;
                          return; // a resize just ended: swallow the click
                        }
                        toggleSort(c.id);
                      }}
                      title={
                        isActive && activeSort!.dir === "asc"
                          ? `Sort ${c.label} descending`
                          : isActive
                          ? "Clear sort"
                          : `Sort by ${c.label}`
                      }
                      className="group/sort block w-full truncate px-3 py-2 text-left font-semibold hover:bg-podio-row-hover"
                    >
                      {c.label}
                      {isActive ? (
                        <span aria-hidden className="ml-1 text-podio-teal">
                          {activeSort!.dir === "asc" ? "▲" : "▼"}
                        </span>
                      ) : (
                        // Always-visible faint cue that this header sorts;
                        // brightens on hover.
                        <span
                          aria-hidden
                          className="ml-1 text-podio-disabled opacity-40 group-hover/sort:opacity-90"
                        >
                          ↕
                        </span>
                      )}
                    </button>
                  ) : (
                    <span className="block truncate px-3 py-2">{c.label}</span>
                  )}
                  {/* 6px resize grab zone on the header's right edge:
                      invisible until the header is hovered (1px border-grey
                      line), teal while the handle itself is hovered. */}
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    title="Drag to resize · double-click to reset"
                    onPointerDown={(e) => onHandlePointerDown(e, c.id)}
                    onPointerMove={onHandlePointerMove}
                    onPointerUp={onHandlePointerUp}
                    onPointerCancel={onHandlePointerUp}
                    onDoubleClick={(e) => onHandleDoubleClick(e, c.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="group/handle absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none select-none"
                  >
                    <span className="absolute inset-y-0 right-0 w-px bg-podio-border opacity-0 group-hover/th:opacity-100 group-hover/handle:bg-podio-teal" />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className="hover:bg-podio-row-hover">
              <td className="border-b border-[#EFEFEF] px-2 py-2.5 text-right text-podio-disabled">
                {i + 1}
              </td>
              <td className="border-b border-[#EFEFEF] px-3 py-2.5">
                {row.numberCell}
              </td>
              {columns.map((c, ci) => (
                <td
                  key={c.id}
                  className={`border-b border-[#EFEFEF] px-3 py-2.5 text-podio-ink ${
                    widths[c.id] ? "truncate" : ""
                  }`}
                >
                  {row.cells[ci]}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={2 + columns.length}
                className="px-4 py-10 text-podio-meta"
              >
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
