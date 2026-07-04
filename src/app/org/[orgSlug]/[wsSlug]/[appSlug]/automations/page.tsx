import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutomationsBuilder } from "./automations-builder";
import { AdvancedBuilder } from "./advanced-builder";

export default async function AutomationsPage({
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
    .from("apps").select("id, name, slug, icon")
    .eq("workspace_id", ws.id).eq("slug", appSlug).single();
  if (!app) notFound();

  const { data: fields } = await supabase
    .from("app_fields")
    .select("id, label, type, config")
    .eq("app_id", app.id).eq("status", "active")
    .order("position");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id, user_profiles:user_id(full_name)")
    .eq("workspace_id", ws.id);
  const members = (memberRows ?? []).map((m: any) => ({
    user_id: m.user_id,
    full_name: m.user_profiles?.full_name ?? null,
  }));

  const { data: automations } = await supabase
    .from("automations")
    .select("id, name, status, version, trigger, conditions, actions, created_at")
    .eq("app_id", app.id)
    .order("created_at");

  const autoIds = (automations ?? []).map((a) => a.id);
  const { data: runs } = autoIds.length
    ? await supabase
        .from("automation_runs")
        .select("id, automation_id, item_id, status, error, logs, is_test, trigger_event, created_at, started_at, finished_at")
        .in("automation_id", autoIds)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] as any[] };

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">
        Automations — {app.icon} {app.name}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        When something happens in this app, do something automatically.
      </p>
      <div className="mt-6">
        <AutomationsBuilder
          appId={app.id}
          wsId={ws.id}
          fields={(fields ?? []) as any}
          members={members}
          automations={(automations ?? []) as any}
          runs={(runs ?? []) as any}
        />
        <div className="mt-4">
          <AdvancedBuilder
            appId={app.id}
            wsId={ws.id}
            fields={(fields ?? []) as any}
            members={members}
          />
        </div>
      </div>
    </main>
  );
}
