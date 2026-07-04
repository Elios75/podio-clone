import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TaskToggle } from "./task-toggle";

export default async function MyTasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, due_at, target_type, target_id, created_by, organization_id")
    .or(`assignee_id.eq.${user.id},created_by.eq.${user.id}`)
    .order("status")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(100);

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

  const open = (tasks ?? []).filter((t) => t.status === "open");
  const done = (tasks ?? []).filter((t) => t.status === "completed").slice(0, 20);

  function TaskRow({ t }: { t: any }) {
    const link = t.target_type === "item" ? hrefByItem.get(t.target_id) : null;
    const overdue = t.due_at && new Date(t.due_at) < new Date() && t.status === "open";
    return (
      <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <TaskToggle taskId={t.id} status={t.status} />
        <div className="min-w-0">
          <p className={`truncate text-sm ${t.status === "completed" ? "text-slate-400 line-through" : ""}`}>
            {t.title}
          </p>
          {link && (
            <Link href={link.href} className="text-xs text-blue-600 hover:underline">
              {link.title}
            </Link>
          )}
        </div>
        {t.due_at && (
          <span className={`ml-auto shrink-0 text-xs ${overdue ? "font-medium text-red-500" : "text-slate-400"}`}>
            {new Date(t.due_at).toLocaleDateString()}
          </span>
        )}
      </li>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My tasks</h1>
        <Link href="/home" className="text-sm text-slate-500 hover:underline">← Home</Link>
      </div>

      <h2 className="mt-6 text-sm font-medium uppercase tracking-wide text-slate-400">
        Open ({open.length})
      </h2>
      <ul className="mt-2 space-y-2">
        {open.map((t) => <TaskRow key={t.id} t={t} />)}
        {open.length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            All clear 🎉
          </li>
        )}
      </ul>

      {done.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-slate-400">
            Recently completed
          </h2>
          <ul className="mt-2 space-y-2">
            {done.map((t) => <TaskRow key={t.id} t={t} />)}
          </ul>
        </>
      )}
    </main>
  );
}
