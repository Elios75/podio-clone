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
import { WorkspaceCanvas } from "./workspace-embeds";
import { FeedComment } from "./feed-comment";
import { PodioIcon } from "@/components/podio-icon";

// Relative timestamps for the activity feed ("2 months ago"), Podio-style.
function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const steps: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [span, unit] of steps) {
    if (s >= span) {
      const n = Math.floor(s / span);
      return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

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
      // table_column_id set = the "number field" is a numeric COLUMN inside a
      // table field (e.g. Invoices → Amount): sum every row's cell across all
      // items. Otherwise it's a plain numeric field (value_number).
      let list: number[];
      if (cfg.table_column_id) {
        const { data: tableVals } = await supabase
          .from("item_field_values")
          .select("value")
          .eq("field_id", cfg.number_field_id)
          .limit(2000);
        list = (tableVals ?? []).flatMap((v: any) =>
          (Array.isArray(v.value?.rows) ? v.value.rows : [])
            .map((r: any) => r?.[cfg.table_column_id])
            .filter((n: any) => typeof n === "number" && Number.isFinite(n))
        );
      } else {
        const { data: nums } = await supabase
          .from("item_field_values")
          .select("value_number")
          .eq("field_id", cfg.number_field_id)
          .not("value_number", "is", null)
          .limit(2000);
        list = (nums ?? []).map((n) => Number(n.value_number));
      }
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
      if (cfg.number_field_id && cfg.table_column_id) {
        // Numeric column inside a table field: per item, sum that column's rows.
        const { data: numVals } = await supabase
          .from("item_field_values")
          .select("item_id, value")
          .eq("field_id", cfg.number_field_id)
          .limit(2000);
        numByItem = new Map(
          (numVals ?? []).map((v: any) => [
            v.item_id,
            (Array.isArray(v.value?.rows) ? v.value.rows : []).reduce(
              (a: number, r: any) =>
                a +
                (typeof r?.[cfg.table_column_id] === "number" &&
                Number.isFinite(r[cfg.table_column_id])
                  ? r[cfg.table_column_id]
                  : 0),
              0
            ),
          ])
        );
      } else if (cfg.number_field_id) {
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
    } else if (t.kind === "tasks") {
      // Workspace overview tiles (Podio's "Overviews" picker tab)
      const { data: tRows } = await supabase
        .from("tasks")
        .select("id, title, due_at")
        .eq("workspace_id", ws.id)
        .is("completed_at", null)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(6);
      tiles.push({
        id: t.id, title: t.title, kind: t.kind,
        tasks: (tRows ?? []).map((x) => ({ id: x.id, title: x.title, due_date: x.due_at })),
      });
    } else if (t.kind === "calendar") {
      const { data: cRows } = await supabase
        .from("tasks")
        .select("id, title, due_at")
        .eq("workspace_id", ws.id)
        .not("due_at", "is", null)
        .gte("due_at", new Date().toISOString())
        .order("due_at", { ascending: true })
        .limit(6);
      tiles.push({
        id: t.id, title: t.title, kind: t.kind,
        events: (cRows ?? []).map((x) => ({
          id: x.id, title: x.title, when: x.due_at as string, href: "/tasks",
        })),
      });
    } else if (t.kind === "files") {
      const { data: fRows } = await supabase
        .from("files")
        .select("id, name, storage_path, external_url, created_at")
        .eq("workspace_id", ws.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(6);
      const fPaths = (fRows ?? [])
        .map((f) => f.storage_path)
        .filter(Boolean) as string[];
      const { data: fSigned } = fPaths.length
        ? await supabase.storage.from("podio-files").createSignedUrls(fPaths, 3600)
        : { data: [] as any[] };
      const fSignedBy = new Map(
        (fSigned ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])
      );
      tiles.push({
        id: t.id, title: t.title, kind: t.kind,
        files: (fRows ?? []).map((f) => ({
          id: f.id, name: f.name, created_at: f.created_at,
          href:
            f.external_url ??
            (f.storage_path ? fSignedBy.get(f.storage_path) ?? null : null),
        })),
      });
    } else if (t.kind === "contacts") {
      tiles.push({
        id: t.id, title: t.title, kind: t.kind,
        members: (members ?? []).map((m: any) => ({
          user_id: m.user_id,
          full_name: m.user_profiles?.full_name ?? null,
          avatar_url: m.user_profiles?.avatar_url ?? null,
        })),
      });
    } else if (t.kind === "app") {
      // App content tile (the "Apps" picker tab): the app's newest items
      const tileApp = (apps ?? []).find((a) => a.id === t.app_id);
      const { data: iRows } = await supabase
        .from("items")
        .select("id, title, item_number")
        .eq("app_id", t.app_id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(5);
      tiles.push({
        id: t.id, title: t.title, kind: t.kind,
        items: (iRows ?? []).map((i) => ({
          id: i.id,
          title: i.title ?? `#${i.item_number}`,
          href: tileApp
            ? `/org/${orgSlug}/${wsSlug}/${tileApp.slug}/${i.item_number}`
            : "#",
        })),
      });
    } else {
      // text / iframe / youtube — the config IS the content
      tiles.push({ id: t.id, title: t.title, kind: t.kind, config: cfg });
    }
  }

  const appInfos = (apps ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon ?? null,
    numberFields: [
      ...(wsFields ?? [])
        .filter((f) => f.app_id === a.id && ["number", "money", "progress", "duration"].includes(f.type))
        .map((f) => ({ id: f.id, label: f.label })),
      // Numeric columns inside table fields count too ("Invoices → Amount"):
      // the composite id "fieldId:columnId" is split back apart on save.
      ...(wsFields ?? [])
        .filter((f) => f.app_id === a.id && f.type === "table")
        .flatMap((f) =>
          ((f.config?.columns ?? []) as { id: string; label: string; type: string }[])
            .filter((c) => c.type === "number" || c.type === "money")
            .map((c) => ({ id: `${f.id}:${c.id}`, label: `${f.label} → ${c.label}` }))
        ),
    ],
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
    .select("id, event_type, actor_id, item_id, payload, created_at")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: false })
    .limit(30);

  // ----- Podio-style expanded feed: one entry per item, fully open -----
  // Group events by their item (newest first); each entry shows the item
  // title, creator meta, attachments, sub-activity lines and the inline
  // comment thread with an always-open Add-comment composer.
  const feedItemIds: string[] = [];
  const eventsByItem = new Map<string, any[]>();
  for (const a of activityRows ?? []) {
    if (!a.item_id) continue;
    if (!eventsByItem.has(a.item_id)) {
      eventsByItem.set(a.item_id, []);
      feedItemIds.push(a.item_id);
    }
    eventsByItem.get(a.item_id)!.push(a);
  }
  const shownItemIds = feedItemIds.slice(0, 8);

  const { data: feedItems } = shownItemIds.length
    ? await supabase
        .from("items")
        .select(
          "id, title, item_number, created_at, created_by, apps:app_id(name, slug, item_name)"
        )
        .in("id", shownItemIds)
    : { data: [] as any[] };
  const feedItemById = new Map((feedItems ?? []).map((i: any) => [i.id, i]));

  const { data: feedComments } = shownItemIds.length
    ? await supabase
        .from("comments")
        .select("id, target_id, body, created_by, created_at")
        .eq("target_type", "item")
        .in("target_id", shownItemIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
    : { data: [] as any[] };
  const commentsByItem = new Map<string, any[]>();
  for (const c of feedComments ?? []) {
    if (!commentsByItem.has(c.target_id)) commentsByItem.set(c.target_id, []);
    commentsByItem.get(c.target_id)!.push(c);
  }

  // Files attached to the feed items (chips under the title, like Podio)
  const { data: itemAttachRows } = shownItemIds.length
    ? await supabase
        .from("file_attachments")
        .select("target_id, files:file_id(id, name, storage_path, external_url)")
        .eq("target_type", "item")
        .in("target_id", shownItemIds)
    : { data: [] as any[] };
  const itemAttachPaths = (itemAttachRows ?? [])
    .map((a: any) => a.files?.storage_path)
    .filter(Boolean) as string[];
  const { data: itemSigned } = itemAttachPaths.length
    ? await supabase.storage.from("podio-files").createSignedUrls(itemAttachPaths, 3600)
    : { data: [] as any[] };
  const itemSignedBy = new Map(
    (itemSigned ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])
  );
  const attachmentsByItem = new Map<string, { name: string; url: string | null }[]>();
  for (const a of itemAttachRows ?? []) {
    const list = attachmentsByItem.get((a as any).target_id) ?? [];
    list.push({
      name: (a as any).files?.name ?? "file",
      url:
        (a as any).files?.external_url ??
        ((a as any).files?.storage_path
          ? itemSignedBy.get((a as any).files.storage_path) ?? null
          : null),
    });
    attachmentsByItem.set((a as any).target_id, list);
  }

  // Names + avatars for everyone appearing in the feed: event actors, the
  // workspace creator, status authors, comment authors and item creators.
  const feedActorIds = [
    ...new Set(
      [
        ...(activityRows ?? []).map((a) => a.actor_id),
        ...(statusRows ?? []).map((s) => s.created_by),
        ...(feedComments ?? []).map((c) => c.created_by),
        ...(feedItems ?? []).map((i: any) => i.created_by),
        ws.created_by,
      ].filter(Boolean)
    ),
  ];
  const { data: feedProfiles } = feedActorIds.length
    ? await supabase
        .from("user_profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", feedActorIds)
    : { data: [] as any[] };
  const actorName = new Map(
    (feedProfiles ?? []).map((p) => [p.user_id, p.full_name])
  );
  const actorAvatar = new Map(
    (feedProfiles ?? []).map((p) => [p.user_id, p.avatar_url as string | null])
  );
  const creatorName = ws.created_by
    ? actorName.get(ws.created_by) ?? "Someone"
    : "Someone";

  // Avatar (photo or initials circle) for feed rows.
  function feedAvatar(uid: string | null, cls: string, textCls: string) {
    const avatarUrl = uid ? actorAvatar.get(uid) : null;
    const name = (uid ? actorName.get(uid) : null) ?? "?";
    if (avatarUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className={`${cls} shrink-0 rounded-full object-cover`}
        />
      );
    }
    const initials =
      name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w: string) => w[0])
        .join("")
        .toUpperCase() || "?";
    return (
      <span
        className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-podio-secondary font-semibold text-white ${textCls}`}
      >
        {initials}
      </span>
    );
  }

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
  // Embed tabs above the dashboard (workspace_embeds, migration 78)
  const { data: embedRows } = await supabase
    .from("workspace_embeds")
    .select("id, title, url")
    .eq("workspace_id", ws.id)
    .order("position")
    .order("created_at");

  // Account-synced panel layout (workspace_panel_layouts, migration 75):
  // fetched here so the very first render already uses the saved arrangement.
  let panelLayout: unknown = null;
  if (user) {
    const { data: layoutRow } = await supabase
      .from("workspace_panel_layouts")
      .select("layout")
      .eq("workspace_id", ws.id)
      .eq("user_id", user.id)
      .maybeSingle();
    panelLayout = layoutRow?.layout ?? null;
  }

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
          the tab bar above; the body is a configurable panel grid (drag +
          corner resize) whose layout is synced to the account per workspace
          (workspace_panel_layouts). WorkspaceCanvas adds the embed tab bar
          on top — pick a saved site/Sheet to view it full-width in place. */}
      <WorkspaceCanvas wsId={ws.id} embeds={embedRows ?? []}>
      <PanelBoard
        wsId={ws.id}
        userId={user?.id ?? null}
        initialLayout={panelLayout}
        panels={[
          {
            id: "header",
            title: "Workspace card",
            column: "left",
            node: (
          <WorkspaceHeader
            key="header"
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
          <section key="feed" className="rounded border border-podio-border bg-white p-4 shadow-sm">
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
            <ul className="mt-4 space-y-6 border-t border-podio-border pt-4">
              {shownItemIds.map((itemId) => {
                const it: any = feedItemById.get(itemId);
                if (!it) return null; // deleted or not visible under RLS
                const evs = eventsByItem.get(itemId) ?? [];
                const itemHref = `/org/${orgSlug}/${wsSlug}/${it.apps?.slug}/${it.item_number}`;
                const appHref = `/org/${orgSlug}/${wsSlug}/${it.apps?.slug}`;
                const comments = commentsByItem.get(itemId) ?? [];
                const shownComments = comments.slice(-3);
                const attach = attachmentsByItem.get(itemId) ?? [];
                const subEvents = evs
                  .filter((e: any) => e.event_type !== "item_created")
                  .slice(0, 2);
                const earlier =
                  evs.length -
                  subEvents.length -
                  (evs.some((e: any) => e.event_type === "item_created") ? 1 : 0);
                return (
                  <li key={itemId} className="flex gap-3">
                    {feedAvatar(it.created_by, "h-10 w-10", "text-sm")}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={itemHref}
                        className="text-[17px] font-semibold text-podio-teal hover:underline"
                      >
                        {it.title ?? `#${it.item_number}`}
                      </Link>
                      <p className="mt-0.5 text-sm text-podio-secondary">
                        <PodioIcon
                          icon="task"
                          className="mr-1 inline h-4 w-4 align-text-bottom"
                        />
                        {it.apps?.item_name ?? "Item"} by{" "}
                        <span className="text-podio-ink">
                          {actorName.get(it.created_by) ?? "Someone"}
                        </span>
                        , {timeAgo(it.created_at)} ·{" "}
                        <Link href={appHref} className="text-podio-teal hover:underline">
                          {it.apps?.name}
                        </Link>{" "}
                        ·{" "}
                        <Link href={itemHref} className="text-podio-teal hover:underline">
                          Comment
                        </Link>
                      </p>

                      {attach.length > 0 && (
                        <p className="mt-1.5 flex flex-wrap gap-1.5">
                          {attach.map((f, i) =>
                            f.url ? (
                              <a
                                key={i}
                                href={f.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded border border-podio-border bg-podio-row-alt px-2 py-0.5 text-sm text-podio-teal hover:bg-podio-row-hover"
                              >
                                <PodioIcon
                                  icon="paperclip"
                                  className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-podio-secondary"
                                />
                                {f.name}
                              </a>
                            ) : (
                              <span
                                key={i}
                                className="rounded border border-podio-border bg-podio-row-alt px-2 py-0.5 text-sm text-podio-meta"
                              >
                                {f.name}
                              </span>
                            )
                          )}
                        </p>
                      )}

                      {subEvents.map((e: any) => (
                        <p key={e.id} className="mt-1.5 text-sm text-podio-secondary">
                          <PodioIcon
                            icon="chat"
                            className="mr-1.5 inline h-4 w-4 align-text-bottom"
                          />
                          <span className="font-semibold text-podio-ink">
                            {actorName.get(e.actor_id) ?? "Someone"}
                          </span>{" "}
                          {e.event_type === "comment_added"
                            ? "commented on this"
                            : e.event_type === "item_updated"
                            ? "updated this"
                            : (e.event_type ?? "").replaceAll("_", " ")}{" "}
                          <span className="text-xs text-podio-meta">
                            {timeAgo(e.created_at)}
                          </span>
                        </p>
                      ))}
                      {earlier > 0 && (
                        <p className="mt-1.5 text-sm text-podio-meta">
                          <PodioIcon
                            icon="activity"
                            className="mr-1.5 inline h-4 w-4 align-text-bottom"
                          />
                          {earlier} earlier {earlier === 1 ? "activity" : "activities"}
                        </p>
                      )}

                      {/* Comment thread — always open, Podio-style. */}
                      <div className="mt-3 overflow-hidden rounded border border-podio-border bg-podio-row-alt">
                        {comments.length > shownComments.length && (
                          <Link
                            href={itemHref}
                            className="block border-b border-podio-border px-4 py-2.5 text-sm text-podio-meta hover:text-podio-teal"
                          >
                            <PodioIcon
                              icon="chat"
                              className="mr-1.5 inline h-4 w-4 align-text-bottom"
                            />
                            Show all {comments.length} comments
                          </Link>
                        )}
                        {shownComments.map((c: any) => (
                          <div
                            key={c.id}
                            className="flex gap-2.5 border-b border-podio-border px-4 py-3 last:border-b-0"
                          >
                            {feedAvatar(c.created_by, "h-7 w-7", "text-[10px]")}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm">
                                <span className="font-semibold text-podio-ink">
                                  {actorName.get(c.created_by) ?? "Someone"}
                                </span>{" "}
                                <span className="text-xs text-podio-meta">
                                  {timeAgo(c.created_at)}
                                </span>
                              </p>
                              <p className="whitespace-pre-wrap break-words text-[15px] text-podio-ink">
                                {c.body}
                              </p>
                            </div>
                          </div>
                        ))}
                        <FeedComment itemId={itemId} />
                      </div>
                    </div>
                  </li>
                );
              })}
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
          <section key="tasks" className="rounded border border-podio-border bg-white shadow-sm">
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
          <section key="calendar" className="rounded border border-podio-border bg-white p-4 shadow-sm">
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
            key="dashboard"
            id="dashboard"
            className="rounded border border-podio-border bg-white p-4 shadow-sm"
          >
            <h2 className="font-semibold text-podio-teal">Dashboard</h2>
            <div className="mt-3">
              <DashboardTiles wsId={ws.id} wsName={ws.name} apps={appInfos} tiles={tiles} />
            </div>
          </section>
            ),
          },
          {
            id: "tools",
            title: "Workspace tools",
            column: "right",
            node: (
          <section key="tools" className="rounded border border-podio-border bg-white p-4 shadow-sm">
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
          <section key="members" className="rounded border border-podio-border bg-white p-4 shadow-sm">
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
            key="add-tile"
            href="#dashboard"
            className="flex h-28 w-full items-center justify-center rounded border-2 border-dashed border-podio-border text-sm font-semibold uppercase tracking-wide text-podio-meta hover:border-podio-meta hover:text-podio-secondary"
          >
            + Add tile
          </a>
        }
      />
      </WorkspaceCanvas>
    </main>
  );
}
