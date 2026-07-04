import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspacePage({
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
    .select("id, name, slug, description, privacy, created_at")
    .eq("organization_id", org.id)
    .eq("slug", wsSlug)
    .single();
  if (!ws) notFound();

  const { data: members } = await supabase
    .from("workspace_members")
    .select("id, role, user_id, user_profiles:user_id(full_name)")
    .eq("workspace_id", ws.id);

  const { data: apps } = await supabase
    .from("apps")
    .select("id, name, slug, icon, item_name")
    .eq("workspace_id", ws.id)
    .eq("is_archived", false)
    .order("name");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{ws.name}</h1>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {ws.privacy}
        </span>
      </div>
      {ws.description && (
        <p className="mt-1 text-sm text-slate-500">{ws.description}</p>
      )}

      <h2 className="mt-8 text-lg font-medium">Apps</h2>
      {(apps ?? []).length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No apps yet. The app builder arrives in Phase 2 — this is where your
          CRM, project tracker, or help desk will live.
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(apps ?? []).map((app) => (
            <li
              key={app.id}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <span className="font-medium">
                {app.icon ? `${app.icon} ` : ""}
                {app.name}
              </span>
            </li>
          ))}
        </ul>
      )}

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
