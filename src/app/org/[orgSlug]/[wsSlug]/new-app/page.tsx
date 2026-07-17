import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppBuilder } from "./app-builder";

export default async function NewAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; wsSlug: string }>;
  searchParams: Promise<{
    name?: string;
    item?: string;
    type?: string;
    icon?: string;
  }>;
}) {
  const { orgSlug, wsSlug } = await params;
  const sp = await searchParams;
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

  // Relationship-target choices span the whole org (RLS limits to workspaces
  // the user belongs to); labels are "Workspace / App" so cross-workspace
  // targets are unambiguous.
  const { data: orgApps } = await supabase
    .from("apps")
    .select("id, name, workspaces:workspace_id(name, organization_id)")
    .eq("is_archived", false)
    .order("name");
  const workspaceApps = (orgApps ?? [])
    .filter((a: any) => a.workspaces?.organization_id === org.id)
    .map((a: any) => ({
      id: a.id as string,
      name: `${a.workspaces?.name ?? "?"} / ${a.name}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

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
          initialName={sp.name ?? ""}
          initialItemName={sp.item ?? "Item"}
          initialIcon={sp.icon ?? "📋"}
          initialType={
            sp.type === "event" || sp.type === "contact" ? sp.type : "standard"
          }
        />
      </div>
    </main>
  );
}
