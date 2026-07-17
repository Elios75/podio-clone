"use client";

// Workspace panel board, Podio-shaped: TWO independent columns.
// - LEFT = the activity column (workspace card + composer/feed). It is
//   pinned to the left and its WIDTH is adjustable (2/6, 3/6 or 4/6 of the
//   page — drag any left panel's corner handle sideways; default half).
// - RIGHT = the dashboard region: its own 2-across grid where every panel is
//   full- or half-width of the region (corner-drag snaps), so tiles can sit
//   side by side without ever wrapping UNDER the tall activity feed.
// Panels drag between and within columns via the grip handle (native HTML5
// DnD, custom MIME, pointer insertion index, teal top-border indicator).
// Corner resize also sets a panel HEIGHT (px, content scrolls, hairline
// closes the cut; dragging past the content bottom releases back to auto).
//
// Persistence: ACCOUNT-SYNCED via podio.workspace_panel_layouts (one row per
// user per workspace). The server page passes the stored row as
// `initialLayout`, seeding the first render (SSR + client agree — no flash).
// Older stored shapes (the v2 free-grid { order, sizes } and the v1
// { left, right } arrays) are migrated on read; pre-sync localStorage
// layouts are adopted once when the account has none. On small screens the
// board is a plain stack and all sizing is ignored.

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

export type WorkspacePanel = {
  id: string;
  title?: string;
  node: ReactNode;
  column: "left" | "right"; // default column
};

type ColumnId = "left" | "right";
type PanelSize = { w: 1 | 2; h?: number }; // right column: 1 = half, 2 = full
type Layout = {
  leftW: 2 | 3 | 4; // sixths of the page taken by the left column
  left: string[];
  right: string[];
  sizes: Record<string, PanelSize>;
};

const PANEL_MIME = "application/x-ws-panel";
const LEFT_STOPS = [2, 3, 4] as const;
const MIN_H = 140;

function defaultsFor(panels: WorkspacePanel[]): Layout {
  const sizes: Record<string, PanelSize> = {};
  for (const p of panels) sizes[p.id] = { w: 2 };
  return {
    leftW: 3,
    left: panels.filter((p) => p.column === "left").map((p) => p.id),
    right: panels.filter((p) => p.column === "right").map((p) => p.id),
    sizes,
  };
}

// Validate + normalize a stored layout of any historical shape; null when
// the payload holds nothing usable.
function sanitizeStored(
  stored: unknown,
  panels: WorkspacePanel[],
  defaults: Layout
): Layout | null {
  if (!stored || typeof stored !== "object") return null;
  const s = stored as any;
  const known = new Set(panels.map((p) => p.id));
  const defColumn = new Map(panels.map((p) => [p.id, p.column]));
  const strArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((id: unknown): id is string => typeof id === "string" && known.has(id))
      : [];

  let left: string[] = [];
  let right: string[] = [];
  const sizes: Record<string, PanelSize> = {};
  let leftW: 2 | 3 | 4 = 3;

  const readSizes = (src: any, mapW: (w: number) => 1 | 2) => {
    for (const [id, sz] of Object.entries(src ?? {})) {
      if (!known.has(id)) continue;
      const w = Number((sz as any)?.w);
      const h = Number((sz as any)?.h);
      sizes[id] = {
        w: Number.isFinite(w) ? mapW(w) : 2,
        ...(Number.isFinite(h) && h >= MIN_H ? { h } : {}),
      };
    }
  };

  if (Array.isArray(s.left) && Array.isArray(s.right) && "leftW" in s) {
    // v3 (current shape)
    left = strArr(s.left);
    right = strArr(s.right);
    leftW = LEFT_STOPS.includes(s.leftW) ? s.leftW : 3;
    readSizes(s.sizes, (w) => (w === 1 ? 1 : 2));
  } else if (Array.isArray(s.order)) {
    // v2 free grid: split by each panel's default column; halves stay halves.
    for (const id of strArr(s.order)) {
      (defColumn.get(id) === "left" ? left : right).push(id);
    }
    readSizes(s.sizes, (w) => (w <= 3 ? 1 : 2));
  } else if (Array.isArray(s.left) || Array.isArray(s.right)) {
    // v1 two columns
    left = strArr(s.left);
    right = strArr(s.right);
  } else {
    return null;
  }
  if (left.length + right.length === 0) return null;

  // Splice missing panels back into their default column; default sizes.
  const placed = new Set([...left, ...right]);
  for (const p of panels) {
    if (!placed.has(p.id)) {
      (p.column === "left" ? left : right).push(p.id);
      placed.add(p.id);
    }
    if (!sizes[p.id]) sizes[p.id] = defaults.sizes[p.id] ?? { w: 2 };
  }
  return { leftW, left, right, sizes };
}

