import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PodioIcon } from "@/components/podio-icon";
import { CreateWorkspaceForm } from "./create-workspace-form";

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

  return (
    <div className="flex min-h-screen flex-col">
      {/* Global top bar (desktop) */}
      <header className="hidden h-14 items-center gap-4 bg-podio-chrome px-4 text-podio-ink md:flex">
        <Link
          href="/home"
          title="All organizations"
          className="flex items-center gap-3 hover:opacity-80"
        >
          <span aria-hidden>
            <PodioIcon icon="menu" className="h-5 w-5" />
          </span>
          <span className="truncate text-lg font-semibold text-podio-ink">
            {org.name}
          </span>
        </Link>
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

      {/* Mobile top bar */}
      <div className="flex items-center gap-3 bg-podio-chrome px-4 py-3 text-podio-ink md:hidden">
        <Link href="/home" className="text-xs text-podio-secondary">←</Link>
        <span className="truncate font-semibold">{org.name}</span>
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
      {/* Mobile workspace strip */}
      <div className="flex gap-2 overflow-x-auto border-b border-podio-border bg-white px-4 py-2 md:hidden">
        {(workspaces ?? []).map((ws) => (
          <Link key={ws.id} href={`/org/${org.slug}/${ws.slug}`}
            className="shrink-0 rounded-full border border-podio-border px-3 py-1 text-xs text-podio-teal">
            {ws.name}
          </Link>
        ))}
        <Link href={`/org/${org.slug}`}
          className="shrink-0 rounded-full border border-podio-border px-3 py-1 text-xs font-medium text-podio-teal">
          + New
        </Link>
      </div>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="hidden w-64 shrink-0 border-r border-podio-border bg-white p-4 md:block">
          <p className="text-xs font-medium uppercase tracking-wide text-podio-meta">
            Workspaces
          </p>
          <nav className="mt-2 space-y-0.5">
            {(workspaces ?? []).map((ws) => (
              <Link
                key={ws.id}
                href={`/org/${org.slug}/${ws.slug}`}
                className="block truncate rounded px-2 py-1.5 text-sm text-podio-teal hover:bg-podio-row-hover"
              >
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: ws.color ?? "#8A9494" }}
                />
                {ws.name}
              </Link>
            ))}
            {(workspaces ?? []).length === 0 && (
              <p className="px-2 text-sm text-podio-meta">None yet</p>
            )}
          </nav>

          <div className="mt-6">
            <CreateWorkspaceForm orgId={org.id} orgSlug={org.slug} trigger="sidebar" />
          </div>
        </aside>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
