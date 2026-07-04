import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ItemForm } from "../item-form";

export default async function NewItemPage({
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
    .select("id, label, type, is_required, is_hidden, help_text, config")
    .eq("app_id", app.id).eq("status", "active")
    .order("position");
  const fields = (allFields ?? []).filter((f) => !f.is_hidden);

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
      <h1 className="text-2xl font-semibold">
        New {app.item_name.toLowerCase()} — {app.icon} {app.name}
      </h1>
      <div className="mt-6">
        <ItemForm
          appId={app.id}
          fields={(fields ?? []) as any}
          members={members}
          relatedItemsByField={relatedItemsByField}
          backHref={backHref}
        />
      </div>
    </main>
  );
}
