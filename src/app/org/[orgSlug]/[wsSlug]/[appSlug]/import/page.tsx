import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportCsv } from "./import-csv";

export default async function ImportPage({
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

  const { data: fields } = await supabase
    .from("app_fields")
    .select("id, label, type, config")
    .eq("app_id", app.id).eq("status", "active")
    .order("position");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">
        Import CSV — {app.icon} {app.name}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Upload a CSV, map its columns to fields, and each row becomes a{" "}
        {app.item_name.toLowerCase()}.
      </p>
      <div className="mt-6">
        <ImportCsv
          appId={app.id}
          fields={(fields ?? []) as any}
          backHref={`/org/${orgSlug}/${wsSlug}/${app.slug}`}
        />
      </div>
    </main>
  );
}
