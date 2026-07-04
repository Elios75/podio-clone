import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, publicFileUrl, type CategoryOption } from "@/lib/fields";
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
    .select("id, label, type, is_primary, position, config")
    .eq("app_id", app.id).eq("status", "active")
    .order("position");
  // Separators are form-only; skip in the table
  const fields = (allFields ?? []).filter((f) => f.type !== "separator");

  const { data: items } = await supabase
    .from("items")
    .select("id, item_number, title, created_at")
    .eq("app_id", app.id).eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(500);

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
        const opt = ((field.config?.options ?? []) as CategoryOption[]).find(
          (o) => o.id === v.value_text
        );
        return opt ? (
          <span className="rounded px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: opt.color }}>
            {opt.label}
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
        return v.value?.path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={publicFileUrl(v.value.path)} alt={v.value_text ?? ""}
            className="h-8 w-8 rounded object-cover" />
        ) : <span className="text-slate-300">—</span>;
      case "file":
        return v.value?.path ? (
          <a href={publicFileUrl(v.value.path)} target="_blank"
            className="text-blue-600 hover:underline">
            {v.value_text}
          </a>
        ) : <span className="text-slate-300">—</span>;
      case "calculation":
        return <span className="text-slate-300">ƒ</span>;
      default:
        return <span className="line-clamp-1">{v.value_text}</span>;
    }
  }

  // ----- Saved views + filters/sort -----
  const { data: savedViews } = await supabase
    .from("app_views")
    .select("id, name, layout, visibility, filters, sort")
    .eq("app_id", app.id)
    .order("name");

  const activeView = sp.viewId
    ? (savedViews ?? []).find((v) => v.id === sp.viewId) ?? null
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

  // ----- View selection -----
  const savedLayout =
    activeView?.layout === "card"
      ? "board"
      : activeView?.layout === "calendar"
      ? "calendar"
      : activeView
      ? "table"
      : null;
  const view =
    sp.view === "board" || sp.view === "calendar"
      ? sp.view
      : sp.view === "table"
      ? "table"
      : savedLayout ?? "table";
  const baseHref = `/org/${orgSlug}/${wsSlug}/${app.slug}`;

  // ----- Apply filters + sort (in-memory over the EAV values; move to SQL at scale) -----
  const dayOf = (d: string) => new Date(d).toISOString().slice(0, 10);
  function matchesFilter(itemId: string, flt: Filter): boolean {
    const v = valueMap.get(itemId)?.get(flt.field_id);
    if (flt.op === "is_empty") return !v;
    if (flt.op === "not_empty") return !!v;
    if (!v) return false;
    switch (flt.op) {
      case "contains":
        return (v.value_text ?? "").toLowerCase().includes(String(flt.value ?? "").toLowerCase());
      case "equals":
        return v.value_text === flt.value;
      case "is":
        return v.value_text === flt.value || v.ref_user_id === flt.value;
      case "is_not":
        return v.value_text !== flt.value && v.ref_user_id !== flt.value;
      case "eq": return Number(v.value_number) === Number(flt.value);
      case "gt": return Number(v.value_number) > Number(flt.value);
      case "gte": return Number(v.value_number) >= Number(flt.value);
      case "lt": return Number(v.value_number) < Number(flt.value);
      case "lte": return Number(v.value_number) <= Number(flt.value);
      case "on": return !!v.value_date && dayOf(v.value_date) === flt.value;
      case "before": return !!v.value_date && dayOf(v.value_date) < flt.value;
      case "after": return !!v.value_date && dayOf(v.value_date) > flt.value;
      default: return true;
    }
  }

  let visibleItems = (items ?? []).filter((it) =>
    filters.every((flt) => (flt.field_id && flt.op ? matchesFilter(it.id, flt) : true))
  );

  if (sort[0]?.field_id) {
    const { field_id, dir } = sort[0];
    const mul = dir === "desc" ? -1 : 1;
    visibleItems = [...visibleItems].sort((a, b) => {
      const va = valueMap.get(a.id)?.get(field_id);
      const vb = valueMap.get(b.id)?.get(field_id);
      const ka = va?.value_number ?? va?.value_date ?? va?.value_text ?? "";
      const kb = vb?.value_number ?? vb?.value_date ?? vb?.value_text ?? "";
      if (ka === kb) return 0;
      if (ka === "" || ka === null) return 1; // empties last
      if (kb === "" || kb === null) return -1;
      return (ka > kb ? 1 : -1) * mul;
    });
  }
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
  const cardsByDay: Record<string, { item_number: number; title: string | null }[]> = {};
  if (dateField) {
    for (const item of visibleItems) {
      const v = valueMap.get(item.id)?.get(dateField.id);
      if (!v?.value_date) continue;
      const day = new Date(v.value_date).toISOString().slice(0, 10);
      (cardsByDay[day] ??= []).push({
        item_number: item.item_number,
        title: item.title,
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
      </div>

      <ViewToolbar
        appId={app.id}
        baseHref={baseHref}
        layout={view}
        fields={fields as any}
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

      {view === "table" && (
      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              {fields.map((f) => (
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
                {fields.map((f) => (
                  <td key={f.id} className="px-4 py-3">{render(f, item.id)}</td>
                ))}
              </tr>
            ))}
            {visibleItems.length === 0 && (
              <tr>
                <td colSpan={1 + fields.length}
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
