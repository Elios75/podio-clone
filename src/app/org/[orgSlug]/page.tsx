import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateWorkspaceForm } from "./create-workspace-form";
import { ApiKeysSection } from "./api-keys-section";
import { WebhooksSection } from "./webhooks-section";
import { MemberRoleSelect } from "@/components/member-role-select";
import { SsoSettings } from "./sso-settings";

export default async function OrgPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, security_settings")
    .eq("slug", orgSlug)
    .single();
  if (!org) notFound();

  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, name, slug, description, privacy, created_at")
    .eq("organization_id", org.id)
    .eq("is_archived", false)
    .order("created_at");

  const { data: members } = await supabase
    .from("organization_members")
    .select("id, role, user_id, user_profiles:user_id(full_name)")
    .eq("organization_id", org.id);

  // Only org admins get rows back (RLS); empty for everyone else
  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, name, prefix, scopes, last_used_at, revoked_at, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  const { data: hooks } = await supabase
    .from("webhooks")
    .select("id, url, events, is_verified, is_active, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });
  const hookIds = (hooks ?? []).map((h) => h.id);
  const { data: hookDeliveries } = hookIds.length
    ? await supabase
        .from("webhook_deliveries")
        .select("id, webhook_id, event_type, status, response_status, created_at")
        .in("webhook_id", hookIds)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] as any[] };

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <Link href={`/org/${org.slug}/audit`}
          className="text-sm text-slate-500 hover:underline">
          Audit log
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {(members ?? []).length} member{(members ?? []).length === 1 ? "" : "s"}
      </p>

      <h2 className="mt-8 text-lg font-medium">Workspaces</h2>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(workspaces ?? []).map((ws) => (
          <li key={ws.id}>
            <Link
              href={`/org/${org.slug}/${ws.slug}`}
              className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-400"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{ws.name}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {ws.privacy}
                </span>
              </div>
              {ws.description && (
                <p className="mt-1 truncate text-sm text-slate-500">
                  {ws.description}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <CreateWorkspaceForm orgId={org.id} orgSlug={org.slug} />
      </div>

      <h2 className="mt-10 text-lg font-medium">Members</h2>
      <ul className="mt-3 space-y-2">
        {(members ?? []).map((m: any) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2"
          >
            <span className="text-sm">
              {m.user_profiles?.full_name ?? m.user_id}
            </span>
            <MemberRoleSelect
              table="organization_members"
              memberId={m.id}
              role={m.role}
              options={["owner", "admin", "employee", "light", "external", "guest"]}
            />
          </li>
        ))}
      </ul>

      <ApiKeysSection orgId={org.id} keys={(apiKeys ?? []) as any} />
      <WebhooksSection
        orgId={org.id}
        hooks={(hooks ?? []) as any}
        deliveries={(hookDeliveries ?? []) as any}
      />
      <SsoSettings orgId={org.id} settings={org.security_settings as any} />
    </main>
  );
}
