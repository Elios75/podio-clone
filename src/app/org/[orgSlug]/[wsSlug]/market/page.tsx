import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TemplateCard } from "./template-card";

export default async function MarketPage({
  params,
}: {
  params: Promise<{ orgSlug: string; wsSlug: string }>;
}) {
  const { orgSlug, wsSlug } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations").select("id, slug").eq("slug", orgSlug).single();
  if (!org) notFound();
  const { data: ws } = await supabase
    .from("workspaces").select("id, slug")
    .eq("organization_id", org.id).eq("slug", wsSlug).single();
  if (!ws) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = user
    ? await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", org.id).eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  const isOrgAdmin = ["owner", "admin"].includes(membership?.role ?? "");

  // RLS returns public templates + this org's templates
  const { data: templates } = await supabase
    .from("app_templates")
    .select("id, organization_id, name, description, category, visibility, version, install_count, rating_avg, definition")
    .order("install_count", { ascending: false });

  const tplIds = (templates ?? []).map((t) => t.id);
  const { data: reviews } = tplIds.length
    ? await supabase
        .from("template_reviews")
        .select("id, template_id, rating, review, created_at")
        .in("template_id", tplIds)
        .order("created_at", { ascending: false })
    : { data: [] as any[] };

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">App market</h1>
      <p className="mt-1 text-sm text-slate-500">
        Install a pre-built app structure into this workspace, then customize it.
      </p>

      <ul className="mt-6 space-y-3">
        {(templates ?? []).map((t: any) => (
          <TemplateCard
            key={t.id}
            template={t}
            reviews={(reviews ?? []).filter((r: any) => r.template_id === t.id)}
            wsId={ws.id}
            orgSlug={orgSlug}
            wsSlug={wsSlug}
            isOrgAdmin={isOrgAdmin}
            isOwnOrg={t.organization_id === org.id}
          />
        ))}
        {(templates ?? []).length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            No templates yet. Open any app and choose “Save as template”.
          </li>
        )}
      </ul>
    </main>
  );
}
