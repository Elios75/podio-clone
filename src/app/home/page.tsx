import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlobalBar } from "@/components/global-bar";
import {
  OrgPickerDrawer,
  type PickerOrg,
} from "@/components/org-picker-drawer";
import { PodioIcon } from "@/components/podio-icon";
import { CreateOrgForm } from "./create-org-form";
import { SignOutButton } from "./sign-out-button";

// "Your organizations" — the cross-org landing page. The global chrome NEVER
// disappears: the same GlobalBar renders here with the ☰ org/workspace
// picker drawer in its left slot (design skill layouts.md §1).
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

  // Workspaces per org for the ☰ picker drawer (same query pattern as the
  // org layout: non-archived workspaces, ordered by name).
  const orgIds = (memberships ?? [])
    .map((m: any) => m.organizations?.id)
    .filter(Boolean);
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
    <div className="flex min-h-screen flex-col bg-podio-page">
      <GlobalBar
        left={<OrgPickerDrawer orgs={pickerOrgs} />}
        user={{
          id: user.id,
          name: myProfile?.full_name ?? user.email ?? null,
          avatarUrl: myProfile?.avatar_url ?? null,
        }}
        initialUnread={unread ?? 0}
      />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-podio-ink">
            Your organizations
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href="/calendar"
              title="My calendar"
              className="text-podio-secondary hover:text-podio-ink"
            >
              <PodioIcon icon="calendar" className="h-5 w-5" />
            </Link>
            <Link
              href="/messages"
              title="Messages"
              className="text-podio-secondary hover:text-podio-ink"
            >
              <PodioIcon icon="chat" className="h-5 w-5" />
            </Link>
            <Link
              href="/tasks"
              title="My tasks"
              className="text-podio-secondary hover:text-podio-ink"
            >
              <PodioIcon icon="check-square" className="h-5 w-5" />
            </Link>
            <Link
              href="/notifications"
              title="Notifications"
              className="text-podio-secondary hover:text-podio-ink"
            >
              <PodioIcon icon="bell" className="h-5 w-5" />
            </Link>
            <SignOutButton />
          </div>
        </div>
        <p className="mt-1 text-sm text-podio-meta">{user.email}</p>

        <ul className="mt-6 space-y-2">
          {(memberships ?? []).map((m: any) => (
            <li key={m.organizations.id}>
              <Link
                href={`/org/${m.organizations.slug}`}
                className="block rounded border border-podio-border bg-white p-4 shadow-sm hover:border-podio-teal"
              >
                <span className="font-semibold text-podio-ink">
                  {m.organizations.name}
                </span>
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
    </div>
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
      <ul className="mt-3 divide-y divide-podio-border rounded border border-podio-border bg-white shadow-sm">
        {(events ?? []).map((e: any) => (
          <li key={e.id}
            className="flex items-center gap-2 px-3 py-2 text-sm text-podio-secondary">
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
