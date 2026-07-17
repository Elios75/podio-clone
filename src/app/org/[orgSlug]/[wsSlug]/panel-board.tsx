"use client";

// Configurable panel board for the workspace activity page: a 6-unit flow
// grid where every panel has a WIDTH (2/3/4/6 grid units — so two panels can
// sit side by side) and an optional HEIGHT (px, content scrolls inside), both
// set by dragging the Podio-style resize handle that appears in the panel's
// lower-right corner on hover. Panels drag anywhere via the grip handle
// (native HTML5 DnD, custom MIME, 2D pointer insertion index, teal top-border
// indicator — same technique as the app editor's canvas).
//
// Persistence: localStorage per workspace as { order, sizes }. Older layouts
// stored as { left, right } column arrays are migrated on read (left → width
// 4, right → width 2). Hydration safety: the first client render always uses
// the incoming panel order and NO inline sizes (matching SSR); the stored
// layout and desktop-only grid styles are applied in effects afterwards. On
// small screens the grid collapses to a plain stack and sizes are ignored.

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

export type WorkspacePanel = {
  id: string;
  title?: string;
  node: ReactNode;
  column: "left" | "right"; // default size/placement hint (legacy name)
};

type PanelSize = { w: number; h?: number };
type Layout = { order: string[]; sizes: Record<string, PanelSize> };

