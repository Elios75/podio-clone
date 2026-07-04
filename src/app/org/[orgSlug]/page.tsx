import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function OrgPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
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

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{org.name}</h1>
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
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {m.role}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
