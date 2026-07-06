import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardTiles, type TileData } from "./dashboard-tiles";
import { MemberRoleSelect } from "@/components/member-role-select";
import { StatusComposer } from "./status-composer";
import { AppTabBar } from "./app-tab-bar";
import { WorkspaceHeader } from "./workspace-header";
import { FollowToggle } from "./follow-toggle";
import { PanelBoard } from "./panel-board";

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
    .select("id, name, slug, description, privacy, created_at, created_by")
    .eq("organization_id", org.id)
    .eq("slug", wsSlug)
    .single();
  if (!ws) notFound();

  const { data: members } = await supabase
    .from("workspace_members")
    .select("id, role, user_id, user_profiles:user_id(full_name, avatar_url)")
    .eq("workspace_id", ws.id);

  // Org members not yet in this workspace (for the INVITE control)
  const memberIds = new Set((members ?? []).map((m: any) => m.user_id));
  const { data: orgMemberRows } = await supabase
    .from("organization_members")
    .select("user_id, user_profiles:user_id(full_name)")
    .eq("organization_id", org.id)
    .limit(100);
  const invitable = (orgMemberRows ?? [])
    .filter((m: any) => !memberIds.has(m.user_id))
    .map((m: any) => ({
      user_id: m.user_id,
      full_name: m.user_profiles?.full_name ?? null,
    }));

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

  const { data: statusRows } = await supabase
    .from("status_posts")
    .select("id, body, body_rich, created_by, created_at")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Files/links attached to those status posts (composer 📎/🔗)
  const statusIds = (statusRows ?? []).map((s) => s.id);
  const { data: statusAttachRows } = statusIds.length
    ? await supabase
        .from("file_attachments")
        .select("target_id, files:file_id(id, name, storage_path, external_url)")
        .eq("target_type", "status_post")
        .in("target_id", statusIds)
    : { data: [] as any[] };
  const attachPaths = (statusAttachRows ?? [])
    .map((a: any) => a.files?.storage_path)
    .filter(Boolean) as string[];
  const { data: signedArr } = attachPaths.length
    ? await supabase.storage.from("podio-files").createSignedUrls(attachPaths, 3600)
    : { data: [] as any[] };
  const signedByPath: Record<string, string> = {};
  for (const s of signedArr ?? []) if (s.signedUrl) signedByPath[s.path] = s.signedUrl;
  const attachmentsByStatus: Record<string, { name: string; url: string | null }[]> = {};
  for (const a of statusAttachRows ?? []) {
    (attachmentsByStatus[(a as any).target_id] ??= []).push({
      name: (a as any).files?.name ?? "file",
      url:
        (a as any).files?.external_url ??
        ((a as any).files?.storage_path
          ? signedByPath[(a as any).files.storage_path] ?? null
          : null),
    });
  }

  const { data: activityRows } = await supabase
    .from("activity_events")
    .select("id, event_type, actor_id, payload, created_at")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const feedActorIds = [
    ...new Set(
      [...(activityRows ?? []).map((a) => a.actor_id), ws.created_by].filter(
        Boolean
      )
    ),
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
  const creatorName = ws.created_by
    ? actorName.get(ws.created_by) ?? "Someone"
    : "Someone";

  // ----- Right-rail: open tasks + upcoming calendar entries -----
  const {
    data: openTasks,
    count: openTaskCount,
  } = await supabase
    .from("tasks")
    .select("id, title, due_at", { count: "exact" })
    .eq("workspace_id", ws.id)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: upcomingTasks } = await supabase
    .from("tasks")
    .select("id, title, due_at")
    .eq("workspace_id", ws.id)
    .not("due_at", "is", null)
    .gte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(5);

  // ----- Follow state for the composer footer -----
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let followMuted = false;
  if (user) {
    const { data: followRow } = await supabase
      .from("follows")
      .select("muted")
      .eq("user_id", user.id)
      .eq("target_type", "workspace")
      .eq("target_id", ws.id)
      .maybeSingle();
    followMuted = followRow?.muted ?? false;
  }

  return (
    <main className="min-h-screen bg-podio-page pb-10">
      <AppTabBar
        orgSlug={orgSlug}
        wsSlug={ws.slug}
        apps={(apps ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          icon: a.icon,
        }))}
        activityActive
      />

      {/* Podio workspace landing = the Activity stream. Apps appear only in
          the tab bar above; the body is a two-column feed + right rail whose
          panels can be dragged to rearrange (order kept in localStorage). */}
      <PanelBoard
        wsId={ws.id}
        panels={[
          {
            id: "header",
            title: "Workspace card",
            column: "left",
            node: (
          <WorkspaceHeader
            orgSlug={orgSlug}
            wsSlug={ws.slug}
            wsId={ws.id}
            name={ws.name}
            privacy={ws.privacy}
            description={ws.description}
            members={(members ?? []).map((m: any) => ({
              id: m.id,
              user_id: m.user_id,
              full_name: m.user_profiles?.full_name ?? null,
              avatar_url: m.user_profiles?.avatar_url ?? null,
            }))}
            invitable={invitable}
          />
            ),
          },
          {
            id: "feed",
            title: "Activity feed",
            column: "left",
            node: (
          <section className="rounded border border-podio-border bg-white p-4 shadow-sm">
            <StatusComposer wsId={ws.id} orgId={org.id} />
            {(statusRows ?? []).length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {(statusRows ?? []).map((s: any) => (
                  <li key={s.id}
                    className="rounded bg-podio-row-alt px-3 py-2 text-sm">
                    {s.body_rich?.kind === "question" && (
                      <span className="mr-1" title="Question">❓</span>
                    )}
                    <span className="font-semibold text-podio-ink">
                      {actorName.get(s.created_by) ?? "Someone"}:
                    </span>{" "}
                    <span className="text-podio-secondary">{s.body}</span>
                    <span className="ml-2 text-xs text-podio-meta">
                      {new Date(s.created_at).toLocaleString()}
                    </span>
                    {(attachmentsByStatus[s.id] ?? []).length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {(attachmentsByStatus[s.id] ?? []).map((f, i) =>
                          f.url ? (
                            <a key={i} href={f.url} target="_blank" rel="noreferrer"
                              className="rounded border border-podio-border bg-white px-2 py-0.5 text-xs text-podio-teal hover:bg-podio-row-hover">
                              📎 {f.name}
                            </a>
                          ) : (
                            <span key={i}
                              className="rounded border border-podio-border bg-white px-2 py-0.5 text-xs text-podio-meta">
                              📎 {f.name}
                            </span>
                          )
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-4 space-y-1.5 border-t border-podio-border pt-3">
              {(activityRows ?? []).map((a: any) => (
                <li key={a.id} className="flex items-center gap-2 px-1 py-1.5 text-sm text-podio-secondary">
                  <span className="font-semibold text-podio-ink">
                    {a.actor_id ? actorName.get(a.actor_id) ?? "Someone" : "Someone"}
                  </span>
                  <span>
                    {a.event_type === "item_created" && "created"}
                    {a.event_type === "item_updated" && "updated"}
                    {a.event_type === "comment_added" && "commented on"}
                  </span>
                  <span className="truncate font-semibold text-podio-ink">
                    {a.payload?.item_title ?? "an item"}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-podio-meta">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
              {/* Genesis entry — always the last row of the feed */}
              <li className="flex items-center gap-2 px-1 py-1.5 text-sm text-podio-secondary">
                <span aria-hidden="true">⚡</span>
                <span className="truncate">
                  <span className="font-semibold text-podio-ink">
                    {creatorName}
                  </span>{" "}
                  created the{" "}
                  <span className="font-semibold text-podio-ink">
                    {ws.name}
                  </span>{" "}
                  workspace
                </span>
                <span className="ml-auto shrink-0 text-xs text-podio-meta">
                  {new Date(ws.created_at).toLocaleDateString()}
                </span>
              </li>
            </ul>

            {/* Footer bar: post-by-email hint + follow toggle */}
            <div className="-mx-4 -mb-4 mt-4 flex items-center justify-end gap-4 rounded-b border-t border-podio-border bg-podio-row-alt px-3 py-2 text-sm">
              <span
                className="text-podio-secondary"
                title="Post by email — wire an inbound address in docs/EMAIL.md"
              >
                ✉️ Create a status via email
              </span>
              {user && (
                <FollowToggle
                  userId={user.id}
                  wsId={ws.id}
                  initialMuted={followMuted}
                />
              )}
            </div>
          </section>
            ),
          },
          {
            id: "tasks",
            title: `${ws.name} Tasks`,
            column: "right",
            node: (
          <section className="rounded border border-podio-border bg-white shadow-sm">
            <div className="p-4">
              <h2 className="font-semibold text-podio-teal">
                {ws.name} Tasks{" "}
                <span className="font-normal text-podio-meta">
                  {openTaskCount ?? 0}
                </span>
              </h2>
              {(openTasks ?? []).length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {(openTasks ?? []).map((t: any) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate text-podio-ink">{t.title}</span>
                      {t.due_at && (
                        <span className="shrink-0 text-xs text-podio-meta">
                          {new Date(t.due_at).toLocaleDateString()}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-16 text-center text-sm text-podio-meta">
                  No tasks to show
                </p>
              )}
            </div>
            <Link
              href={`/org/${orgSlug}/${ws.slug}/tasks`}
              className="block border-t border-podio-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-podio-secondary hover:text-podio-teal"
            >
              + Create task
            </Link>
          </section>
            ),
          },
          {
            id: "calendar",
            title: `${ws.name} Calendar`,
            column: "right",
            node: (
          <section className="rounded border border-podio-border bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-podio-teal">
              {ws.name} Calendar
            </h2>
            {(upcomingTasks ?? []).length > 0 ? (
              <ul className="mt-2 space-y-1">
                {(upcomingTasks ?? []).map((t: any) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="shrink-0 text-xs text-podio-meta">
                      {new Date(t.due_at).toLocaleDateString()}
                    </span>
                    <span className="truncate text-podio-ink">{t.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-podio-meta">Nothing scheduled</p>
            )}
            <Link
              href="/calendar"
              className="mt-3 inline-block text-xs text-podio-teal hover:underline"
            >
              Open calendar
            </Link>
          </section>
            ),
          },
          {
            id: "dashboard",
            title: "Dashboard",
            column: "right",
            node: (
          <section
            id="dashboard"
            className="rounded border border-podio-border bg-white p-4 shadow-sm"
          >
            <h2 className="font-semibold text-podio-teal">Dashboard</h2>
            <div className="mt-3">
              <DashboardTiles wsId={ws.id} apps={appInfos} tiles={tiles} />
            </div>
          </section>
            ),
          },
          {
            id: "tools",
            title: "Workspace tools",
            column: "right",
            node: (
          <section className="rounded border border-podio-border bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-podio-teal">Workspace tools</h2>
            <ul className="mt-2 space-y-0.5 text-sm">
              <li>
                <Link href={`/org/${orgSlug}/${ws.slug}/map`}
                  className="block rounded px-2 py-1.5 text-podio-teal hover:bg-podio-row-hover">
                  🗺️ Relationship map
                </Link>
              </li>
              <li>
                <Link href={`/org/${orgSlug}/${ws.slug}/files`}
                  className="block rounded px-2 py-1.5 text-podio-teal hover:bg-podio-row-hover">
                  Files
                </Link>
              </li>
              <li>
                <Link href={`/org/${orgSlug}/${ws.slug}/market`}
                  className="block rounded px-2 py-1.5 text-podio-teal hover:bg-podio-row-hover">
                  App market
                </Link>
              </li>
              <li>
                <Link href={`/org/${orgSlug}/${ws.slug}/new-app-from-csv`}
                  className="block rounded px-2 py-1.5 text-podio-teal hover:bg-podio-row-hover">
                  New app from CSV
                </Link>
              </li>
              <li>
                <Link href={`/org/${orgSlug}/${ws.slug}/ai-builder`}
                  className="block rounded px-2 py-1.5 text-podio-teal hover:bg-podio-row-hover">
                  ✨ AI app builder
                </Link>
              </li>
            </ul>
          </section>
            ),
          },
          {
            id: "members",
            title: "Members",
            column: "right",
            node: (
          <section className="rounded border border-podio-border bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-podio-teal">Members</h2>
            <ul className="mt-2 space-y-2">
              {(members ?? []).map((m: any) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-podio-ink">
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
          </section>
            ),
          },
        ]}
        rightFooter={
          /* Add-tile affordance — jumps up to the Dashboard panel */
          <a
            href="#dashboard"
            className="flex h-28 w-full items-center justify-center rounded border-2 border-dashed border-podio-border text-sm font-semibold uppercase tracking-wide text-podio-meta hover:border-podio-meta hover:text-podio-secondary"
          >
            + Add tile
          </a>
        }
      />
    </main>
  );
}
