import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PodioIcon } from "@/components/podio-icon";
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
      {/* Global top bar (desktop) */}
      <header className="hidden h-14 items-center gap-4 bg-podio-chrome px-4 text-podio-ink md:flex">
        {drawer}
        <nav className="ml-6 flex items-center gap-5 text-[#4E5E5E]">
          <Link href="/search" title="Search" className="hover:opacity-80">
            <PodioIcon icon="search" className="h-5 w-5" />
          </Link>
          <Link href="/calendar" title="My calendar" className="hover:opacity-80">
            <PodioIcon icon="calendar" className="h-5 w-5" />
          </Link>
          <Link href="/messages" title="Messages" className="hover:opacity-80">
            <PodioIcon icon="chat" className="h-5 w-5" />
          </Link>
          <Link href="/tasks" title="My tasks" className="hover:opacity-80">
            <PodioIcon icon="check-square" className="h-5 w-5" />
          </Link>
        </nav>
        <div className="mx-auto font-semibold tracking-wide">Podio Clone</div>
        <div className="flex items-center gap-4">
          <Link href="/notifications" title="Notifications" className="hover:opacity-80">
            <PodioIcon icon="bell" className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Mobile top bar: same drawer, compact icons */}
      <div className="flex items-center gap-3 bg-podio-chrome px-4 py-3 text-podio-ink md:hidden">
        {drawer}
        <span className="ml-auto flex items-center gap-3 text-sm">
          <Link href="/search" title="Search">
            <PodioIcon icon="search" className="h-5 w-5" />
          </Link>
          <Link href="/messages" title="Messages">
            <PodioIcon icon="chat" className="h-5 w-5" />
          </Link>
          <Link href="/tasks" title="My tasks">
            <PodioIcon icon="check-square" className="h-5 w-5" />
          </Link>
          <Link href="/notifications" title="Notifications">
            <PodioIcon icon="bell" className="h-5 w-5" />
          </Link>
        </span>
      </div>

      {/* Full-width content: the app's views pane is now the leftmost column */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
