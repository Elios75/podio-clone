import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  formatDuration,
  tableSummary,
  CATEGORY_COLORS,
  NON_SORTABLE_FIELD_TYPES,
  type CategoryOption,
  type FieldType,
} from "@/lib/fields";
import { PodioIcon } from "@/components/podio-icon";
import { AppTabBar } from "../app-tab-bar";
import { CalendarView } from "./calendar-view";
import { BoardView } from "./board-view";
import { ViewToolbar, type Filter, type Sort, type LayoutToggle } from "./view-toolbar";
import { ViewsPane, type PaneView } from "./views-pane";
import { SheetTable } from "./sheet-table";
import { ExportButton } from "./export-button";
import { SaveTemplateButton } from "./save-template-button";
import { AppToolsMenu } from "./app-tools-menu";

export default async function AppPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; wsSlug: string; appSlug: string }>;
  searchParams: Promise<{
    view?: string;
    month?: string;
    f?: string;
    s?: string;
    viewId?: string;
    cols?: string;
    group?: string;
  }>;
}) {
  const { orgSlug, wsSlug, appSlug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations").select("id, slug").eq("slug", orgSlug).single();
  if (!org) notFound();
  const { data: ws } = await supabase
    .from("workspaces").select("id, slug")
    .eq("organization_id", org.id).eq("slug", wsSlug).single();
  if (!ws) notFound();
  const { data: app } = await supabase
    .from("apps").select("id, name, slug, icon, item_name, description")
    .eq("workspace_id", ws.id).eq("slug", appSlug).single();
  if (!app) notFound();

  // Sibling apps of the workspace for the shared app tab bar
  const { data: siblingApps } = await supabase
    .from("apps")
    .select("id, name, slug, icon")
    .eq("workspace_id", ws.id)
    .eq("is_archived", false)
    .order("name");

  const { data: allFields } = await supabase
    .from("app_fields")
    .select("id, label, type, is_primary, is_hidden, position, config")
    .eq("app_id", app.id).eq("status", "active")
    .order("position");
  // Separators are form-only; hidden fields stay out of the table too
  const fields = (allFields ?? []).filter(
    (f) => f.type !== "separator" && !f.is_hidden
  );

  // ----- Saved views + filters/sort (needed before querying items) -----
  const { data: savedViews } = await supabase
    .from("app_views")
    .select("id, name, layout, visibility, filters, sort, is_default, columns, settings")
    .eq("app_id", app.id)
    .order("name");

  // Explicit selection wins; otherwise fall back to the app's default view
  const noExplicitState = !sp.viewId && !sp.f && !sp.s && !sp.view;
  const activeView = sp.viewId
    ? (savedViews ?? []).find((v) => v.id === sp.viewId) ?? null
    : noExplicitState
    ? (savedViews ?? []).find((v) => v.is_default) ?? null
    : null;

  function parseJson<T>(raw: string | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  const filters = parseJson<Filter[]>(sp.f, (activeView?.filters as Filter[]) ?? []);
  const sort = parseJson<Sort[]>(sp.s, (activeView?.sort as Sort[]) ?? []);

  // ----- Server-side view engine: filters + sort compile to indexed SQL -----
  const { data: queryResult } = await supabase.rpc("query_items", {
    p_app: app.id,
    p_filters: filters.filter((f) => f.field_id && f.op),
    p_sort: sort,
    p_limit: 500,
    p_offset: 0,
  });
  const items: any[] = queryResult?.items ?? [];
  const totalItems: number = queryResult?.total ?? 0;

  // Unfiltered total for the Podio "X of Y" toolbar count (head-only, cheap)
  const { count: unfilteredCount } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .eq("app_id", app.id)
    .eq("is_deleted", false);
  const totalCount = unfilteredCount ?? totalItems;

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: values } = itemIds.length
    ? await supabase
        .from("item_field_values")
        .select("item_id, field_id, value, value_text, value_number, value_date, ref_item_id, ref_user_id")
        .in("item_id", itemIds)
    : { data: [] as any[] };

  // Names for contact fields
  const userIds = [...new Set((values ?? []).map((v) => v.ref_user_id).filter(Boolean))];
  const { data: profiles } = userIds.length
    ? await supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds)
    : { data: [] as any[] };
  const nameByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));

  // Titles for relationship fields
  const refItemIds = [...new Set((values ?? []).map((v) => v.ref_item_id).filter(Boolean))];
  const { data: refItems } = refItemIds.length
    ? await supabase.from("items").select("id, title, item_number").in("id", refItemIds)
    : { data: [] as any[] };
  const refById = new Map((refItems ?? []).map((r) => [r.id, r]));

  // Signed URLs for file/image values (bucket is private)
  const filePaths = [
    ...new Set(
      (values ?? []).map((v: any) => v.value?.path).filter(Boolean) as string[]
    ),
  ];
  const { data: signedArr } = filePaths.length
    ? await supabase.storage.from("podio-files").createSignedUrls(filePaths, 3600)
    : { data: [] as any[] };
  const signedByPath = new Map(
    (signedArr ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])
  );

  const valueMap = new Map<string, Map<string, any>>();
  for (const v of values ?? []) {
    if (!valueMap.has(v.item_id)) valueMap.set(v.item_id, new Map());
    valueMap.get(v.item_id)!.set(v.field_id, v);
  }

  function render(field: any, itemId: string) {
    const v = valueMap.get(itemId)?.get(field.id);
    if (!v) return <span className="text-podio-disabled">—</span>;

    switch (field.type) {
      case "category": {
        const options = (field.config?.options ?? []) as CategoryOption[];
        const ids: string[] = Array.isArray(v.value)
          ? v.value
          : v.value_text
          ? [v.value_text]
          : [];
        const opts = ids
          .map((id) => options.find((o) => o.id === id))
          .filter(Boolean) as CategoryOption[];
        return opts.length ? (
          <span className="flex flex-wrap gap-1">
            {opts.map((opt) => (
              <span key={opt.id}
                className={`rounded px-2 py-0.5 text-sm font-medium text-podio-ink ${
                  opt.color ? "" : "bg-podio-row-alt"
                }`}
                style={opt.color ? { backgroundColor: opt.color } : undefined}>
                {opt.label}
              </span>
            ))}
          </span>
        ) : <span className="text-podio-disabled">—</span>;
      }
      case "contact":
        return <span>{nameByUser.get(v.ref_user_id) ?? "Member"}</span>;
      case "relationship": {
        const ref = refById.get(v.ref_item_id);
        return ref ? (
          <span className="rounded bg-podio-row-alt px-2 py-0.5 text-xs text-podio-ink">
            #{ref.item_number} {ref.title ?? ""}
          </span>
        ) : <span className="text-podio-disabled">—</span>;
      }
      case "date":
        return <span>{v.value_date ? new Date(v.value_date).toLocaleDateString() : "—"}</span>;
      case "number":
        return <span>{v.value_number}</span>;
      case "money":
        return (
          <span>
            {Number(v.value_number).toLocaleString()} {v.value?.currency ?? ""}
          </span>
        );
      case "progress":
        return (
          <div className="flex items-center gap-2">
            <div className="h-2 w-16 rounded bg-podio-row-hover">
              <div className="h-2 rounded bg-podio-teal"
                style={{ width: `${Math.min(100, Number(v.value_number ?? 0))}%` }} />
            </div>
            <span className="text-xs text-podio-meta">{v.value_number}%</span>
          </div>
        );
      case "duration":
        return <span>{formatDuration(Number(v.value_number ?? 0))}</span>;
      case "phone":
        return <a href={`tel:${v.value_text}`} className="text-podio-teal hover:underline">{v.value_text}</a>;
      case "email":
        return <a href={`mailto:${v.value_text}`} className="text-podio-teal hover:underline">{v.value_text}</a>;
      case "link":
        return (
          <a href={v.value_text} target="_blank" className="text-podio-teal hover:underline">
            {v.value_text?.replace(/^https?:\/\//, "").slice(0, 30)}
          </a>
        );
      case "image":
        return v.value?.path && signedByPath.get(v.value.path) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedByPath.get(v.value.path)} alt={v.value_text ?? ""}
            className="h-8 w-8 rounded object-cover" />
        ) : <span className="text-podio-disabled">—</span>;
      case "file":
        return v.value?.path && signedByPath.get(v.value.path) ? (
          <a href={signedByPath.get(v.value.path)} target="_blank"
            className="text-podio-teal hover:underline">
            {v.value_text}
          </a>
        ) : <span className="text-podio-disabled">—</span>;
      case "calculation":
        return v.value_number != null ? (
          <span className="font-medium">{Number(v.value_number).toLocaleString()}</span>
        ) : (
          <span className="text-podio-disabled">ƒ</span>
        );
      case "table":
        // Compact summary: row count + sum of the first money (else number)
        // column, e.g. "3 rows · $1,250".
        return (
          <span className="whitespace-nowrap text-podio-secondary">
            {tableSummary(v.value, field.config)}
          </span>
        );
      default:
        return <span className="line-clamp-1">{v.value_text}</span>;
    }
  }

  // Visible table columns (URL > saved view > all)
  const colsList: string[] | null = sp.cols
    ? sp.cols.split(",").filter(Boolean)
    : (activeView?.columns as string[] | null) ?? null;
  const visibleFields = colsList
    ? fields.filter((f) => colsList.includes(f.id))
    : fields;

  // ----- View selection -----
  // "board" is the UI key for the Card/Dig grid (enum alias 'card'); "kanban"
  // is the drag-to-columns Board layout (enum value 'kanban', migration 51).
  const LAYOUTS = ["table", "board", "kanban", "calendar", "badge", "stream"];
  const savedLayout = activeView
    ? activeView.layout === "card"
      ? "board"
      : LAYOUTS.includes(activeView.layout)
      ? activeView.layout
      : "table"
    : null;
  const view =
    sp.view && LAYOUTS.includes(sp.view) ? sp.view : savedLayout ?? "table";
  const baseHref = `/org/${orgSlug}/${wsSlug}/${app.slug}`;

  // Filtering + sorting happened in SQL (query_items); results are already shaped.
  const visibleItems = items;
  const dateField = fields.find((f) => f.type === "date");

  // Calendar data: items bucketed by the first date field's day
  const monthStr =
    sp.month && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : new Date().toISOString().slice(0, 7);
  const cardsByDay: Record<string, { href: string; title: string }[]> = {};
  if (dateField) {
    for (const item of visibleItems) {
      const v = valueMap.get(item.id)?.get(dateField.id);
      if (!v?.value_date) continue;
      const day = new Date(v.value_date).toISOString().slice(0, 10);
      (cardsByDay[day] ??= []).push({
        href: `${baseHref}/${item.item_number}`,
        title: item.title ?? `#${item.item_number}`,
      });
    }
  }

  // Members for contact-field filter values
  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id, user_profiles:user_id(full_name)")
    .eq("workspace_id", ws.id);
  const members = (memberRows ?? []).map((m: any) => ({
    user_id: m.user_id,
    full_name: m.user_profiles?.full_name ?? null,
  }));

  // ----- Views pane data -----
  // Per-view counts: query_items with p_limit 1 returns the total cheaply.
  // Capped at the first 15 views (views are few; one RPC each).
  const viewCounts = new Map<string, number>();
  await Promise.all(
    (savedViews ?? []).slice(0, 15).map(async (v) => {
      const vFilters = ((v.filters as Filter[]) ?? []).filter(
        (f) => f.field_id && f.op
      );
      const { data } = await supabase.rpc("query_items", {
        p_app: app.id,
        p_filters: vFilters,
        p_sort: [],
        p_limit: 1,
        p_offset: 0,
      });
      viewCounts.set(v.id, data?.total ?? 0);
    })
  );

  // Grouped sub-rows: for each distinct category field referenced by a view's
  // settings.group_field_id, tally items per option (same precedent as the
  // workspace dashboard tiles: value_text holds the option id).
  const groupFieldIds = [
    ...new Set(
      (savedViews ?? [])
        .map((v) => (v.settings as { group_field_id?: string } | null)?.group_field_id)
        .filter((id): id is string => Boolean(id))
    ),
  ].filter((id) => fields.some((f) => f.id === id && f.type === "category"));
  const groupTallies = new Map<string, Map<string, number>>();
  await Promise.all(
    groupFieldIds.map(async (fid) => {
      const { data: groupVals } = await supabase
        .from("item_field_values")
        .select("value_text")
        .eq("field_id", fid)
        .limit(2000);
      const tally = new Map<string, number>();
      for (const r of groupVals ?? []) {
        if (r.value_text) tally.set(r.value_text, (tally.get(r.value_text) ?? 0) + 1);
      }
      groupTallies.set(fid, tally);
    })
  );

  const paneViews: PaneView[] = (savedViews ?? []).map((v) => {
    const gfid =
      (v.settings as { group_field_id?: string } | null)?.group_field_id ?? null;
    const groupField = gfid
      ? fields.find((f) => f.id === gfid && f.type === "category") ?? null
      : null;
    const groups = groupField
      ? ((groupField.config?.options ?? []) as CategoryOption[]).map((o, idx) => ({
          optionId: o.id,
          label: o.label,
          color: o.color || CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
          count: groupTallies.get(groupField.id)?.get(o.id) ?? 0,
        }))
      : null;
    return {
      id: v.id,
      name: v.name,
      visibility: (v.visibility === "private" ? "private" : "team") as
        | "team"
        | "private",
      count: viewCounts.get(v.id) ?? null,
      filters: ((v.filters as Filter[]) ?? []).filter((f) => f.field_id && f.op),
      groupFieldId: groupField?.id ?? null,
      groups,
    };
  });

  const categoryFields = fields.filter((f) => f.type === "category");
  const categoryFieldChoices = categoryFields.map((f) => ({ id: f.id, label: f.label }));

  // ----- Kanban (Board) layout data -----
  // Group items into columns by a single SINGLE-SELECT category field. Multi-
  // select is excluded: a drag writes one value, which would clobber the other
  // selected options (and real Podio boards group by single-select too).
  // Field choice: ?group=<fieldId> > the active saved view's
  // settings.group_field_id > the app's first single-select category field.
  const kanbanGroupFields = categoryFields.filter((f) => !f.config?.multiple);
  const savedGroupId =
    (activeView?.settings as { group_field_id?: string } | null)?.group_field_id ?? null;
  const kanbanGroupField =
    (sp.group ? kanbanGroupFields.find((f) => f.id === sp.group) : null) ??
    (savedGroupId ? kanbanGroupFields.find((f) => f.id === savedGroupId) : null) ??
    kanbanGroupFields[0] ??
    null;
  // Resolve each option's display color (stored color, else a stable palette
  // slot by index — same rule the views pane uses for grouped sub-row dots).
  const kanbanOptions: CategoryOption[] = kanbanGroupField
    ? ((kanbanGroupField.config?.options ?? []) as CategoryOption[]).map((o, idx) => ({
        id: o.id,
        label: o.label,
        color: o.color || CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
      }))
    : [];
  // One card per item; optionId is the item's value for the group field
  // (single-select value_text, or the first id of a multi-select array).
  const kanbanCards = kanbanGroupField
    ? visibleItems.map((item) => {
        const v = valueMap.get(item.id)?.get(kanbanGroupField.id);
        const optionId = v
          ? Array.isArray(v.value)
            ? (v.value[0] ?? null)
            : (v.value_text ?? null)
          : null;
        return {
          id: item.id,
          item_number: item.item_number,
          title: item.title ?? null,
          optionId,
        };
      })
    : [];

  // Layout toggles for the view toolbar (active one renders as the orange
  // pill). Current Podio naming/order: Badge | Table | Card | Activity |
  // Calendar, then the beyond-Podio Board (kanban).
  const layoutToggles: LayoutToggle[] = [
    { key: "badge", label: "Badge", href: `${baseHref}?view=badge` },
    { key: "table", label: "Table", href: baseHref },
    { key: "board", label: "Card", href: `${baseHref}?view=board` },
    { key: "stream", label: "Activity", href: `${baseHref}?view=stream` },
    dateField
      ? { key: "calendar", label: "Calendar", href: `${baseHref}?view=calendar` }
      : { key: "calendar", label: "Calendar", disabledTitle: "Add a Date field to use the calendar" },
    kanbanGroupField
      ? { key: "kanban", label: "Board", href: `${baseHref}?view=kanban` }
      : { key: "kanban", label: "Board", disabledTitle: "Add a single-select Category field to use the board" },
  ];

  return (
    <main>
      <AppTabBar
        orgSlug={orgSlug}
        wsSlug={wsSlug}
        apps={siblingApps ?? []}
        activeAppSlug={app.slug}
      />

      {/* One continuous white surface below the tab bar: views pane + main
          column share the same top edge, flush under the active tab card. */}
      <div className="flex min-h-[calc(100vh-8.5rem)] flex-col bg-white lg:flex-row lg:items-stretch">
        {/* Left views pane (client: collapse, tabs, + Add form) */}
        <ViewsPane
          appId={app.id}
          appName={app.name}
          appIcon={app.icon}
          description={app.description}
          baseHref={baseHref}
          itemName={app.item_name.toLowerCase()}
          totalCount={totalCount}
          views={paneViews}
          activeViewId={activeView?.id ?? null}
          categoryFields={categoryFieldChoices}
          currentLayout={view}
          currentFilters={filters}
          currentSort={sort}
          currentCols={colsList}
          tools={
            <>
              <Link
                href={`${baseHref}/form`}
                title="Webform"
                className="text-podio-meta hover:text-podio-teal"
              >
                <PodioIcon icon="share-out" className="h-5 w-5" />
              </Link>
              <span title="Notifications" className="text-podio-meta">
                <PodioIcon icon="bell" className="h-5 w-5" />
              </span>
              <AppToolsMenu
                baseHref={baseHref}
                appId={app.id}
                appName={app.name}
                wsId={ws.id}
                exportSlot={
                  <ExportButton appId={app.id} appName={app.name} fields={fields as any} />
                }
                shareSlot={
                  <SaveTemplateButton appId={app.id} appName={app.name} label="Share app" />
                }
              />
              <span title="Expand" className="text-podio-meta">
                <PodioIcon icon="expand" className="h-5 w-5" />
              </span>
            </>
          }
        />

        {/* Main view area: toolbar row level with the pane's title row, then
            a hairline under it (inside ViewToolbar) and the view content on
            the shared white surface. */}
        <section className="flex min-w-0 flex-1 flex-col bg-white">
      <ViewToolbar
        baseHref={baseHref}
        layout={view}
        layouts={layoutToggles}
        newHref={`${baseHref}/new`}
        itemName={app.item_name.toLowerCase()}
        filteredCount={totalItems}
        totalCount={totalCount}
        fields={fields as any}
        tableFields={fields.map((f) => ({ id: f.id, label: f.label }))}
        initialCols={colsList}
        members={members}
        activeViewId={activeView?.id ?? null}
        initialFilters={filters}
        initialSort={sort}
      />

      <div className="px-4 pb-8 pt-4 lg:px-6">
      {view === "board" && (
        // Card layout: one large card per record showing all its visible
        // fields — a straight grid, no category grouping (that was the old
        // kanban board; per Podio's current naming, Card = record cards).
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleItems.map((item) => (
            <Link
              key={item.id}
              href={`${baseHref}/${item.item_number}`}
              className="flex flex-col rounded border border-podio-border bg-white shadow-sm hover:border-podio-teal"
            >
              <h3 className="truncate px-5 pt-4 text-lg font-semibold text-podio-teal">
                {item.title ?? `#${item.item_number}`}
              </h3>
              <dl className="space-y-2 px-5 py-3">
                {visibleFields.map((f) => (
                  <div key={f.id} className="flex items-start gap-3 text-sm">
                    <dt className="w-28 shrink-0 truncate pt-0.5 text-podio-meta">
                      {f.label}
                    </dt>
                    <dd className="min-w-0 flex-1 truncate text-podio-ink">
                      {render(f, item.id)}
                    </dd>
                  </div>
                ))}
              </dl>
              <footer className="mt-auto flex items-center border-t border-podio-border px-5 py-2.5 text-sm text-podio-meta">
                #{item.item_number}
                {item.updated_at && (
                  <span className="ml-auto">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </span>
                )}
              </footer>
            </Link>
          ))}
          {visibleItems.length === 0 && (
            <p className="col-span-full rounded border border-dashed border-podio-border bg-white p-10 text-sm text-podio-meta">
              No {app.item_name.toLowerCase()}s match.
            </p>
          )}
        </div>
      )}

      {view === "calendar" && dateField && (
        <div>
          <CalendarView
            monthStr={monthStr}
            cardsByDay={cardsByDay}
            baseHref={baseHref}
            viewQuery="view=calendar"
          />
        </div>
      )}

      {view === "kanban" &&
        (kanbanGroupField ? (
          <BoardView
            fieldId={kanbanGroupField.id}
            fieldLabel={kanbanGroupField.label}
            options={kanbanOptions}
            cards={kanbanCards}
            baseHref={baseHref}
            groupFields={kanbanGroupFields.map((f) => ({ id: f.id, label: f.label }))}
          />
        ) : (
          <p className="rounded border border-dashed border-podio-border bg-white p-10 text-sm text-podio-meta">
            Add a single-select Category field to this app to use the Board layout.
          </p>
        ))}

      {view === "badge" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => (
            <Link key={item.id}
              href={`${baseHref}/${item.item_number}`}
              className="flex flex-col rounded border border-podio-border bg-white shadow-sm hover:border-podio-teal">
              <h3 className="truncate px-4 pt-4 text-[17px] font-semibold text-podio-ink">
                {item.title ?? `#${item.item_number}`}
              </h3>
              <dl className="mx-4 mt-3 space-y-1.5 rounded bg-podio-row-alt p-3">
                {visibleFields.slice(0, 5).map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-sm">
                    <dt className="w-20 shrink-0 truncate text-podio-meta">{f.label}</dt>
                    <dd className="min-w-0 truncate text-podio-ink">{render(f, item.id)}</dd>
                  </div>
                ))}
              </dl>
              <footer className="mt-auto flex items-center px-4 py-3 text-sm text-podio-meta">
                #{item.item_number}
                {item.updated_at && (
                  <span className="ml-auto">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </span>
                )}
              </footer>
            </Link>
          ))}
          {visibleItems.length === 0 && (
            <p className="col-span-full rounded border border-dashed border-podio-border bg-white p-10 text-sm text-podio-meta">
              No {app.item_name.toLowerCase()}s match.
            </p>
          )}
        </div>
      )}

      {view === "stream" && (
        <ul className="space-y-2">
          {[...visibleItems]
            .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
            .map((item) => (
              <li key={item.id}>
                <Link href={`${baseHref}/${item.item_number}`}
                  className="flex items-center gap-3 rounded border border-podio-border bg-white px-4 py-3 hover:bg-podio-row-hover">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-podio-ink">
                      {item.title ?? `#${item.item_number}`}
                    </span>
                    <span className="block text-xs text-podio-meta">
                      updated {new Date(item.updated_at).toLocaleString()}
                    </span>
                  </span>
                  <span className="ml-auto flex shrink-0 gap-3 text-xs">
                    {visibleFields.slice(0, 3).map((f) => (
                      <span key={f.id}>{render(f, item.id)}</span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          {visibleItems.length === 0 && (
            <li className="rounded border border-dashed border-podio-border bg-white p-10 text-sm text-podio-meta">
              No {app.item_name.toLowerCase()}s match.
            </li>
          )}
        </ul>
      )}

      {view === "table" && (
      // Sheet chrome (sortable headers + resizable columns) is a client
      // component; the CELLS are still rendered here on the server so
      // signed URLs / member names / chips work unchanged. Keyed Fragments
      // keep React happy about JSX arrays crossing the server→client boundary.
      <SheetTable
        appId={app.id}
        columns={visibleFields.map((f) => ({
          id: f.id,
          label: f.label,
          sortable: !NON_SORTABLE_FIELD_TYPES.includes(f.type as FieldType),
        }))}
        sort={sort}
        activeViewId={activeView?.id ?? null}
        emptyText={`No ${app.item_name.toLowerCase()}s yet.`}
        rows={visibleItems.map((item) => ({
          id: item.id,
          numberCell: (
            <Link
              href={`${baseHref}/${item.item_number}`}
              className="text-podio-teal hover:underline"
            >
              {item.item_number}
            </Link>
          ),
          cells: visibleFields.map((f) => (
            <Fragment key={f.id}>{render(f, item.id)}</Fragment>
          )),
        }))}
      />
      )}
      </div>
        </section>
      </div>
    </main>
  );
}
