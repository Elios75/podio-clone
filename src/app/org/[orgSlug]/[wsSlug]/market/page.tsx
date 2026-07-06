import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppTabBar } from "../app-tab-bar";
import { MarketBrowser } from "./market-browser";

// Podio App Market — two-zone layout under the global bar + app tab bar:
// grey category sidebar (search + org + category lists) and a white main
// column with section header rows, a 3-up grid of app entries, and
// square-button pagination. See
// docs/design/podio-design-skill/references/layouts.md §11.
export default async function MarketPage({
  params,
}: {
  params: Promise<{ orgSlug: string; wsSlug: string }>;
}) {
  const { orgSlug, wsSlug } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations").select("id, slug, name, logo_url").eq("slug", orgSlug).single();
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

  // Sibling apps of the workspace for the shared app tab bar (market is not
  // an app, so no tab is active).
  const { data: siblingApps } = await supabase
    .from("apps")
    .select("id, name, slug, icon")
    .eq("workspace_id", ws.id)
    .eq("is_archived", false)
    .order("name");

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
    <main>
      <AppTabBar orgSlug={orgSlug} wsSlug={wsSlug} apps={siblingApps ?? []} />

      <MarketBrowser
        templates={templates ?? []}
        reviews={reviews ?? []}
        wsId={ws.id}
        orgSlug={orgSlug}
        wsSlug={wsSlug}
        isOrgAdmin={isOrgAdmin}
        orgId={org.id}
        orgName={org.name}
        orgLogoUrl={org.logo_url ?? null}
      />
    </main>
  );
}
