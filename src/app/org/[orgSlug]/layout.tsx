import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlobalBar } from "@/components/global-bar";
import { WorkspaceDrawer } from "./workspace-drawer";

// Podio chrome: workspaces live behind the ☰ drawer (WorkspaceDrawer), so the
// page content — including each app's views pane — owns the full width.
export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
    .select("id, name, slug, color, is_archived")
    .eq("organization_id", org.id)
    .eq("is_archived", false)
    .order("name");

  const drawer = (
    <WorkspaceDrawer
      orgId={org.id}
      orgName={org.name}
      orgSlug={org.slug}
      workspaces={(workspaces ?? []).map((ws) => ({
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        color: ws.color,
      }))}
    />
  );

  return (
    <div className="flex min-h-screen flex-col">
      {/* Global bar extracted to a shared component (src/components/global-bar.tsx)
          so standalone pages (/tasks, …) render the SAME chrome. With no
          activeTool the output here is identical to the previous inline bar. */}
      <GlobalBar left={drawer} />

      {/* Full-width content: the app's views pane is now the leftmost column */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
