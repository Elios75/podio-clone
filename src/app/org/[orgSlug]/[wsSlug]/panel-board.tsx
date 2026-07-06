"use client";

// Draggable panel board for the workspace activity page. The server page
// builds the panel nodes; this component owns column/order state and native
// HTML5 drag-and-drop (same technique as the app editor's canvas: grip-only
// drag handles, a custom MIME payload, pointer-midpoint insertion indices so
// whole columns — gaps included — are drop targets, and a teal top-border
// insertion indicator).
//
// Hydration safety: the first client render always uses the incoming panel
// order (matching SSR); any stored layout is applied only in a useEffect.

import { useEffect, useState, type DragEvent, type ReactNode } from "react";

export type WorkspacePanel = {
  id: string;
  title?: string;
  node: ReactNode;
  column: "left" | "right";
};

type ColumnId = "left" | "right";
type Order = { left: string[]; right: string[] };

// The only thing readable during dragover is `types`; data itself on drop.
const PANEL_MIME = "application/x-ws-panel";

export function PanelBoard({
  wsId,
  panels,
  rightFooter,
}: {
  wsId: string;
  panels: WorkspacePanel[];
  rightFooter?: ReactNode;
}) {
  const storageKey = `podio.ws-panels.${wsId}`;
  const byId = new Map(panels.map((p) => [p.id, p]));
  const defaultOrder: Order = {
    left: panels.filter((p) => p.column === "left").map((p) => p.id),
    right: panels.filter((p) => p.column === "right").map((p) => p.id),
  };

  const [order, setOrder] = useState<Order>(defaultOrder);
  const [hasStored, setHasStored] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ column: ColumnId; index: number } | null>(
    null
  );

  // Apply any stored layout AFTER hydration so SSR and the first client
  // render agree. Unknown ids are dropped; panels missing from the stored
  // layout are spliced back in at their default positions.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      /* storage unavailable */
    }
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as Partial<Record<ColumnId, unknown>>;
      const known = new Set(panels.map((p) => p.id));
      const placed = new Set<string>();
      const next: Order = { left: [], right: [] };
      for (const col of ["left", "right"] as const) {
        const ids = Array.isArray(stored[col]) ? (stored[col] as unknown[]) : [];
        for (const id of ids) {
          if (typeof id !== "string" || !known.has(id) || placed.has(id)) continue;
          next[col].push(id);
          placed.add(id);
        }
      }
      for (const p of panels) {
        if (placed.has(p.id)) continue;
        const defIdx = defaultOrder[p.column].indexOf(p.id);
        const at = Math.min(
          defIdx === -1 ? next[p.column].length : defIdx,
          next[p.column].length
        );
        next[p.column].splice(at, 0, p.id);
        placed.add(p.id);
      }
      setOrder(next);
      setHasStored(true);
    } catch {
      /* corrupt payload — keep the default order */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function persist(next: Order) {
    setOrder(next);
    setHasStored(true);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* storage unavailable — layout still applies for this visit */
    }
  }

  function resetLayout() {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setOrder(defaultOrder);
    setHasStored(false);
  }

  function columnIds(column: ColumnId): string[] {
    return order[column].filter((id) => byId.has(id));
  }

  function isPanelDrag(e: DragEvent) {
    return e.dataTransfer.types.includes(PANEL_MIME);
  }

  // Insertion index from the pointer's Y position: before the first panel
  // whose vertical midpoint the cursor is above, else at the end. This lets
  // the WHOLE column accept drops — gaps between panels included.
  function indexFromPointer(column: ColumnId, clientY: number): number {
    const ids = columnIds(column);
    for (let i = 0; i < ids.length; i++) {
      const el = document.getElementById(`ws-panel-${ids[i]}`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return ids.length;
  }

  function handleDragOver(e: DragEvent, column: ColumnId) {
    if (!isPanelDrag(e) || e.defaultPrevented) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const index = indexFromPointer(column, e.clientY);
    setOver((v) =>
      v && v.column === column && v.index === index ? v : { column, index }
    );
  }

  function handleDrop(e: DragEvent, column: ColumnId) {
    if (!isPanelDrag(e) || e.defaultPrevented) return;
    e.preventDefault();
    const id = e.dataTransfer.getData(PANEL_MIME);
    const index = indexFromPointer(column, e.clientY);
    setOver(null);
    setDragging(null);
    if (!id || !byId.has(id)) return;

    const next: Order = { left: [...order.left], right: [...order.right] };
    const from: ColumnId = next.left.includes(id) ? "left" : "right";
    const fromIdx = next[from].indexOf(id);
    if (fromIdx === -1) return;
    next[from].splice(fromIdx, 1);
    let insert = index;
    if (from === column && fromIdx < insert) insert -= 1;
    insert = Math.max(0, Math.min(insert, next[column].length));
    if (from === column && insert === fromIdx) return; // no-op move
    next[column].splice(insert, 0, id);
    persist(next);
  }

  function clearIndicator(e: DragEvent, column: ColumnId, index?: number) {
    // Only clear when the pointer really left this element (not just moved
    // onto a child) — relatedTarget guard, as in the app editor.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setOver((v) =>
      v && v.column === column && (index === undefined || v.index === index)
        ? null
        : v
    );
  }

  function renderColumn(column: ColumnId, extra?: ReactNode) {
    const ids = columnIds(column);
    return (
      <div
        className={column === "left" ? "space-y-4 lg:col-span-2" : "space-y-4"}
        // The full column is a drop target: pointer position decides the
        // insertion index, so drops in the gaps between panels work too.
        onDragOver={(e) => handleDragOver(e, column)}
        onDragLeave={(e) => clearIndicator(e, column)}
        onDrop={(e) => handleDrop(e, column)}
      >
        {ids.map((id, i) => {
          const p = byId.get(id)!;
          return (
            <div
              key={id}
              id={`ws-panel-${id}`}
              onDragOver={(e) => handleDragOver(e, column)}
              onDragLeave={(e) => clearIndicator(e, column, i)}
              onDrop={(e) => handleDrop(e, column)}
              className={`group relative border-t-2 ${
                over && over.column === column && over.index === i && dragging !== id
                  ? "border-podio-teal"
                  : "border-transparent"
              } ${dragging === id ? "opacity-60" : ""}`}
            >
              {/* Grip handle — the only draggable element, so text selection
                  and clicks inside the panel keep working. */}
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(PANEL_MIME, id);
                  e.dataTransfer.effectAllowed = "move";
                  const el = document.getElementById(`ws-panel-${id}`);
                  if (el) e.dataTransfer.setDragImage(el, 24, 24);
                  setDragging(id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                title="Drag to rearrange"
                aria-label={`Drag to rearrange ${p.title ?? "panel"}`}
                className={`absolute -top-2.5 right-3 z-10 cursor-grab items-center rounded-sm border border-podio-border bg-white px-1 py-0.5 text-podio-disabled shadow-sm hover:text-podio-secondary active:cursor-grabbing ${
                  dragging === id ? "flex" : "hidden group-hover:flex"
                }`}
              >
                <svg
                  viewBox="0 0 10 16"
                  className="h-4 w-2.5"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="2.5" cy="2.5" r="1.5" />
                  <circle cx="2.5" cy="8" r="1.5" />
                  <circle cx="2.5" cy="13.5" r="1.5" />
                  <circle cx="7.5" cy="2.5" r="1.5" />
                  <circle cx="7.5" cy="8" r="1.5" />
                  <circle cx="7.5" cy="13.5" r="1.5" />
                </svg>
              </div>
              {p.node}
            </div>
          );
        })}

        {/* Append zone — only visible mid-drag, catches drops below the
            last panel of either column. */}
        {dragging !== null && (
          <div
            onDragOver={(e) => handleDragOver(e, column)}
            onDragLeave={(e) => clearIndicator(e, column, ids.length)}
            onDrop={(e) => handleDrop(e, column)}
            className={`rounded border-2 border-dashed px-4 py-6 text-center text-sm ${
              over && over.column === column && over.index === ids.length
                ? "border-podio-teal bg-podio-row-alt text-podio-teal"
                : "border-podio-border text-podio-meta"
            }`}
          >
            Drop panel here
          </div>
        )}

        {extra}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 px-4 pt-4 md:px-6 lg:grid-cols-3">
      {renderColumn("left")}
      {renderColumn(
        "right",
        <>
          {rightFooter}
          {hasStored && (
            <button
              type="button"
              onClick={resetLayout}
              className="block text-xs text-podio-meta hover:text-podio-teal"
            >
              Reset layout
            </button>
          )}
        </>
      )}
    </div>
  );
}
