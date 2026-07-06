import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PodioIcon } from "@/components/podio-icon";
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
    .from("workspaces").select("id, name, slug")
    .eq("organization_id", org.id).eq("slug", wsSlug).single();
  if (!ws) notFound();
  const { data: app } = await supabase
    .from("apps")
    .select("id, name, slug, icon, item_name, description, usage_instructions, layout_settings")
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

  // Default values from field config
  const defaults: Record<string, any> = {};
  for (const f of fields as any[]) {
    if (f.config?.default !== undefined && f.config?.default !== null && f.config?.default !== "") {
      defaults[f.id] = f.config.default;
    }
  }

  const base = `/org/${orgSlug}/${wsSlug}`;
  const appHref = `${base}/${app.slug}`;
  const newLabel = `New ${app.item_name}`;
  const instructions =
    (app.usage_instructions ?? "").trim() ||
    (app.description ?? "").trim() ||
    `Fill in the fields and save to add a new ${app.item_name} to ${app.name}.`;

  return (
    <main className="min-h-full bg-podio-page">
      {/* Creation header bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-podio-border bg-white px-4 pt-2">
        {/* Left cluster: tab-like chip + template/actions buttons */}
        <span className="self-end rounded-t bg-podio-teal px-4 py-2.5 text-sm font-semibold text-white">
          {newLabel}
        </span>
        <Link
          href={`${base}/${app.slug}/edit`}
          className="mb-2 rounded-sm bg-podio-row-hover px-3 py-1.5 text-sm font-semibold text-podio-ink hover:bg-podio-border"
        >
          Modify Template
        </Link>
        <button
          type="button"
          className="mb-2 px-1 py-1.5 text-sm text-podio-secondary hover:text-podio-ink"
        >
          Actions ⌄
        </button>

        {/* Center: breadcrumb */}
        <nav className="mx-auto mb-2 hidden items-center gap-1.5 text-sm md:flex">
          <Link href={base} className="text-podio-teal hover:underline">
            {ws.name}
          </Link>
          <span className="text-podio-meta">›</span>
          <Link
            href={appHref}
            className="flex items-center gap-1.5 text-podio-teal hover:underline"
          >
            <PodioIcon icon={app.icon} name={app.name} className="h-5 w-5" />
            {app.name}
          </Link>
          <span className="text-podio-meta">›</span>
          <span className="text-podio-ink">{newLabel}</span>
        </nav>
        {/* Right spacer keeps the breadcrumb roughly centered */}
        <span className="hidden lg:block lg:w-40" aria-hidden />
      </div>

      {/* Two-column body: form + Instructions rail */}
      <div className="flex items-start gap-6 p-4 lg:p-6">
        <section className="min-w-0 flex-1 rounded border border-podio-border bg-white p-6 shadow-sm">
          <ItemForm
            appId={app.id}
            fields={(fields ?? []) as any}
            members={members}
            relatedItemsByField={relatedItemsByField}
            initialValues={defaults}
            backHref={appHref}
            itemName={app.item_name}
            columns={(app.layout_settings as any)?.columns}
          />
        </section>
        <aside className="hidden w-80 shrink-0 lg:block">
          <div className="rounded border border-podio-border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-podio-teal">Instructions</h2>
            <p className="mt-2 whitespace-pre-line text-[15px] text-podio-ink">
              {instructions}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
