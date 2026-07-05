import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PodioIcon } from "@/components/podio-icon";
import { ItemForm } from "../item-form";
import { CommentsSection } from "./comments-section";
import { TasksSection } from "./tasks-section";
import { AttachLink } from "./attach-link";
import { FilePickers } from "./file-pickers";
import { ShareSection } from "./share-section";
import { SendEmail } from "./send-email";
import { RecordRail } from "./record-rail";
import { FollowToggleHeader } from "./follow-toggle-header";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: org } = await supabase
    .from("organizations").select("id, slug").eq("slug", orgSlug).single();
  if (!org) notFound();
  const { data: ws } = await supabase
    .from("workspaces").select("id, name, slug")
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

  const { data: allFields } = await supabase
    .from("app_fields")
    .select("id, label, type, is_required, is_hidden, help_text, config")
    .eq("app_id", app.id).eq("status", "active")
    .order("position");
  const fields = (allFields ?? []).filter((f) => !f.is_hidden);

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

  // ----- Collaboration data -----
  const { data: commentRows } = await supabase
    .from("comments")
    .select("id, body, created_by, created_at, is_edited")
    .eq("target_type", "item")
    .eq("target_id", item.id)
    .is("deleted_at", null)
    .order("created_at");

  const { data: activityRows } = await supabase
    .from("activity_events")
    .select("id, event_type, actor_id, created_at, payload")
    .eq("item_id", item.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const actorIds = [
    ...new Set([
      ...(commentRows ?? []).map((c) => c.created_by),
      ...(activityRows ?? []).map((a) => a.actor_id).filter(Boolean),
    ]),
  ];
  const { data: actorProfiles } = actorIds.length
    ? await supabase.from("user_profiles").select("user_id, full_name").in("user_id", actorIds)
    : { data: [] as any[] };
  const actorName = new Map((actorProfiles ?? []).map((p) => [p.user_id, p.full_name]));

  const { data: followRow } = await supabase
    .from("item_followers")
    .select("id")
    .eq("item_id", item.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { count: followerCount } = await supabase
    .from("item_followers")
    .select("*", { count: "exact", head: true })
    .eq("item_id", item.id);

  // Attachments on comments
  const commentIds = (commentRows ?? []).map((c) => c.id);
  const { data: attachRows } = commentIds.length
    ? await supabase
        .from("file_attachments")
        .select("id, target_id, files:file_id(id, name, storage_path)")
        .eq("target_type", "comment")
        .in("target_id", commentIds)
    : { data: [] as any[] };
  // Signed URLs (private bucket): field values + comment attachments in one batch
  const allPaths = [
    ...new Set(
      [
        ...Object.values(initialValues)
          .map((v: any) => v?.path)
          .filter(Boolean),
        ...(attachRows ?? []).map((a: any) => a.files?.storage_path).filter(Boolean),
      ] as string[]
    ),
  ];
  const { data: signedArr } = allPaths.length
    ? await supabase.storage.from("podio-files").createSignedUrls(allPaths, 3600)
    : { data: [] as any[] };
  const signedUrls: Record<string, string> = {};
  for (const s of signedArr ?? []) {
    if (s.signedUrl) signedUrls[s.path] = s.signedUrl;
  }

  const attachmentsByComment: Record<string, any[]> = {};
  for (const a of attachRows ?? []) {
    (attachmentsByComment[a.target_id] ??= []).push({
      id: a.id,
      name: (a as any).files?.name,
      url: signedUrls[(a as any).files?.storage_path] ?? null,
    });
  }

  // Reactions
  const { data: reactionRows } = commentIds.length
    ? await supabase
        .from("comment_reactions")
        .select("comment_id, user_id, emoji")
        .in("comment_id", commentIds)
    : { data: [] as any[] };
  const reactionsByComment: Record<string, { emoji: string; count: number; mine: boolean }[]> = {};
  for (const cid of commentIds) {
    const rows = (reactionRows ?? []).filter((r) => r.comment_id === cid);
    const emojis = [...new Set(rows.map((r) => r.emoji))];
    reactionsByComment[cid] = emojis.map((emoji) => ({
      emoji,
      count: rows.filter((r) => r.emoji === emoji).length,
      mine: rows.some((r) => r.emoji === emoji && r.user_id === user.id),
    }));
  }

  // Related items: outgoing (this item references) + incoming (items referencing this)
  const relSelect =
    "id, title, item_number, apps:app_id(name, icon, slug, workspaces:workspace_id(slug, organizations:organization_id(slug)))";
  const { data: outgoingRels } = await supabase
    .from("item_relationships")
    .select(`id, fields:field_id(label), target:to_item_id(${relSelect})`)
    .eq("from_item_id", item.id);
  const { data: incomingRels } = await supabase
    .from("item_relationships")
    .select(`id, fields:field_id(label), source:from_item_id(${relSelect})`)
    .eq("to_item_id", item.id);

  const relHref = (it: any) =>
    `/org/${it.apps?.workspaces?.organizations?.slug}/${it.apps?.workspaces?.slug}/${it.apps?.slug}/${it.item_number}`;

  // Email composer: default recipient from the item's first email-field value,
  // templates from the org
  const emailField = (allFields ?? []).find((f) => f.type === "email");
  const defaultTo = emailField
    ? ((initialValues[emailField.id] as string) ?? null)
    : null;
  const { data: emailTemplates } = await supabase
    .from("email_templates")
    .select("id, name, subject, body_text")
    .eq("organization_id", org.id)
    .order("name");

  // Shares on this item
  const { data: shareRows } = await supabase
    .from("item_shares")
    .select("id, email, access, revoked_at, created_at")
    .eq("item_id", item.id)
    .order("created_at", { ascending: false });

  // Tasks on this item
  const { data: taskRows } = await supabase
    .from("tasks")
    .select("id, title, status, due_at, assignee_id")
    .eq("target_type", "item")
    .eq("target_id", item.id)
    .order("created_at");
  const taskAssignees = [...new Set((taskRows ?? []).map((t) => t.assignee_id).filter(Boolean))];
  const { data: assigneeProfiles } = taskAssignees.length
    ? await supabase.from("user_profiles").select("user_id, full_name").in("user_id", taskAssignees)
    : { data: [] as any[] };
  const assigneeName = new Map((assigneeProfiles ?? []).map((p) => [p.user_id, p.full_name]));

  const base = `/org/${orgSlug}/${wsSlug}`;
  const itemTitle = item.title ?? `${app.item_name} #${item.item_number}`;

  return (
    <main className="min-h-full bg-podio-page">
      {/* Record header bar (same grammar as the New-Item creation bar) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-podio-border bg-white px-4 pt-2">
        {/* Left cluster: quick-create chip + template/actions buttons */}
        <Link
          href={`${backHref}/new`}
          className="self-end rounded-t bg-podio-teal px-4 py-2.5 text-sm font-semibold text-white hover:brightness-105"
        >
          New {app.item_name}
        </Link>
        <Link
          href={`${backHref}/edit`}
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
            href={backHref}
            className="flex items-center gap-1.5 text-podio-teal hover:underline"
          >
            <PodioIcon icon={app.icon} name={app.name} className="h-5 w-5" />
            {app.name}
          </Link>
          <span className="text-podio-meta">›</span>
          <span className="max-w-56 truncate text-podio-ink">{itemTitle}</span>
        </nav>

        {/* Right cluster: follow toggle + share anchor */}
        <div className="mb-2 flex items-center gap-3">
          <FollowToggleHeader
            itemId={item.id}
            currentUserId={user.id}
            isFollowing={!!followRow}
            followerCount={followerCount ?? 0}
          />
          <a
            href="#share"
            className="flex items-center gap-1.5 px-1 py-1.5 text-sm text-podio-secondary hover:text-podio-ink"
          >
            <PodioIcon icon="share-out" className="h-5 w-5" />
            Share
          </a>
        </div>
      </div>

      {/* Two-column body: record panels + Activity/Comments rail */}
      <div className="flex flex-col items-stretch gap-6 p-4 lg:flex-row lg:items-start lg:p-6">
        <div className="min-w-0 flex-1 space-y-6">
          <section className="rounded border border-podio-border bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-podio-ink">{itemTitle}</h1>
            <p className="mt-1 text-xs text-podio-meta">
              #{item.item_number} · Created {new Date(item.created_at).toLocaleString()} · Updated{" "}
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
                signedUrls={signedUrls}
                backHref={backHref}
                itemName={app.item_name}
              />
            </div>
          </section>

          <section className="rounded border border-podio-border bg-white p-4 shadow-sm">
            <TasksSection
              itemId={item.id}
              orgId={org.id}
              wsId={ws.id}
              members={members}
              tasks={(taskRows ?? []).map((t) => ({
                id: t.id,
                title: t.title,
                status: t.status,
                due_at: t.due_at,
                assignee_name: t.assignee_id ? assigneeName.get(t.assignee_id) ?? null : null,
              }))}
            />
          </section>

          <section className="rounded border border-podio-border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <AttachLink orgId={org.id} wsId={ws.id} itemId={item.id} currentUserId={user.id} />
              <FilePickers orgId={org.id} wsId={ws.id} itemId={item.id} currentUserId={user.id} />
            </div>
          </section>

          <section className="rounded border border-podio-border bg-white p-4 shadow-sm">
            <SendEmail
              itemId={item.id}
              itemTitle={itemTitle}
              defaultTo={defaultTo}
              templates={(emailTemplates ?? []) as any}
            />
          </section>

          {((outgoingRels ?? []).length > 0 || (incomingRels ?? []).length > 0) && (
            <section className="rounded border border-podio-border bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-podio-ink">Related items</h2>
              <ul className="mt-3 space-y-2">
                {(outgoingRels ?? []).map((r: any) =>
                  r.target ? (
                    <li key={r.id}
                      className="flex items-center gap-2 rounded border border-podio-border bg-podio-row-alt px-3 py-2 text-sm">
                      <span className="text-xs text-podio-meta">{r.fields?.label} →</span>
                      <a href={relHref(r.target)} className="font-medium text-podio-teal hover:underline">
                        {r.target.apps?.icon} {r.target.title ?? `#${r.target.item_number}`}
                      </a>
                      <span className="ml-auto text-xs text-podio-meta">{r.target.apps?.name}</span>
                    </li>
                  ) : null
                )}
                {(incomingRels ?? []).map((r: any) =>
                  r.source ? (
                    <li key={r.id}
                      className="flex items-center gap-2 rounded border border-podio-border bg-podio-row-alt px-3 py-2 text-sm">
                      <span className="text-xs text-podio-meta">← via {r.fields?.label}</span>
                      <a href={relHref(r.source)} className="font-medium text-podio-teal hover:underline">
                        {r.source.apps?.icon} {r.source.title ?? `#${r.source.item_number}`}
                      </a>
                      <span className="ml-auto text-xs text-podio-meta">{r.source.apps?.name}</span>
                    </li>
                  ) : null
                )}
              </ul>
            </section>
          )}

          <section id="share" className="scroll-mt-4 rounded border border-podio-border bg-white p-4 shadow-sm">
            <ShareSection itemId={item.id} shares={(shareRows ?? []) as any} />
          </section>
        </div>

        {/* Right rail: Activity | Comments tabs */}
        <aside className="w-full shrink-0 lg:w-[34%] lg:max-w-md">
          <div className="rounded border border-podio-border bg-white p-4 shadow-sm">
            <RecordRail
              defaultTab={(commentRows ?? []).length > 0 ? "comments" : "activity"}
              activitySlot={
                <ul className="mt-3 space-y-1.5">
                  {(activityRows ?? []).map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm text-slate-500">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                      <span className="font-medium text-slate-700">
                        {(a.actor_id ? actorName.get(a.actor_id) : null) ?? "Someone"}
                      </span>
                      <span>
                        {a.event_type === "item_created" && "created this item"}
                        {a.event_type === "item_updated" && "updated this item"}
                        {a.event_type === "comment_added" && "commented"}
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
              }
              commentsSlot={
                <CommentsSection
                  itemId={item.id}
                  orgId={org.id}
                  wsId={ws.id}
                  currentUserId={user.id}
                  comments={(commentRows ?? []).map((c) => ({
                    ...c,
                    author_name: actorName.get(c.created_by) ?? null,
                  }))}
                  members={members}
                  attachmentsByComment={attachmentsByComment}
                  reactionsByComment={reactionsByComment}
                />
              }
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
