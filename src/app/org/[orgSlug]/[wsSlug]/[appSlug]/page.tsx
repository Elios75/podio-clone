import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, type CategoryOption } from "@/lib/fields";
import { BoardView } from "./board-view";
import { CalendarView } from "./calendar-view";
import { ViewToolbar, type Filter, type Sort } from "./view-toolbar";
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
    .from("apps").select("id, name, slug, icon, item_name")
    .eq("workspace_id", ws.id).eq("slug", appSlug).single();
  if (!app) notFound();

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
    if (!v) return <span className="text-slate-300">—</span>;

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
                className="rounded px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: opt.color }}>
                {opt.label}
              </span>
            ))}
          </span>
        ) : <span className="text-slate-300">—</span>;
      }
      case "contact":
        return <span>{nameByUser.get(v.ref_user_id) ?? "Member"}</span>;
      case "relationship": {
        const ref = refById.get(v.ref_item_id);
        return ref ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
            #{ref.item_number} {ref.title ?? ""}
          </span>
        ) : <span className="text-slate-300">—</span>;
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
            <div className="h-2 w-16 rounded bg-slate-200">
              <div className="h-2 rounded bg-blue-500"
                style={{ width: `${Math.min(100, Number(v.value_number ?? 0))}%` }} />
            </div>
            <span className="text-xs text-slate-500">{v.value_number}%</span>
          </div>
        );
      case "duration":
        return <span>{formatDuration(Number(v.value_number ?? 0))}</span>;
      case "phone":
        return <a href={`tel:${v.value_text}`} className="text-blue-600 hover:underline">{v.value_text}</a>;
      case "email":
        return <a href={`mailto:${v.value_text}`} className="text-blue-600 hover:underline">{v.value_text}</a>;
      case "link":
        return (
          <a href={v.value_text} target="_blank" className="text-blue-600 hover:underline">
            {v.value_text?.replace(/^https?:\/\//, "").slice(0, 30)}
          </a>
        );
      case "image":
        return v.value?.path && signedByPath.get(v.value.path) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedByPath.get(v.value.path)} alt={v.value_text ?? ""}
            className="h-8 w-8 rounded object-cover" />
        ) : <span className="text-slate-300">—</span>;
      case "file":
        return v.value?.path && signedByPath.get(v.value.path) ? (
          <a href={signedByPath.get(v.value.path)} target="_blank"
            className="text-blue-600 hover:underline">
            {v.value_text}
          </a>
        ) : <span className="text-slate-300">—</span>;
      case "calculation":
        return v.value_number != null ? (
          <span className="font-medium">{Number(v.value_number).toLocaleString()}</span>
        ) : (
          <span className="text-slate-300">ƒ</span>
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

  const tabCls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${
      active
        ? "bg-slate-900 font-medium text-white"
        : "border border-slate-300 text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {app.icon} {app.name}
        </h1>
        <div className="flex items-center gap-2">
          <Link href={`${baseHref}/edit`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            ✏️ Edit app
          </Link>
          <Link href={`${baseHref}/import`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Import
          </Link>
          <ExportButton appId={app.id} appName={app.name} fields={fields as any} />
          <SaveTemplateButton appId={app.id} appName={app.name} />
          <Link href={`${baseHref}/form`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Webform
          </Link>
          <Link href={`${baseHref}/automations`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            ⚡ Automations
          </Link>
          <Link
            href={`${baseHref}/new`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New {app.item_name.toLowerCase()}
          </Link>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Link href={baseHref} className={tabCls(view === "table")}>Table</Link>
        {categoryField ? (
          <Link href={`${baseHref}?view=board`} className={tabCls(view === "board")}>Board</Link>
        ) : (
          <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-300" title="Add a Category field to use the board">Board</span>
        )}
        {dateField ? (
          <Link href={`${baseHref}?view=calendar`} className={tabCls(view === "calendar")}>Calendar</Link>
        ) : (
          <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-300" title="Add a Date field to use the calendar">Calendar</span>
        )}
        <Link href={`${baseHref}?view=badge`} className={tabCls(view === "badge")}>Badge</Link>
        <Link href={`${baseHref}?view=stream`} className={tabCls(view === "stream")}>Stream</Link>
        <span className="ml-auto text-xs text-slate-400">
          {visibleItems.length === totalItems
            ? `${totalItems.toLocaleString()} ${app.item_name.toLowerCase()}${totalItems === 1 ? "" : "s"}`
            : `${visibleItems.length.toLocaleString()} of ${totalItems.toLocaleString()}`}
        </span>
      </div>

      <ViewToolbar
        appId={app.id}
        baseHref={baseHref}
        layout={view}
        fields={fields as any}
        tableFields={fields.map((f) => ({ id: f.id, label: f.label }))}
        initialCols={colsList}
        members={members}
        savedViews={(savedViews ?? []).map((v) => ({
          id: v.id,
          name: v.name,
          visibility: v.visibility,
        }))}
        activeViewId={activeView?.id ?? null}
        initialFilters={filters}
        initialSort={sort}
      />

      {view === "board" && categoryField && (
        <div className="mt-6">
          <BoardView
            fieldId={categoryField.id}
            options={(categoryField.config?.options ?? []) as CategoryOption[]}
            cards={boardCards}
            baseHref={baseHref}
          />
        </div>
      )}

      {view === "calendar" && dateField && (
        <div className="mt-6">
          <CalendarView
            monthStr={monthStr}
            cardsByDay={cardsByDay}
            baseHref={baseHref}
            viewQuery="view=calendar"
          />
        </div>
      )}

      {view === "badge" && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => (
            <Link key={item.id}
              href={`${baseHref}/${item.item_number}`}
              className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-400">
              <div className="flex items-center justify-between">
                <span className="truncate font-medium">
                  {item.title ?? `#${item.item_number}`}
                </span>
                <span className="text-xs text-slate-300">#{item.item_number}</span>
              </div>
              <dl className="mt-2 space-y-1">
                {visibleFields.slice(0, 5).map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-xs">
                    <dt className="w-20 shrink-0 truncate text-slate-400">{f.label}</dt>
                    <dd className="min-w-0 truncate">{render(f, item.id)}</dd>
                  </div>
                ))}
              </dl>
            </Link>
          ))}
          {visibleItems.length === 0 && (
            <p className="col-span-full rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
              No {app.item_name.toLowerCase()}s match.
            </p>
          )}
        </div>
      )}

      {view === "stream" && (
        <ul className="mt-6 space-y-2">
          {[...visibleItems]
            .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
            .map((item) => (
              <li key={item.id}>
                <Link href={`${baseHref}/${item.item_number}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-blue-400">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {item.title ?? `#${item.item_number}`}
                    </span>
                    <span className="block text-xs text-slate-400">
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
            <li className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
              No {app.item_name.toLowerCase()}s match.
            </li>
          )}
        </ul>
      )}

      {view === "table" && (
      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              {visibleFields.map((f) => (
                <th key={f.id} className="px-4 py-3">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-400">
                  <Link
                    href={`/org/${orgSlug}/${wsSlug}/${app.slug}/${item.item_number}`}
                    className="text-blue-600 hover:underline"
                  >
                    {item.item_number}
                  </Link>
                </td>
                {visibleFields.map((f) => (
                  <td key={f.id} className="px-4 py-3">{render(f, item.id)}</td>
                ))}
              </tr>
            ))}
            {visibleItems.length === 0 && (
              <tr>
                <td colSpan={1 + visibleFields.length}
                  className="px-4 py-10 text-center text-slate-400">
                  No {app.item_name.toLowerCase()}s yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </main>
  );
}
