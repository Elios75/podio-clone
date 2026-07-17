import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppEditor } from "./app-editor";

export default async function EditAppPage({
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
    .select("id, name, slug, icon, item_name, description, usage_instructions, schema_version, layout_settings")
    .eq("workspace_id", ws.id).eq("slug", appSlug).single();
  if (!app) notFound();

  const { data: fields } = await supabase
    .from("app_fields")
    .select("id, external_id, label, type, help_text, is_required, is_hidden, is_primary, position, config")
    .eq("app_id", app.id).eq("status", "active")
    .order("position");

  const { data: counts } = await supabase.rpc("field_value_counts", {
    p_app: app.id,
  });
  const countByField: Record<string, number> = {};
  for (const c of counts ?? []) countByField[c.field_id] = Number(c.cnt);

  // Rollup sources: relationship fields elsewhere in this workspace that point at this app
  const { data: relFields } = await supabase
    .from("app_fields")
    .select("id, label, app_id, apps:app_id(name, workspace_id)")
    .eq("type", "relationship")
    .eq("status", "active")
    .eq("config->>related_app_id", app.id);
  const rollupSources = (relFields ?? [])
    .filter((f: any) => f.apps?.workspace_id === ws.id)
    .map((f: any) => ({
      id: f.id,
      label: `${f.apps?.name} → ${f.label}`,
      app_id: f.app_id,
    }));
  const srcAppIds = [...new Set(rollupSources.map((r) => r.app_id))];
  const { data: srcNumFields } = srcAppIds.length
    ? await supabase
        .from("app_fields")
        .select("id, label, app_id")
        .in("app_id", srcAppIds)
        .in("type", ["number", "money", "progress", "duration", "calculation"])
        .eq("status", "active")
    : { data: [] as any[] };

  // Relationship-target choices: every non-archived app the user can see in
  // this org, across ALL workspaces (RLS already limits to memberships).
  // Labeled "Workspace / App"; includes this app itself (subtask hierarchies).
  const { data: orgApps } = await supabase
    .from("apps")
    .select("id, name, workspaces:workspace_id(name, organization_id)")
    .eq("is_archived", false)
    .order("name");
  const relAppChoices = (orgApps ?? [])
    .filter((a: any) => a.workspaces?.organization_id === org.id)
    .map((a: any) => ({
      id: a.id as string,
      label: `${a.workspaces?.name ?? "?"} / ${a.name}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const { data: revisions } = await supabase
    .from("app_schema_revisions")
    .select("version, created_at, changed_by")
    .eq("app_id", app.id)
    .order("version", { ascending: false })
    .limit(10);

  return (
    <main className="min-h-full bg-podio-page">
      <AppEditor
        app={app}
        wsName={ws.name}
        initialFields={(fields ?? []) as any}
        countByField={countByField}
        backHref={`/org/${orgSlug}/${wsSlug}/${app.slug}`}
        newHref={`/org/${orgSlug}/${wsSlug}/${app.slug}/new`}
        wsHref={`/org/${orgSlug}/${wsSlug}`}
        revisions={(revisions ?? []) as any}
        rollupSources={rollupSources}
        srcNumFields={(srcNumFields ?? []) as any}
        relAppChoices={relAppChoices}
      />
    </main>
  );
}
