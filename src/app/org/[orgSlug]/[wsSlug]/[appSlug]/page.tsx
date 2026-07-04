import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, type CategoryOption } from "@/lib/fields";
import { PodioIcon } from "@/components/podio-icon";
import { AppTabBar } from "../app-tab-bar";
import { BoardView } from "./board-view";
import { CalendarView } from "./calendar-view";
import { ViewToolbar, type Filter, type Sort, type LayoutToggle } from "./view-toolbar";
import { ExportButton } from "./export-button";
import { SaveTemplateButton } from "./save-template-button";

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
    .select("id, name, layout, visibility, filters, sort, is_default, columns")
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
  const LAYOUTS = ["table", "board", "calendar", "badge", "stream"];
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
  const categoryField = fields.find((f) => f.type === "category");
  const dateField = fields.find((f) => f.type === "date");

  // Board data: each item's current option for the first category field
  const boardCards = visibleItems.map((item) => ({
    id: item.id,
    item_number: item.item_number,
    title: item.title,
    optionId:
      (categoryField &&
        valueMap.get(item.id)?.get(categoryField.id)?.value_text) ??
      null,
  }));

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

  // Layout toggles for the view toolbar (active one renders as the orange pill)
  const layoutToggles: LayoutToggle[] = [
    { key: "table", label: "Sheet", href: baseHref },
    categoryField
      ? { key: "board", label: "Board", href: `${baseHref}?view=board` }
      : { key: "board", label: "Board", disabledTitle: "Add a Category field to use the board" },
    dateField
      ? { key: "calendar", label: "Calendar", href: `${baseHref}?view=calendar` }
      : { key: "calendar", label: "Calendar", disabledTitle: "Add a Date field to use the calendar" },
    { key: "badge", label: "Badge", href: `${baseHref}?view=badge` },
    { key: "stream", label: "Stream", href: `${baseHref}?view=stream` },
  ];

  const countLabel =
    visibleItems.length === totalItems
      ? `${totalItems.toLocaleString()} ${app.item_name.toLowerCase()}${totalItems === 1 ? "" : "s"}`
      : `${visibleItems.length.toLocaleString()} of ${totalItems.toLocaleString()}`;

  return (
    <main>
      <AppTabBar
        orgSlug={orgSlug}
        wsSlug={wsSlug}
        apps={siblingApps ?? []}
        activeAppSlug={app.slug}
      />

      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {/* Left views pane */}
        <aside className="w-full shrink-0 border-b border-podio-border bg-white p-4 lg:w-72 lg:border-b-0 lg:border-r">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-podio-teal">
            <PodioIcon icon={app.icon} className="h-6 w-6 shrink-0" />
            <span className="min-w-0 truncate">{app.name}</span>
          </h1>
          {app.description && (
            <p className="mt-2 text-sm text-podio-secondary">{app.description}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href={`${baseHref}/edit`} className="text-podio-teal hover:underline">
              Edit app
            </Link>
            <Link href={`${baseHref}/import`} className="text-podio-teal hover:underline">
              Import
            </Link>
            <Link href={`${baseHref}/form`} className="text-podio-teal hover:underline">
              Webform
            </Link>
            <Link href={`${baseHref}/automations`} className="text-podio-teal hover:underline">
              Automations
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ExportButton appId={app.id} appName={app.name} fields={fields as any} />
            <SaveTemplateButton appId={app.id} appName={app.name} />
          </div>

          <h2 className="mt-5 text-lg font-semibold text-podio-ink">Views</h2>
          <ul className="mt-2 space-y-0.5 text-[15px]">
            <li>
              <Link
                href={baseHref}
                className={`flex items-center rounded px-2 py-1.5 text-podio-teal ${
                  !activeView ? "bg-podio-row-hover font-semibold" : "hover:bg-[#F3F3F3]"
                }`}
              >
                All {app.item_name.toLowerCase()}s
                <span className="ml-auto text-podio-ink">{totalItems.toLocaleString()}</span>
              </Link>
            </li>
            {(savedViews ?? []).map((v) => (
              <li key={v.id}>
                <Link
                  href={`${baseHref}?viewId=${v.id}`}
                  className={`flex items-center rounded px-2 py-1.5 text-podio-teal ${
                    activeView?.id === v.id
                      ? "bg-podio-row-hover font-semibold"
                      : "hover:bg-[#F3F3F3]"
                  }`}
                >
                  <span className="truncate">{v.name}</span>
                  {v.visibility === "private" && (
                    <span className="ml-auto text-xs text-podio-meta">🔒</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        {/* Main view area */}
        <section className="min-w-0 flex-1 px-4 pb-8 pt-2 lg:px-6">
      <ViewToolbar
        appId={app.id}
        baseHref={baseHref}
        layout={view}
        layouts={layoutToggles}
        newHref={`${baseHref}/new`}
        itemName={app.item_name.toLowerCase()}
        countLabel={countLabel}
        fields={fields as any}
        tableFields={fields.map((f) => ({ id: f.id, label: f.label }))}
        initialCols={colsList}
        members={members}
        activeViewId={activeView?.id ?? null}
        initialFilters={filters}
        initialSort={sort}
      />

      {view === "board" && categoryField && (
        <div className="mt-4">
          <BoardView
            fieldId={categoryField.id}
            options={(categoryField.config?.options ?? []) as CategoryOption[]}
            cards={boardCards}
            baseHref={baseHref}
          />
        </div>
      )}

      {view === "calendar" && dateField && (
        <div className="mt-4">
          <CalendarView
            monthStr={monthStr}
            cardsByDay={cardsByDay}
            baseHref={baseHref}
            viewQuery="view=calendar"
          />
        </div>
      )}

      {view === "badge" && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <ul className="mt-4 space-y-2">
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
      <div className="mt-4 overflow-x-auto rounded border border-podio-border bg-white shadow-sm">
        <table className="w-full text-left text-[15px]">
          <thead className="bg-podio-row-alt font-semibold text-podio-ink">
            <tr>
              <th className="w-10 border-b border-podio-border px-2 py-2" />
              <th className="border-b border-podio-border px-3 py-2 font-semibold">#</th>
              {visibleFields.map((f) => (
                <th key={f.id} className="border-b border-podio-border px-3 py-2 font-semibold">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item, i) => (
              <tr key={item.id} className="hover:bg-podio-row-hover">
                <td className="border-b border-[#EFEFEF] px-2 py-2.5 text-right text-podio-disabled">
                  {i + 1}
                </td>
                <td className="border-b border-[#EFEFEF] px-3 py-2.5">
                  <Link
                    href={`/org/${orgSlug}/${wsSlug}/${app.slug}/${item.item_number}`}
                    className="text-podio-teal hover:underline"
                  >
                    {item.item_number}
                  </Link>
                </td>
                {visibleFields.map((f) => (
                  <td key={f.id} className="border-b border-[#EFEFEF] px-3 py-2.5 text-podio-ink">
                    {render(f, item.id)}
                  </td>
                ))}
              </tr>
            ))}
            {visibleItems.length === 0 && (
              <tr>
                <td colSpan={2 + visibleFields.length}
                  className="px-4 py-10 text-podio-meta">
                  No {app.item_name.toLowerCase()}s yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
        </section>
      </div>
    </main>
  );
}
