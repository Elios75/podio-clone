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

  // Current user → global-bar right cluster (avatar, bell count, chat)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("user_profiles")
        .select("full_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  const { count: unread } = user
    ? await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null)
    : { count: 0 };

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
      <GlobalBar
        left={drawer}
        user={
          user
            ? {
                id: user.id,
                name: profile?.full_name ?? user.email ?? null,
                avatarUrl: profile?.avatar_url ?? null,
              }
            : undefined
        }
        initialUnread={unread ?? 0}
      />

      {/* Full-width content: the app's views pane is now the leftmost column */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
