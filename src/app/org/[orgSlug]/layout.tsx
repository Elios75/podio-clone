import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-4">
        <Link href="/home" className="text-xs text-slate-400 hover:text-slate-600">
          ← All organizations
        </Link>
        <h2 className="mt-2 truncate text-lg font-semibold">{org.name}</h2>

        <p className="mt-6 text-xs font-medium uppercase tracking-wide text-slate-400">
          Workspaces
        </p>
        <nav className="mt-2 space-y-1">
          {(workspaces ?? []).map((ws) => (
            <Link
              key={ws.id}
              href={`/org/${org.slug}/${ws.slug}`}
              className="block truncate rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              <span
                className="mr-2 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: ws.color ?? "#94a3b8" }}
              />
              {ws.name}
            </Link>
          ))}
          {(workspaces ?? []).length === 0 && (
            <p className="px-2 text-sm text-slate-400">None yet</p>
          )}
        </nav>

        <Link
          href={`/org/${org.slug}`}
          className="mt-6 block rounded-md px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
        >
          + New workspace
        </Link>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
