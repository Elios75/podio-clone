import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CalendarView } from "../org/[orgSlug]/[wsSlug]/[appSlug]/calendar-view";
import { IcsLink } from "./ics-link";

export default async function PersonalCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const monthStr =
    sp.month && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : new Date().toISOString().slice(0, 7);
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();

  const cardsByDay: Record<string, { href: string; title: string }[]> = {};
  const push = (dateIso: string, card: { href: string; title: string }) => {
    (cardsByDay[dateIso.slice(0, 10)] ??= []).push(card);
  };

  // My tasks due this month
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, due_at, status")
    .eq("assignee_id", user.id)
    .gte("due_at", start)
    .lt("due_at", end)
    .limit(200);
  for (const t of tasks ?? []) {
    if (t.due_at)
      push(t.due_at, {
        href: "/tasks",
        title: `✓ ${t.title}${t.status === "completed" ? " (done)" : ""}`,
      });
  }

  // Items with date values this month, across every workspace I can see (RLS filters)
  const { data: dateValues } = await supabase
    .from("item_field_values")
    .select(
      "value_date, items:item_id!inner(id, title, item_number, is_deleted, apps:app_id!inner(name, icon, slug, workspaces:workspace_id!inner(slug, organizations:organization_id(slug))))"
    )
    .gte("value_date", start)
    .lt("value_date", end)
    .limit(500);
  for (const v of (dateValues ?? []) as any[]) {
    const it = v.items;
    if (!it || it.is_deleted) continue;
    push(v.value_date, {
      href: `/org/${it.apps?.workspaces?.organizations?.slug}/${it.apps?.workspaces?.slug}/${it.apps?.slug}/${it.item_number}`,
      title: `${it.apps?.icon ?? ""} ${it.title ?? `#${it.item_number}`}`,
    });
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-podio-ink">My calendar</h1>
        <div className="flex items-center gap-3">
          <IcsLink />
          <Link href="/home" className="text-sm text-podio-teal hover:underline">← Home</Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-podio-secondary">
        Your tasks plus every dated item across your workspaces.
      </p>
      <div className="mt-6 rounded border border-podio-border bg-white p-4 shadow-sm">
        <CalendarView
          monthStr={monthStr}
          cardsByDay={cardsByDay}
          baseHref="/calendar"
          viewQuery="v=personal"
        />
      </div>
    </main>
  );
}
