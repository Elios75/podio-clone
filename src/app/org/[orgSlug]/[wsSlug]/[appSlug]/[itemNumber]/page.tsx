import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ItemForm } from "../item-form";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{
    orgSlug: string;
    wsSlug: string;
    appSlug: string;
    itemNumber: string;
  }>;
}) {
  const { orgSlug, wsSlug, appSlug, itemNumber } = await params;
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

  const { data: item } = await supabase
    .from("items")
    .select("id, item_number, title, created_at, updated_at")
    .eq("app_id", app.id)
    .eq("item_number", Number(itemNumber))
    .single();
  if (!item) notFound();

  const { data: fields } = await supabase
    .from("app_fields")
    .select("id, label, type, is_required, help_text, config")
    .eq("app_id", app.id).eq("status", "active")
    .order("position");

  const { data: values } = await supabase
    .from("item_field_values")
    .select("field_id, value")
    .eq("item_id", item.id);

  const initialValues: Record<string, any> = {};
  for (const v of values ?? []) initialValues[v.field_id] = v.value;

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id, user_profiles:user_id(full_name)")
    .eq("workspace_id", ws.id);
  const members = (memberRows ?? []).map((m: any) => ({
    user_id: m.user_id,
    full_name: m.user_profiles?.full_name ?? null,
  }));

  // Options for relationship fields
  const relFields = (fields ?? []).filter(
    (f: any) => f.type === "relationship" && f.config?.related_app_id
  );
  const relatedItemsByField: Record<string, any[]> = {};
  for (const rf of relFields) {
    const { data: relItems } = await supabase
      .from("items")
      .select("id, title, item_number")
      .eq("app_id", (rf as any).config.related_app_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(100);
    relatedItemsByField[rf.id] = relItems ?? [];
  }

  const backHref = `/org/${orgSlug}/${wsSlug}/${app.slug}`;

  return (
    <main className="mx-auto max-w-xl p-8">
      <p className="text-xs text-slate-400">
        {app.icon} {app.name} · #{item.item_number}
      </p>
      <h1 className="text-2xl font-semibold">
        {item.title ?? `${app.item_name} #${item.item_number}`}
      </h1>
      <p className="mt-1 text-xs text-slate-400">
        Created {new Date(item.created_at).toLocaleString()} · Updated{" "}
        {new Date(item.updated_at).toLocaleString()}
      </p>
      <div className="mt-6">
        <ItemForm
          appId={app.id}
          fields={(fields ?? []) as any}
          members={members}
          relatedItemsByField={relatedItemsByField}
          itemId={item.id}
          initialValues={initialValues}
          backHref={backHref}
        />
      </div>
    </main>
  );
}
