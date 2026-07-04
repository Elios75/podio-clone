import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardTiles, type TileData } from "./dashboard-tiles";
import { MemberRoleSelect } from "@/components/member-role-select";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ orgSlug: string; wsSlug: string }>;
}) {
  const { orgSlug, wsSlug } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, slug")
    .eq("slug", orgSlug)
    .single();
  if (!org) notFound();

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, slug, description, privacy, created_at")
    .eq("organization_id", org.id)
    .eq("slug", wsSlug)
    .single();
  if (!ws) notFound();

  const { data: members } = await supabase
    .from("workspace_members")
    .select("id, role, user_id, user_profiles:user_id(full_name)")
    .eq("workspace_id", ws.id);

  const { data: apps } = await supabase
    .from("apps")
    .select("id, name, slug, icon, item_name")
    .eq("workspace_id", ws.id)
    .eq("is_archived", false)
    .order("name");

  // ----- Dashboard tiles + aggregates -----
  const { data: tileRows } = await supabase
    .from("dashboard_tiles")
    .select("*")
    .eq("workspace_id", ws.id)
    .order("position");

  const appIds = (apps ?? []).map((a) => a.id);
  const { data: wsFields } = appIds.length
    ? await supabase
        .from("app_fields")
        .select("id, app_id, label, type, config")
        .in("app_id", appIds)
        .eq("status", "active")
    : { data: [] as any[] };

  const tiles: TileData[] = [];
  for (const t of tileRows ?? []) {
    const cfg = t.config ?? {};
    if (t.kind === "count") {
      const { count } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("app_id", t.app_id)
        .eq("is_deleted", false);
      tiles.push({ id: t.id, title: t.title, kind: t.kind, value: count ?? 0 });
    } else if (t.kind === "sum" || t.kind === "avg") {
      const { data: nums } = await supabase
        .from("item_field_values")
        .select("value_number")
        .eq("field_id", cfg.number_field_id)
        .not("value_number", "is", null)
        .limit(2000);
      const list = (nums ?? []).map((n) => Number(n.value_number));
      const sum = list.reduce((a, b) => a + b, 0);
      tiles.push({
        id: t.id, title: t.title, kind: t.kind,
        value: t.kind === "sum" ? sum : list.length ? sum / list.length : 0,
      });
    } else if (t.kind === "grouped") {
      const groupField = (wsFields ?? []).find((f) => f.id === cfg.group_field_id);
      const options: any[] = groupField?.config?.options ?? [];
      const { data: groupVals } = await supabase
        .from("item_field_values")
        .select("item_id, value_text")
        .eq("field_id", cfg.group_field_id)
        .limit(2000);
      let numByItem = new Map<string, number>();
      if (cfg.number_field_id) {
        const { data: numVals } = await supabase
          .from("item_field_values")
          .select("item_id, value_number")
          .eq("field_id", cfg.number_field_id)
          .limit(2000);
        numByItem = new Map((numVals ?? []).map((v) => [v.item_id, Number(v.value_number ?? 0)]));
      }
      const groups = options.map((o) => {
        const rows = (groupVals ?? []).filter((g) => g.value_text === o.id);
        return {
          label: o.label,
          color: o.color,
          value: cfg.number_field_id
            ? rows.reduce((a, r) => a + (numByItem.get(r.item_id) ?? 0), 0)
            : rows.length,
        };
      });
      tiles.push({ id: t.id, title: t.title, kind: t.kind, groups });
    }
  }

  const appInfos = (apps ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    numberFields: (wsFields ?? [])
      .filter((f) => f.app_id === a.id && ["number", "money", "progress", "duration"].includes(f.type))
      .map((f) => ({ id: f.id, label: f.label })),
    categoryFields: (wsFields ?? [])
      .filter((f) => f.app_id === a.id && f.type === "category")
      .map((f) => ({ id: f.id, label: f.label })),
  }));

  const { data: activityRows } = await supabase
    .from("activity_events")
    .select("id, event_type, actor_id, payload, created_at")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const feedActorIds = [
    ...new Set((activityRows ?? []).map((a) => a.actor_id).filter(Boolean)),
  ];
  const { data: feedProfiles } = feedActorIds.length
    ? await supabase
        .from("user_profiles")
        .select("user_id, full_name")
        .in("user_id", feedActorIds)
    : { data: [] as any[] };
  const actorName = new Map(
    (feedProfiles ?? []).map((p) => [p.user_id, p.full_name])
  );

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{ws.name}</h1>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {ws.privacy}
        </span>
      </div>
      {ws.description && (
        <p className="mt-1 text-sm text-slate-500">{ws.description}</p>
      )}

      <h2 className="mt-8 text-lg font-medium">Dashboard</h2>
      <div className="mt-3">
        <DashboardTiles wsId={ws.id} apps={appInfos} tiles={tiles} />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-medium">Apps</h2>
        <div className="flex gap-2">
          <Link
            href={`/org/${orgSlug}/${ws.slug}/market`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            App market
          </Link>
          <Link
            href={`/org/${orgSlug}/${ws.slug}/new-app`}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New app
          </Link>
        </div>
      </div>
      {(apps ?? []).length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No apps yet — build your first one. This is where your CRM, project
          tracker, or help desk will live.
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(apps ?? []).map((app) => (
            <li key={app.id}>
              <Link
                href={`/org/${orgSlug}/${ws.slug}/${app.slug}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-400"
              >
                <span className="font-medium">
                  {app.icon ? `${app.icon} ` : ""}
                  {app.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-lg font-medium">Activity</h2>
      <ul className="mt-3 space-y-1.5">
        {(activityRows ?? []).map((a: any) => (
          <li key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
            <span className="font-medium text-slate-700">
              {a.actor_id ? actorName.get(a.actor_id) ?? "Someone" : "Someone"}
            </span>
            <span>
              {a.event_type === "item_created" && "created"}
              {a.event_type === "item_updated" && "updated"}
              {a.event_type === "comment_added" && "commented on"}
            </span>
            <span className="truncate font-medium text-slate-700">
              {a.payload?.item_title ?? "an item"}
            </span>
            <span className="ml-auto shrink-0 text-xs text-slate-400">
              {new Date(a.created_at).toLocaleString()}
            </span>
          </li>
        ))}
        {(activityRows ?? []).length === 0 && (
          <li className="text-sm text-slate-400">No activity yet.</li>
        )}
      </ul>

      <h2 className="mt-10 text-lg font-medium">Members</h2>
      <ul className="mt-3 space-y-2">
        {(members ?? []).map((m: any) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2"
          >
            <span className="text-sm">
              {m.user_profiles?.full_name ?? m.user_id}
            </span>
            <MemberRoleSelect
              table="workspace_members"
              memberId={m.id}
              role={m.role}
              options={["admin", "member", "light", "guest"]}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
