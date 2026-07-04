import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, publicFileUrl, type CategoryOption } from "@/lib/fields";

export default async function AppPage({
  params,
}: {
  params: Promise<{ orgSlug: string; wsSlug: string; appSlug: string }>;
}) {
  const { orgSlug, wsSlug, appSlug } = await params;
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
    .limit(100);

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

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {app.icon} {app.name}
        </h1>
        <Link
          href={`/org/${orgSlug}/${wsSlug}/${app.slug}/new`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New {app.item_name.toLowerCase()}
        </Link>
      </div>

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
            {(items ?? []).map((item) => (
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
            {(items ?? []).length === 0 && (
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
    </main>
  );
}
