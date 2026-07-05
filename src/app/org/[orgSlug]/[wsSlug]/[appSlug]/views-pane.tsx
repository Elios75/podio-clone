"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";
import type { Filter, Sort } from "./view-toolbar";

// Podio left views pane: app title row (aligned with the main view toolbar),
// Views header + "+ Add", Team | Private underline tabs, view rows with
// right-aligned counts, and colored-dot sub-rows for views grouped by a
// category field. Collapses to a thin strip via the ‹ chevron on its right
// edge. See docs/design/podio-design-skill/references/layouts.md §3.

export type PaneGroupRow = {
  optionId: string;
  label: string;
  color: string; // option color or deterministic palette fallback
  count: number;
};

export type PaneView = {
  id: string;
  name: string;
  visibility: "team" | "private";
  count: number | null; // null when beyond the first 15 (not computed)
  filters: Filter[];
  groupFieldId: string | null; // settings.group_field_id when it's a category field
  groups: PaneGroupRow[] | null;
};

const COLLAPSE_KEY = "podio.viewsPaneCollapsed";

export function ViewsPane({
  appId,
  appName,
  appIcon,
  description,
  baseHref,
  itemName,
  totalCount,
  views,
  activeViewId,
  categoryFields,
  currentLayout,
  currentFilters,
  currentSort,
  currentCols,
  tools,
}: {
  appId: string;
  appName: string;
  appIcon: string | null;
  description: string | null;
  baseHref: string;
  itemName: string; // lowercased singular, e.g. "task"
  totalCount: number;
  views: PaneView[];
  activeViewId: string | null;
  categoryFields: { id: string; label: string }[];
  currentLayout: string; // "table" | "board" | "calendar" | "badge" | "stream"
  currentFilters: Filter[];
  currentSort: Sort[];
  currentCols: string[] | null;
  tools?: ReactNode; // utility icon cluster (webform, bell, wrench menu, expand)
}) {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      /* localStorage unavailable */
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const [tab, setTab] = useState<"team" | "private">(
    activeView?.visibility ?? "team"
  );
  // Keep the tab in sync when navigation activates a view on the other tab
  useEffect(() => {
    const av = views.find((v) => v.id === activeViewId);
    if (av) setTab(av.visibility);
  }, [activeViewId, views]);

  // + Add form state
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const [groupFieldId, setGroupFieldId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current URL filters, for sub-row active state
  const urlViewId = searchParams.get("viewId");
  const urlFilters = useMemo<Filter[]>(() => {
    try {
      const parsed = JSON.parse(searchParams.get("f") ?? "[]");
      return Array.isArray(parsed) ? (parsed as Filter[]) : [];
    } catch {
      return [];
    }
  }, [searchParams]);

  function subRowHref(v: PaneView, optionId: string) {
    // Merge the view's own filters with an equality filter on the group
    // option. "is" is the equals-op query_items supports for category
    // fields (matches value_text or multi-value arrays).
    const merged: Filter[] = [
      ...v.filters,
      { field_id: v.groupFieldId as string, op: "is", value: optionId },
    ];
    return `${baseHref}?viewId=${v.id}&f=${encodeURIComponent(JSON.stringify(merged))}`;
  }

  function subRowActive(v: PaneView, optionId: string) {
    return (
      urlViewId === v.id &&
      urlFilters.some(
        (f) => f.field_id === v.groupFieldId && f.op === "is" && f.value === optionId
      )
    );
  }

  async function saveView() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("View name required.");
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Same write the toolbar's "Save as view" used: direct insert into
    // app_views with the current filters/sort/columns and layout.
    const { data: created, error: insError } = await supabase
      .from("app_views")
      .insert({
        app_id: appId,
        name: trimmed,
        layout: currentLayout === "board" ? "card" : currentLayout,
        visibility,
        owner_id: user?.id,
        filters: currentFilters.filter((f) => f.field_id && f.op),
        sort: currentSort,
        columns: currentCols,
        settings: groupFieldId ? { group_field_id: groupFieldId } : {},
      })
      .select()
      .single();
    setSaving(false);
    if (insError) {
      setError(insError.message);
      return;
    }
    setAddOpen(false);
    setName("");
    setGroupFieldId("");
    setTab(visibility);
    router.push(`${baseHref}?viewId=${created.id}`);
    router.refresh();
  }

  if (collapsed) {
    return (
      <aside className="flex w-full shrink-0 items-center border-b border-podio-border bg-white px-2 py-1 lg:w-7 lg:flex-col lg:items-center lg:justify-start lg:border-b-0 lg:border-r lg:px-0 lg:py-2">
        <button
          onClick={toggleCollapsed}
          title="Show views"
          aria-label="Show views"
          className="text-podio-meta hover:text-podio-teal"
        >
          <span className="text-lg leading-none">›</span>
        </button>
      </aside>
    );
  }

  const tabViews = views.filter((v) => v.visibility === tab);

  return (
    <aside className="relative w-full shrink-0 border-b border-podio-border bg-white p-4 pt-3 lg:w-72 lg:border-b-0 lg:border-r">
      {/* Collapse affordance: thin ‹ strip on the pane's right edge */}
      <button
        onClick={toggleCollapsed}
        title="Hide views"
        aria-label="Hide views"
        className="absolute inset-y-0 right-0 hidden w-3 items-center justify-center text-podio-disabled hover:bg-podio-row-alt hover:text-podio-secondary lg:flex"
      >
        <span className="text-sm leading-none">‹</span>
      </button>

      {/* App title row — same min-h as the main column's toolbar row so both
          top rows sit at the same height. */}
      <div className="flex min-h-10 items-center gap-2 pr-2">
        <h1 className="flex min-w-0 items-center gap-2 text-xl font-semibold text-podio-teal">
          <PodioIcon icon={appIcon} name={appName} className="h-6 w-6 shrink-0" />
          <span className="min-w-0 truncate">{appName}</span>
        </h1>
        <span className="ml-auto flex shrink-0 items-center gap-2.5">{tools}</span>
      </div>
      {description && (
        <p className="mt-2 text-sm text-podio-secondary">{description}</p>
      )}

      {/* Views header + right-aligned "+ Add" */}
      <div className="mt-5 flex items-center pr-2">
        <h2 className="text-lg font-semibold text-podio-ink">Views</h2>
        <button
          onClick={() => {
            setAddOpen((o) => !o);
            setError(null);
          }}
          className="ml-auto rounded border border-podio-border bg-podio-row-alt px-2 py-0.5 text-sm text-podio-ink hover:bg-podio-row-hover"
        >
          + Add
        </button>
      </div>

      {/* Inline + Add form: saves the current filters/sort as a new view */}
      {addOpen && (
        <div className="mt-2 space-y-2 rounded border border-podio-border bg-podio-row-alt p-3 text-sm">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="View name"
            className="w-full rounded border border-podio-border bg-white px-2 py-1"
          />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-podio-ink">
              <input
                type="radio"
                name="pane-view-visibility"
                checked={visibility === "team"}
                onChange={() => setVisibility("team")}
              />
              Team
            </label>
            <label className="flex items-center gap-1.5 text-podio-ink">
              <input
                type="radio"
                name="pane-view-visibility"
                checked={visibility === "private"}
                onChange={() => setVisibility("private")}
              />
              Private
            </label>
          </div>
          {categoryFields.length > 0 && (
            <label className="flex items-center gap-2 text-podio-secondary">
              Group by
              <select
                value={groupFieldId}
                onChange={(e) => setGroupFieldId(e.target.value)}
                className="min-w-0 flex-1 rounded border border-podio-border bg-white px-2 py-1"
              >
                <option value="">— no grouping —</option>
                {categoryFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-xs text-podio-meta">
            Saves the current filters and sort.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={saveView}
              disabled={saving}
              className="rounded bg-podio-teal px-3 py-1 font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-60"
            >
              Save
            </button>
            <button
              onClick={() => setAddOpen(false)}
              className="text-podio-secondary hover:text-podio-ink"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}

      {/* Team | Private underline tabs */}
      <div className="mt-2 flex gap-6 border-b border-podio-border pr-2 text-[15px]">
        {(["team", "private"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "-mb-px border-b-2 border-podio-ink pb-1 font-semibold text-podio-ink"
                : "pb-1 text-podio-secondary hover:text-podio-ink"
            }
          >
            {t === "team" ? "Team" : "Private"}
          </button>
        ))}
      </div>

      <ul className="mt-3 space-y-0.5 pr-2 text-[15px]">
        {/* "All items" pseudo-view with the unfiltered total */}
        <li>
          <Link
            href={baseHref}
            className={`flex items-center rounded px-2 py-1.5 text-podio-teal ${
              !activeViewId ? "bg-podio-row-hover font-semibold" : "hover:bg-[#F3F3F3]"
            }`}
          >
            All {itemName}s
            <span className="ml-auto font-normal text-podio-ink">
              {totalCount.toLocaleString()}
            </span>
          </Link>
        </li>

        {tabViews.map((v) => (
          <li key={v.id}>
            <Link
              href={`${baseHref}?viewId=${v.id}`}
              className={`flex items-center rounded px-2 py-1.5 text-podio-teal ${
                activeViewId === v.id
                  ? "bg-podio-row-hover font-semibold"
                  : "hover:bg-[#F3F3F3]"
              }`}
            >
              <span className="min-w-0 truncate">{v.name}</span>
              {v.count != null && (
                <span className="ml-auto pl-2 font-normal text-podio-ink">
                  {v.count.toLocaleString()}
                </span>
              )}
            </Link>

            {/* Colored-dot sub-rows for category-grouped views */}
            {v.groups?.map((g) => (
              <Link
                key={g.optionId}
                href={subRowHref(v, g.optionId)}
                className={`flex items-center gap-2 rounded px-2 py-1 pl-4 text-sm ${
                  subRowActive(v, g.optionId)
                    ? "bg-podio-row-hover font-semibold text-podio-ink"
                    : "text-podio-secondary hover:bg-[#F3F3F3]"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: g.color }}
                />
                <span className="min-w-0 truncate">{g.label}</span>
                <span className="ml-auto pl-2">{g.count.toLocaleString()}</span>
              </Link>
            ))}
          </li>
        ))}

        {tabViews.length === 0 && (
          <li className="px-2 py-1.5 text-sm italic text-podio-disabled">
            No {tab} views yet.
          </li>
        )}
      </ul>
    </aside>
  );
}