const PANEL_MIME = "application/x-ws-panel";
const GRID_UNITS = 6;
const WIDTH_STOPS = [2, 3, 4, 6]; // 1/3 · 1/2 · 2/3 · full
const MIN_H = 140;

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

  // Default: interleave left/right panels (L0 R0 L1 R1 …) with widths 4/2 so
  // the default rendering approximates the old two-column layout — a wide
  // panel with a rail panel beside it on each row.
  const defaultLayout: Layout = (() => {
    const left = panels.filter((p) => p.column === "left");
    const right = panels.filter((p) => p.column === "right");
    const order: string[] = [];
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      if (left[i]) order.push(left[i].id);
      if (right[i]) order.push(right[i].id);
    }
    const sizes: Record<string, PanelSize> = {};
    for (const p of panels) sizes[p.id] = { w: p.column === "left" ? 4 : 2 };
    return { order, sizes };
  })();

  const [layout, setLayout] = useState<Layout>(defaultLayout);
  const [hasStored, setHasStored] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Grid styles only on lg+ screens; below that the board is a plain stack.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Apply the stored layout AFTER hydration. Unknown ids are dropped; panels
  // missing from the stored order are spliced back in at their default spot.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      return; // storage unavailable
    }
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as any;
      const known = new Set(panels.map((p) => p.id));
      let order: string[] = [];
      let sizes: Record<string, PanelSize> = {};
      if (Array.isArray(stored?.order)) {
        order = stored.order.filter(
          (id: unknown): id is string => typeof id === "string" && known.has(id)
        );
        for (const [id, s] of Object.entries(stored.sizes ?? {})) {
          if (!known.has(id)) continue;
          const w = Number((s as any)?.w);
          const h = Number((s as any)?.h);
          sizes[id] = {
            w: WIDTH_STOPS.includes(w) ? w : 4,
            ...(Number.isFinite(h) && h >= MIN_H ? { h } : {}),
          };
        }
      } else if (Array.isArray(stored?.left) || Array.isArray(stored?.right)) {
        // v1 two-column shape → interleave, widths from the column.
        const left = (stored.left ?? []).filter(
          (id: unknown): id is string => typeof id === "string" && known.has(id)
        );
        const right = (stored.right ?? []).filter(
          (id: unknown): id is string => typeof id === "string" && known.has(id)
        );
        for (let i = 0; i < Math.max(left.length, right.length); i++) {
          if (left[i]) order.push(left[i]);
          if (right[i]) order.push(right[i]);
        }
        for (const id of left) sizes[id] = { w: 4 };
        for (const id of right) sizes[id] = { w: 2 };
      } else {
        return;
      }
      const placed = new Set(order);
      for (const id of defaultLayout.order) {
        if (!placed.has(id)) {
          order.push(id);
          placed.add(id);
        }
      }
      for (const p of panels) {
        if (!sizes[p.id]) sizes[p.id] = defaultLayout.sizes[p.id] ?? { w: 4 };
      }
      setLayout({ order, sizes });
      setHasStored(true);
    } catch {
      /* corrupt payload — keep the default layout */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function persist(next: Layout) {
    setLayout(next);
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
    setLayout(defaultLayout);
    setHasStored(false);
  }

  const orderedIds = layout.order.filter((id) => byId.has(id));

  // ----- Drag to rearrange -----

  function isPanelDrag(e: DragEvent) {
    return e.dataTransfer.types.includes(PANEL_MIME);
  }

  // 2D insertion index: before the first panel whose row the pointer is
  // above, or — within the pointer's row — whose horizontal midpoint the
  // pointer is left of. Falls through to the end.
  function indexFromPointer(clientX: number, clientY: number): number {
    for (let i = 0; i < orderedIds.length; i++) {
      const el = document.getElementById(`ws-panel-${orderedIds[i]}`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top - 8) return i;
      if (clientY <= r.bottom && clientX < r.left + r.width / 2) return i;
    }
    return orderedIds.length;
  }

  function handleDragOver(e: DragEvent) {
    if (!isPanelDrag(e) || e.defaultPrevented) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const index = indexFromPointer(e.clientX, e.clientY);
    setOverIndex((v) => (v === index ? v : index));
  }

  function handleDrop(e: DragEvent) {
    if (!isPanelDrag(e) || e.defaultPrevented) return;
    e.preventDefault();
    const id = e.dataTransfer.getData(PANEL_MIME);
    const index = indexFromPointer(e.clientX, e.clientY);
    setOverIndex(null);
    setDragging(null);
    if (!id || !byId.has(id)) return;
    const order = [...orderedIds];
    const fromIdx = order.indexOf(id);
    if (fromIdx === -1) return;
    order.splice(fromIdx, 1);
    let insert = index;
    if (fromIdx < insert) insert -= 1;
    insert = Math.max(0, Math.min(insert, order.length));
    if (insert === fromIdx) return; // no-op move
    order.splice(insert, 0, id);
    persist({ ...layoutRef.current, order });
  }

  function clearIndicator(e: DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setOverIndex(null);
  }

  // ----- Corner resize -----
  // Pointer-capture drag from the lower-right handle: width snaps to the
  // nearest grid stop (2/3/4/6 units), height follows the pointer freely
  // (min 140px; the panel body scrolls if its content is taller).
  function startResize(e: ReactPointerEvent, id: string) {
    if (!isDesktop) return;
    e.preventDefault();
    e.stopPropagation();
    const panelEl = document.getElementById(`ws-panel-${id}`);
    const gridEl = gridRef.current;
    if (!panelEl || !gridEl) return;
    const start = panelEl.getBoundingClientRect();
    const unit = gridEl.getBoundingClientRect().width / GRID_UNITS;
    setResizing(id);

    const onMove = (ev: PointerEvent) => {
      const wantPx = Math.max(unit, ev.clientX - start.left);
      const w = WIDTH_STOPS.reduce((best, s) =>
        Math.abs(s * unit - wantPx) < Math.abs(best * unit - wantPx) ? s : best
      );
      const h = Math.max(MIN_H, Math.round(ev.clientY - start.top));
      setLayout((prev) => ({
        ...prev,
        sizes: { ...prev.sizes, [id]: { w, h } },
      }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      setResizing(null);
      persist(layoutRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  return (
    <div className="px-4 pt-4 md:px-6">
      <div
        ref={gridRef}
        onDragOver={handleDragOver}
        onDragLeave={clearIndicator}
        onDrop={handleDrop}
        className={
          isDesktop ? "grid grid-cols-6 items-start gap-4" : "space-y-4"
        }
      >
        {orderedIds.map((id, i) => {
          const p = byId.get(id)!;
          const size = layout.sizes[id] ?? { w: 4 };
          return (
            <div
              key={id}
              id={`ws-panel-${id}`}
              style={
                isDesktop
                  ? { gridColumn: `span ${size.w} / span ${size.w}` }
                  : undefined
              }
              className={`group relative border-t-2 ${
                overIndex === i && dragging !== id
                  ? "border-podio-teal"
                  : "border-transparent"
              } ${dragging === id ? "opacity-60" : ""} ${
                resizing === id ? "ring-1 ring-podio-teal" : ""
              }`}
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
                  setOverIndex(null);
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

              {/* Panel body: a user-set height clips + scrolls the content. */}
              <div
                style={
                  isDesktop && size.h
                    ? { height: size.h, overflowY: "auto" }
                    : undefined
                }
              >
                {p.node}
              </div>

              {/* Corner resize handle (Podio-style): appears on hover in the
                  lower-right; drag to snap width to 1/3 · 1/2 · 2/3 · full
                  and set the height freely. */}
              {isDesktop && (
                <div
                  onPointerDown={(e) => startResize(e, id)}
                  title="Drag to resize"
                  aria-label={`Resize ${p.title ?? "panel"}`}
                  className={`absolute bottom-0.5 right-0.5 z-10 cursor-nwse-resize p-1 text-podio-disabled hover:text-podio-secondary ${
                    resizing === id ? "block" : "hidden group-hover:block"
                  }`}
                >
                  <svg
                    viewBox="0 0 10 10"
                    className="h-3 w-3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M9 1 1 9" />
                    <path d="M9 5 5 9" />
                    <path d="M9 9 9 9" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}

        {/* Append zone — only visible mid-drag, catches drops past the last
            panel. */}
        {dragging !== null && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`col-span-full rounded border-2 border-dashed px-4 py-6 text-center text-sm ${
              overIndex === orderedIds.length
                ? "border-podio-teal bg-podio-row-alt text-podio-teal"
                : "border-podio-border text-podio-meta"
            }`}
          >
            Drop panel here
          </div>
        )}
      </div>

      <div className="mt-4 space-y-4 lg:max-w-sm">
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
      </div>
    </div>
  );
}
