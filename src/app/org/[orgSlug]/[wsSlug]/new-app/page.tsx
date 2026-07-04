import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppBuilder } from "./app-builder";

export default async function NewAppPage({
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

  const { data: workspaceApps } = await supabase
    .from("apps")
    .select("id, name")
    .eq("workspace_id", ws.id)
    .eq("is_archived", false)
    .order("name");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">New app in {ws.name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        An app is a custom business object — a CRM, project tracker, ticket
        queue. Define its fields below; you can change them anytime.
      </p>
      <div className="mt-6">
        <AppBuilder
          wsId={ws.id}
          orgSlug={org.slug}
          wsSlug={ws.slug}
          workspaceApps={workspaceApps ?? []}
        />
      </div>
    </main>
  );
}