export function PanelBoard({
  wsId,
  userId,
  initialLayout,
  panels,
  rightFooter,
}: {
  wsId: string;
  userId: string | null;
  initialLayout?: unknown;
  panels: WorkspacePanel[];
  rightFooter?: ReactNode;
}) {
  const storageKey = `podio.ws-panels.${wsId}`;
  const byId = new Map(panels.map((p) => [p.id, p]));
  const supabase = createClient();
  const defaultLayout = defaultsFor(panels);

  const serverLayout = sanitizeStored(initialLayout, panels, defaultLayout);
  const [layout, setLayout] = useState<Layout>(serverLayout ?? defaultLayout);
  const [hasStored, setHasStored] = useState(serverLayout !== null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ column: ColumnId; index: number } | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // One-time adoption of a pre-sync localStorage layout.
  useEffect(() => {
    if (serverLayout) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const adopted = sanitizeStored(JSON.parse(raw), panels, defaultLayout);
      if (!adopted) return;
      setLayout(adopted);
      setHasStored(true);
      saveRemote(adopted);
    } catch {
      /* corrupt payload — keep the default layout */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function saveRemote(next: Layout) {
    if (!userId) return;
    void supabase.from("workspace_panel_layouts").upsert({
      workspace_id: wsId,
      user_id: userId,
      layout: next,
      updated_at: new Date().toISOString(),
    });
  }

  function persist(next: Layout) {
    setLayout(next);
    setHasStored(true);
    saveRemote(next);
  }

  function resetLayout() {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    if (userId) {
      void supabase
        .from("workspace_panel_layouts")
        .delete()
        .eq("workspace_id", wsId)
        .eq("user_id", userId);
    }
    setLayout(defaultLayout);
    setHasStored(false);
  }

  function columnIds(column: ColumnId): string[] {
    return layout[column].filter((id) => byId.has(id));
  }

  // ----- Drag to rearrange -----

  function isPanelDrag(e: DragEvent) {
    return e.dataTransfer.types.includes(PANEL_MIME);
  }

  // Insertion index inside a column. The right column is a 2-across grid, so
  // it also compares the pointer's X against each panel's midpoint.
  function indexFromPointer(column: ColumnId, x: number, y: number): number {
    const ids = columnIds(column);
    for (let i = 0; i < ids.length; i++) {
      const el = document.getElementById(`ws-panel-${ids[i]}`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top - 8) return i;
      if (y <= r.bottom && (column === "left" || x < r.left + r.width / 2))
        return i;
    }
    return ids.length;
  }

  function handleDragOver(e: DragEvent, column: ColumnId) {
    if (!isPanelDrag(e) || e.defaultPrevented) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const index = indexFromPointer(column, e.clientX, e.clientY);
    setOver((v) =>
      v && v.column === column && v.index === index ? v : { column, index }
    );
  }

  function handleDrop(e: DragEvent, column: ColumnId) {
    if (!isPanelDrag(e) || e.defaultPrevented) return;
    e.preventDefault();
    const id = e.dataTransfer.getData(PANEL_MIME);
    const index = indexFromPointer(column, e.clientX, e.clientY);
    setOver(null);
    setDragging(null);
    if (!id || !byId.has(id)) return;

    const next: Layout = {
      ...layoutRef.current,
      left: [...layoutRef.current.left],
      right: [...layoutRef.current.right],
    };
    const from: ColumnId = next.left.includes(id) ? "left" : "right";
    const fromIdx = next[from].indexOf(id);
    if (fromIdx === -1) return;
    next[from].splice(fromIdx, 1);
    let insert = index;
    if (from === column && fromIdx < insert) insert -= 1;
    insert = Math.max(0, Math.min(insert, next[column].length));
    if (from === column && insert === fromIdx) return; // no-op
    next[column].splice(insert, 0, id);
    persist(next);
  }

  function clearIndicator(e: DragEvent, column: ColumnId) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setOver((v) => (v && v.column === column ? null : v));
  }

  // ----- Corner resize -----
  // Left panels: horizontal drag adjusts the LEFT COLUMN width (2/3/4 sixths
  // of the page); vertical sets the panel height. Right panels: horizontal
  // snaps the panel to half/full of the right region; vertical sets height.
  function startResize(e: ReactPointerEvent, id: string, column: ColumnId) {
    if (!isDesktop) return;
    e.preventDefault();
    e.stopPropagation();
    const panelEl = document.getElementById(`ws-panel-${id}`);
    const rowEl = rowRef.current;
    if (!panelEl || !rowEl) return;
    const start = panelEl.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    const unit = rowRect.width / 6;
    setResizing(id);

    const onMove = (ev: PointerEvent) => {
      const h = Math.max(MIN_H, Math.round(ev.clientY - start.top));
      setLayout((prev) => {
        const next: Layout = { ...prev, sizes: { ...prev.sizes } };
        if (column === "left") {
          const wantPx = Math.max(unit, ev.clientX - rowRect.left);
          const leftW = LEFT_STOPS.reduce((best, s) =>
            Math.abs(s * unit - wantPx) < Math.abs(best * unit - wantPx) ? s : best
          );
          next.leftW = leftW;
          next.sizes[id] = { ...(prev.sizes[id] ?? { w: 2 }), h };
        } else {
          const rightRect = rightRef.current?.getBoundingClientRect();
          const rightW = rightRect?.width ?? rowRect.width;
          const wantPx = ev.clientX - start.left;
          const w: 1 | 2 = wantPx < rightW * 0.72 ? 1 : 2;
          next.sizes[id] = { w, h };
        }
        return next;
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      setResizing(null);
      // Dragged past the content's bottom = release the height back to auto.
      const cur = layoutRef.current;
      const s = cur.sizes[id] ?? { w: 2 as const };
      const bodyEl = panelEl.querySelector<HTMLElement>("[data-panel-body]");
      const next =
        s.h && bodyEl && s.h >= bodyEl.scrollHeight - 4
          ? { ...cur, sizes: { ...cur.sizes, [id]: { w: s.w } } }
          : cur;
      persist(next);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function renderPanel(id: string, i: number, column: ColumnId) {
    const p = byId.get(id)!;
    const size = layout.sizes[id] ?? { w: 2 };
    return (
      <div
        key={id}
        id={`ws-panel-${id}`}
        onDragOver={(e) => handleDragOver(e, column)}
        onDrop={(e) => handleDrop(e, column)}
        style={
          isDesktop && column === "right" && size.w === 2
            ? { gridColumn: "span 2 / span 2" }
            : undefined
        }
        // min-w-0 is load-bearing: without it a panel narrower than its
        // content overflows into (and under) the neighboring cell.
        className={`group relative min-w-0 border-t-2 ${
          over && over.column === column && over.index === i && dragging !== id
            ? "border-podio-teal"
            : "border-transparent"
        } ${dragging === id ? "opacity-60" : ""} ${
          resizing === id ? "ring-1 ring-podio-teal" : ""
        }`}
      >
        {/* Grip handle — the only draggable element. */}
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
          <svg viewBox="0 0 10 16" className="h-4 w-2.5" fill="currentColor" aria-hidden="true">
            <circle cx="2.5" cy="2.5" r="1.5" />
            <circle cx="2.5" cy="8" r="1.5" />
            <circle cx="2.5" cy="13.5" r="1.5" />
            <circle cx="7.5" cy="2.5" r="1.5" />
            <circle cx="7.5" cy="8" r="1.5" />
            <circle cx="7.5" cy="13.5" r="1.5" />
          </svg>
        </div>

        {/* Panel body: clips horizontally; user-set height clips + scrolls. */}
        <div
          data-panel-body
          className={`min-w-0 overflow-x-hidden ${
            isDesktop && size.h
              ? "overflow-y-auto rounded-b border-b border-podio-border"
              : ""
          }`}
          style={isDesktop && size.h ? { height: size.h } : undefined}
        >
          {p.node}
        </div>

        {/* Corner resize handle. */}
        {isDesktop && (
          <div
            onPointerDown={(e) => startResize(e, id, column)}
            title={
              column === "left"
                ? "Drag to resize (width adjusts the activity column)"
                : "Drag to resize"
            }
            aria-label={`Resize ${p.title ?? "panel"}`}
            className={`absolute bottom-0.5 right-0.5 z-10 cursor-nwse-resize p-1 text-podio-disabled hover:text-podio-secondary ${
              resizing === id ? "block" : "hidden group-hover:block"
            }`}
          >
            <svg viewBox="0 0 10 10" className="h-3 w-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" aria-hidden="true">
              <path d="M9 1 1 9" />
              <path d="M9 5 5 9" />
            </svg>
          </div>
        )}
      </div>
    );
  }

  function appendZone(column: ColumnId, count: number) {
    if (dragging === null) return null;
    return (
      <div
        onDragOver={(e) => handleDragOver(e, column)}
        onDrop={(e) => handleDrop(e, column)}
        style={
          isDesktop && column === "right"
            ? { gridColumn: "span 2 / span 2" }
            : undefined
        }
        className={`rounded border-2 border-dashed px-4 py-6 text-center text-sm ${
          over && over.column === column && over.index === count
            ? "border-podio-teal bg-podio-row-alt text-podio-teal"
            : "border-podio-border text-podio-meta"
        }`}
      >
        Drop panel here
      </div>
    );
  }

  const leftIds = columnIds("left");
  const rightIds = columnIds("right");

  return (
    <div className="px-4 pt-4 md:px-6">
      <div
        ref={rowRef}
        className={isDesktop ? "flex items-start gap-4" : "space-y-4"}
      >
        {/* LEFT: the activity column — pinned, width-adjustable. */}
        <div
          onDragOver={(e) => handleDragOver(e, "left")}
          onDragLeave={(e) => clearIndicator(e, "left")}
          onDrop={(e) => handleDrop(e, "left")}
          style={isDesktop ? { width: `${(layout.leftW / 6) * 100}%` } : undefined}
          className={isDesktop ? "shrink-0 space-y-4" : "space-y-4"}
        >
          {leftIds.map((id, i) => renderPanel(id, i, "left"))}
          {appendZone("left", leftIds.length)}
        </div>

        {/* RIGHT: the dashboard region — its own 2-across grid. */}
        <div
          ref={rightRef}
          onDragOver={(e) => handleDragOver(e, "right")}
          onDragLeave={(e) => clearIndicator(e, "right")}
          onDrop={(e) => handleDrop(e, "right")}
          className={
            isDesktop
              ? "grid min-w-0 flex-1 grid-cols-2 items-start gap-4"
              : "space-y-4"
          }
        >
          {rightIds.map((id, i) => renderPanel(id, i, "right"))}
          {appendZone("right", rightIds.length)}
        </div>
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
