import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TaskToggle } from "@/app/tasks/task-toggle";
import { AppTabBar } from "../app-tab-bar";

export default async function WorkspaceTasksPage({
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
    .select("id, name, slug")
    .eq("organization_id", org.id)
    .eq("slug", wsSlug)
    .single();
  if (!ws) notFound();

  // Workspace chrome: the app tab bar must NEVER disappear on workspace pages.
  const { data: siblingApps } = await supabase
    .from("apps")
    .select("id, name, slug, icon")
    .eq("workspace_id", ws.id)
    .eq("is_archived", false)
    .order("name");

  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      "id, title, status, due_at, completed_at, assignee_id, user_profiles:assignee_id(full_name)"
    )
    .eq("workspace_id", ws.id)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(300);

  const open = (tasks ?? []).filter((t: any) => !t.completed_at);
  const completed = (tasks ?? [])
    .filter((t: any) => t.completed_at)
    .sort(
      (a: any, b: any) =>
        new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    )
    .slice(0, 25);

  function TaskRow({ t }: { t: any }) {
    const isDone = !!t.completed_at;
    const overdue = !isDone && t.due_at && new Date(t.due_at) < new Date();
    return (
      <li className="flex items-center gap-3 px-3 py-2 hover:bg-podio-row-hover">
        <TaskToggle taskId={t.id} status={t.status} />
        <div className="min-w-0">
          <p
            className={`truncate text-sm ${
              isDone
                ? "text-podio-disabled line-through"
                : "text-podio-ink"
            }`}
          >
            {t.title}
          </p>
          {t.user_profiles?.full_name && (
            <p className="truncate text-xs text-podio-secondary">
              {t.user_profiles.full_name}
            </p>
          )}
        </div>
        {t.due_at && (
          <span
            className={`ml-auto shrink-0 text-xs ${
              overdue ? "font-semibold text-red-500" : "text-podio-meta"
            }`}
          >
            {new Date(t.due_at).toLocaleDateString()}
          </span>
        )}
      </li>
    );
  }

  return (
    <main className="min-h-screen bg-podio-page pb-10">
      <AppTabBar orgSlug={orgSlug} wsSlug={wsSlug} apps={siblingApps ?? []} />
      <div className="mx-auto max-w-3xl px-4 pt-6 md:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-podio-ink">
            Workspace tasks
          </h1>
          <Link
            href={`/org/${orgSlug}/${ws.slug}`}
            className="text-sm text-podio-teal hover:underline"
          >
            ← {ws.name}
          </Link>
        </div>

        <section className="mt-4 rounded border border-podio-border bg-white shadow-sm">
          <h2 className="border-b border-podio-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-podio-meta">
            Open ({open.length})
          </h2>
          <ul className="divide-y divide-podio-border">
            {open.map((t: any) => (
              <TaskRow key={t.id} t={t} />
            ))}
            {open.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-podio-meta">
                No open tasks in this workspace.
              </li>
            )}
          </ul>
        </section>

        {completed.length > 0 && (
          <section className="mt-4 rounded border border-podio-border bg-white shadow-sm">
            <h2 className="border-b border-podio-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-podio-meta">
              Completed
            </h2>
            <ul className="divide-y divide-podio-border">
              {completed.map((t: any) => (
                <TaskRow key={t.id} t={t} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
