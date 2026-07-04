import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  GeneralSettings,
  AppsManager,
  MembersManager,
  DangerZone,
} from "./settings-sections";

const PRIVACY_OPTIONS = ["open", "private"];

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; wsSlug: string }>;
}) {
  const { orgSlug, wsSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: org } = await supabase
    .from("organizations")
    .select("id, slug")
    .eq("slug", orgSlug)
    .single();
  if (!org) notFound();

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, slug, description, privacy, is_archived")
    .eq("organization_id", org.id)
    .eq("slug", wsSlug)
    .single();
  if (!ws) notFound();

  const { data: apps } = await supabase
    .from("apps")
    .select("id, name, slug, icon, is_archived")
    .eq("workspace_id", ws.id)
    .order("name");

  const { data: members } = await supabase
    .from("workspace_members")
    .select("id, role, user_id, user_profiles:user_id(full_name)")
    .eq("workspace_id", ws.id);

  const { data: orgMembers } = await supabase
    .from("organization_members")
    .select("user_id, user_profiles:user_id(full_name)")
    .eq("organization_id", org.id);

  const memberList = (members ?? []).map((m: any) => ({
    id: m.id as string,
    role: m.role as string,
    user_id: m.user_id as string,
    name: (m.user_profiles?.full_name ?? m.user_id) as string,
  }));
  const memberIds = new Set(memberList.map((m) => m.user_id));
  const invitable = (orgMembers ?? [])
    .filter((om: any) => !memberIds.has(om.user_id))
    .map((om: any) => ({
      user_id: om.user_id as string,
      name: (om.user_profiles?.full_name ?? om.user_id) as string,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="min-h-screen bg-podio-page pb-10">
      <div className="mx-auto max-w-3xl px-4 pt-6 md:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-podio-ink">
            Workspace settings
          </h1>
          <Link
            href={`/org/${orgSlug}/${ws.slug}`}
            className="text-sm text-podio-teal hover:underline"
          >
            ← {ws.name}
          </Link>
        </div>

        <div className="mt-4 space-y-4">
          <section
            id="general"
            className="rounded border border-podio-border bg-white p-4 shadow-sm"
          >
            <h2 className="mb-3 font-semibold text-podio-teal">General</h2>
            <GeneralSettings
              wsId={ws.id}
              name={ws.name}
              description={ws.description}
              privacy={ws.privacy}
              privacyOptions={PRIVACY_OPTIONS}
            />
          </section>

          <section
            id="apps"
            className="rounded border border-podio-border bg-white p-4 shadow-sm"
          >
            <h2 className="mb-2 font-semibold text-podio-teal">Apps</h2>
            <AppsManager
              apps={(apps ?? []).map((a: any) => ({
                id: a.id as string,
                name: a.name as string,
                slug: a.slug as string,
                icon: (a.icon ?? null) as string | null,
                is_archived: !!a.is_archived,
              }))}
              orgSlug={orgSlug}
              wsSlug={ws.slug}
            />
          </section>

          <section
            id="members"
            className="rounded border border-podio-border bg-white p-4 shadow-sm"
          >
            <h2 className="mb-2 font-semibold text-podio-teal">Members</h2>
            <MembersManager
              wsId={ws.id}
              members={memberList}
              invitable={invitable}
              currentUserId={user.id}
            />
          </section>

          <section
            id="danger"
            className="rounded border border-red-200 bg-white p-4 shadow-sm"
          >
            <h2 className="mb-3 font-semibold text-red-600">Danger zone</h2>
            <DangerZone
              wsId={ws.id}
              wsName={ws.name}
              orgSlug={orgSlug}
              currentUserId={user.id}
              isArchived={!!ws.is_archived}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
