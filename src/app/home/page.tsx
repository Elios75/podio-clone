import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateOrgForm } from "./create-org-form";
import { SignOutButton } from "./sign-out-button";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ensure a profile row exists (idempotent).
  await supabase
    .from("user_profiles")
    .upsert({ user_id: user.id }, { onConflict: "user_id" });

  // SSO auto-provisioning + pending guest-share claims (idempotent, cheap)
  await supabase.rpc("claim_sso_membership");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug)")
    .eq("user_id", user.id);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-podio-ink">Your organizations</h1>
        <div className="flex items-center gap-3">
          <Link href="/calendar" className="text-sm text-podio-teal hover:underline">📅</Link>
          <Link href="/messages" className="text-sm text-podio-teal hover:underline">💬</Link>
          <Link href="/tasks" className="text-sm text-podio-teal hover:underline">✓ Tasks</Link>
          <Link href="/notifications" className="text-sm text-podio-teal hover:underline">🔔</Link>
          <SignOutButton />
        </div>
      </div>
      <p className="mt-1 text-sm text-podio-secondary">{user.email}</p>

      <ul className="mt-6 space-y-2">
        {(memberships ?? []).map((m: any) => (
          <li key={m.organizations.id}>
            <Link
              href={`/org/${m.organizations.slug}`}
              className="block rounded border border-podio-border bg-white p-4 hover:border-podio-teal"
            >
              <span className="font-semibold text-podio-ink">{m.organizations.name}</span>
              <span className="ml-2 rounded bg-podio-row-alt px-2 py-0.5 text-xs text-podio-secondary">
                {m.role}
              </span>
            </Link>
          </li>
        ))}
        {(memberships ?? []).length === 0 && (
          <li className="rounded border border-dashed border-podio-border bg-white p-6 text-center text-sm text-podio-secondary">
            No organizations yet — create your first one below.
          </li>
        )}
      </ul>

      <div className="mt-8">
        <CreateOrgForm />
      </div>

      <HomeFeed />
    </main>
  );
}

async function HomeFeed() {
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("activity_events")
    .select("id, event_type, actor_id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id).filter(Boolean))];
  const { data: profiles } = actorIds.length
    ? await supabase.from("user_profiles").select("user_id, full_name").in("user_id", actorIds)
    : { data: [] as any[] };
  const nameByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));

  if ((events ?? []).length === 0) return null;

  const verb = (t: string) =>
    t === "item_created" ? "created" :
    t === "item_updated" ? "updated" :
    t === "comment_added" ? "commented on" :
    t === "task_created" ? "added a task on" :
    t === "task_completed" ? "completed a task:" : t;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-podio-ink">Recent activity</h2>
      <ul className="mt-3 space-y-1.5">
        {(events ?? []).map((e: any) => (
          <li key={e.id}
            className="flex items-center gap-2 rounded border border-podio-border bg-white px-3 py-2 text-sm text-podio-secondary">
            <span className="font-semibold text-podio-ink">
              {e.actor_id ? nameByUser.get(e.actor_id) ?? "Someone" : "Someone"}
            </span>
            <span>{verb(e.event_type)}</span>
            <span className="truncate font-semibold text-podio-ink">
              {e.payload?.item_title ?? e.payload?.task_title ?? "an item"}
            </span>
            <span className="ml-auto shrink-0 text-xs text-podio-meta">
              {new Date(e.created_at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
