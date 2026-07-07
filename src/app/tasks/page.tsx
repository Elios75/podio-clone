import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlobalBar } from "@/components/global-bar";
import {
  OrgPickerDrawer,
  type PickerOrg,
} from "@/components/org-picker-drawer";
import { TaskComposer } from "./task-composer";
import { TaskRow, type TaskRowData } from "./task-row";
import { LabelsRail } from "./task-labels";

// Standalone My Tasks page, Podio-style (design skill layouts.md §14).
// The global bar NEVER disappears: it renders here via the shared GlobalBar
// with a ☰ "Choose a workspace or app" left slot and the tasks tool active.

const TABS = [
  { key: "mine", label: "My tasks" },
  { key: "delegated", label: "My delegated tasks" },
  { key: "completed", label: "My completed tasks" },
  { key: "all-completed", label: "All completed" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmtDate(d: Date) {
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}
function fmtTime(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ label?: string; tab?: string }>;
}) {
  const { label: activeLabel, tab: rawTab } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : "mine";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Plain const so the null-narrowing survives into hoisted functions below
  // (TS doesn't carry `user`'s narrowing into `function` declarations).
  const userId = user.id;

  // Everything I can see: assigned to me or created by me (RLS also allows
  // workspace tasks, but "my" views only need these two).
  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      "id, title, status, due_at, all_day, completed_at, assignee_id, created_by, target_type, target_id, organization_id"
    )
    .or(`assignee_id.eq.${user.id},created_by.eq.${user.id}`)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(300);

  // Deep links for item-linked tasks
  const itemIds = [
    ...new Set(
      (tasks ?? [])
        .filter((t) => t.target_type === "item" && t.target_id)
        .map((t) => t.target_id)
    ),
  ];
  const { data: linkedItems } = itemIds.length
    ? await supabase
        .from("items")
        .select(
          "id, item_number, title, apps:app_id(slug, workspaces:workspace_id(slug, organizations:organization_id(slug)))"
        )
        .in("id", itemIds)
    : { data: [] as any[] };
  const hrefByItem = new Map(
    (linkedItems ?? []).map((it: any) => [
      it.id,
      {
        href: `/org/${it.apps?.workspaces?.organizations?.slug}/${it.apps?.workspaces?.slug}/${it.apps?.slug}/${it.item_number}`,
        title: it.title ?? `#${it.item_number}`,
      },
    ])
  );

  // Personal labels + assignments
  const { data: labels } = await supabase
    .from("task_labels")
    .select("id, name, color")
    .order("name");
  const allTaskIds = (tasks ?? []).map((t) => t.id);
  const { data: links } = allTaskIds.length
    ? await supabase
        .from("task_label_links")
        .select("task_id, label_id")
        .in("task_id", allTaskIds)
    : { data: [] as any[] };
  const labelsByTask = new Map<string, string[]>();
  for (const l of links ?? []) {
    (labelsByTask.get(l.task_id) ??
      labelsByTask.set(l.task_id, []).get(l.task_id)!).push(l.label_id);
  }

  // Composer context: org for create_task + assignable org members.
  // The same membership rows (now with org name/slug) also feed the ☰
  // org/workspace picker drawer in the global bar.
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organization_id, organizations(id, name, slug)")
    .eq("user_id", user.id);
  const defaultOrg = memberships?.[0]?.organization_id ?? null;

  const orgIds = (memberships ?? []).map((m: any) => m.organization_id);
  const { data: orgWorkspaces } = orgIds.length
    ? await supabase
        .from("workspaces")
        .select("id, name, slug, organization_id, is_archived")
        .in("organization_id", orgIds)
        .eq("is_archived", false)
        .order("name")
    : { data: [] as any[] };
  const pickerOrgs: PickerOrg[] = (memberships ?? [])
    .filter((m: any) => m.organizations)
    .map((m: any) => ({
      id: m.organizations.id as string,
      name: m.organizations.name as string,
      slug: m.organizations.slug as string,
      role: m.role as string,
      workspaces: (orgWorkspaces ?? [])
        .filter((ws: any) => ws.organization_id === m.organizations.id)
        .map((ws: any) => ({
          id: ws.id as string,
          name: ws.name as string,
          slug: ws.slug as string,
        })),
    }));
  const { data: orgMembers } = defaultOrg
    ? await supabase
        .from("organization_members")
        .select("user_id, user_profiles:user_id(full_name)")
        .eq("organization_id", defaultOrg)
    : { data: [] as any[] };
  const members = (orgMembers ?? [])
    .filter((m: any) => m.user_id !== user.id)
    .map((m: any) => ({
      user_id: m.user_id as string,
      full_name: (m.user_profiles?.full_name ?? null) as string | null,
    }));

  // Names for assignee chips (delegated / all-completed views)
  const assigneeIds = [
    ...new Set(
      (tasks ?? [])
        .filter((t) => t.assignee_id && t.assignee_id !== user.id)
        .map((t) => t.assignee_id as string)
    ),
  ];
  const { data: profiles } = assigneeIds.length
    ? await supabase
        .from("user_profiles")
        .select("user_id, full_name")
        .in("user_id", assigneeIds)
    : { data: [] as any[] };
  const nameById = new Map(
    (profiles ?? []).map((p: any) => [p.user_id, p.full_name as string | null])
  );

  // Tab filters (delegated = created by me & assigned to someone else)
  const all = tasks ?? [];
  const byTab: Record<TabKey, any[]> = {
    mine: all.filter(
      (t) =>
        t.status === "open" &&
        (t.assignee_id === user.id || (!t.assignee_id && t.created_by === user.id))
    ),
    delegated: all.filter(
      (t) =>
        t.status === "open" &&
        t.created_by === user.id &&
        t.assignee_id &&
        t.assignee_id !== user.id
    ),
    completed: all.filter(
      (t) =>
        t.status === "completed" &&
        (t.assignee_id === user.id ||
          (!t.assignee_id && t.created_by === user.id))
    ),
    "all-completed": all.filter((t) => t.status === "completed"),
  };
  let visible = byTab[tab];
  if (activeLabel) {
    visible = visible.filter((t) =>
      (labelsByTask.get(t.id) ?? []).includes(activeLabel)
    );
  }

  // Date grouping happens server-side so rows render deterministic strings.
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTomorrow = new Date(startToday);
  startTomorrow.setDate(startTomorrow.getDate() + 1);

  function toRow(t: any): TaskRowData {
    const due = t.due_at ? new Date(t.due_at) : null;
    const isCompleted = t.status === "completed";
    const completedAt = t.completed_at ? new Date(t.completed_at) : null;
    const stamp = isCompleted ? completedAt : due;
    const link = t.target_type === "item" ? hrefByItem.get(t.target_id) : null;
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      dateText: stamp ? fmtDate(stamp) : "",
      timeText: isCompleted
        ? completedAt
          ? fmtTime(completedAt)
          : ""
        : due
          ? t.all_day
            ? "--:--"
            : fmtTime(due)
          : "",
      overdue: !isCompleted && !!due && due < startToday,
      dueValue: due ? dateInputValue(due) : "",
      assigneeName:
        t.assignee_id && t.assignee_id !== userId
          ? nameById.get(t.assignee_id) ?? t.assignee_id.slice(0, 8)
          : null,
      canDelete: t.created_by === userId,
      linkHref: link?.href ?? null,
      linkTitle: link?.title ?? null,
      labelIds: labelsByTask.get(t.id) ?? [],
    };
  }

  const isCompletedTab = tab === "completed" || tab === "all-completed";
  const sections: { title: string; rows: TaskRowData[] }[] = isCompletedTab
    ? [
        {
          title: "Completed",
          rows: [...visible]
            .sort((a, b) =>
              (b.completed_at ?? "").localeCompare(a.completed_at ?? "")
            )
            .map(toRow),
        },
      ]
    : [
        {
          title: "Overdue",
          rows: visible
            .filter((t) => t.due_at && new Date(t.due_at) < startToday)
            .map(toRow),
        },
        {
          title: "Today",
          rows: visible
            .filter((t) => {
              if (!t.due_at) return false;
              const d = new Date(t.due_at);
              return d >= startToday && d < startTomorrow;
            })
            .map(toRow),
        },
        {
          title: "Upcoming",
          rows: visible
            .filter((t) => t.due_at && new Date(t.due_at) >= startTomorrow)
            .map(toRow),
        },
        {
          title: "No due date",
          rows: visible.filter((t) => !t.due_at).map(toRow),
        },
      ];
  const visibleSections = sections.filter((s) => s.rows.length > 0);

  // Left slot for the global bar: no org context here, so the hamburger
  // opens the cross-org workspace picker drawer (a slide-over, no navigation).
  const chooser = <OrgPickerDrawer orgs={pickerOrgs} />;

  // Global-bar right cluster: profile (avatar) + unread notification count
  const { data: myProfile } = await supabase
    .from("user_profiles")
    .select("full_name, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return (
    <div className="flex min-h-screen flex-col">
      <GlobalBar
        left={chooser}
        activeTool="tasks"
        user={{
          id: user.id,
          name: myProfile?.full_name ?? user.email ?? null,
          avatarUrl: myProfile?.avatar_url ?? null,
        }}
        initialUnread={unread ?? 0}
      />

      <main className="flex-1 px-4 py-4 md:px-6 md:py-5">
        <div className="mx-auto flex max-w-6xl flex-col rounded border border-podio-border bg-white shadow-sm md:flex-row">
          {/* Main column (~3/4) */}
          <section className="min-w-0 flex-1 p-4 md:p-6">
            {/* Underline tab row */}
            <div className="flex flex-wrap gap-x-6 border-b border-podio-border text-[15px]">
              {TABS.map((t) => {
                const active = t.key === tab;
                const qs = new URLSearchParams();
                if (t.key !== "mine") qs.set("tab", t.key);
                if (activeLabel) qs.set("label", activeLabel);
                const q = qs.toString();
                return (
                  <Link
                    key={t.key}
                    href={q ? `/tasks?${q}` : "/tasks"}
                    className={
                      active
                        ? "-mb-px border-b-2 border-podio-ink pb-2 font-semibold text-podio-ink"
                        : "pb-2 text-podio-secondary hover:text-podio-ink"
                    }
                  >
                    {t.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-4">
              <TaskComposer
                orgId={defaultOrg}
                members={members}
                labels={labels ?? []}
              />
            </div>

            <div className="mt-5">
              {visibleSections.map((s) => (
                <section key={s.title} className="mt-4 first:mt-0">
                  <h2 className="mb-1 text-sm font-semibold text-podio-ink">
                    {s.title}
                  </h2>
                  <ul className="border-t border-podio-border">
                    {s.rows.map((r) => (
                      <TaskRow key={r.id} task={r} allLabels={labels ?? []} />
                    ))}
                  </ul>
                </section>
              ))}
              {visibleSections.length === 0 && (
                <p className="py-10 text-center text-sm text-podio-meta">
                  No tasks to show
                </p>
              )}
            </div>
          </section>

          {/* Right rail (~1/4): Labels */}
          <aside className="shrink-0 border-t border-podio-border p-4 md:w-64 md:border-l md:border-t-0 md:p-5">
            <LabelsRail
              labels={labels ?? []}
              activeLabel={activeLabel ?? null}
              tab={tab === "mine" ? null : tab}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}
