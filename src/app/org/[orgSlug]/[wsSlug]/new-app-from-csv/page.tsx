import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppFromCsv } from "./app-from-csv";
import { AppTabBar } from "../app-tab-bar";

export default async function NewAppFromCsvPage({
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
    .from("workspaces").select("id, name, slug")
    .eq("organization_id", org.id).eq("slug", wsSlug).single();
  if (!ws) notFound();

  // Workspace chrome: the app tab bar must NEVER disappear on workspace pages.
  const { data: siblingApps } = await supabase
    .from("apps")
    .select("id, name, slug, icon")
    .eq("workspace_id", ws.id)
    .eq("is_archived", false)
    .order("name");

  return (
    <main className="min-h-screen bg-podio-page pb-10">
      <AppTabBar orgSlug={orgSlug} wsSlug={wsSlug} apps={siblingApps ?? []} />
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
      <h1 className="text-2xl font-semibold">New app from CSV — {ws.name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your spreadsheet's columns become the app's fields. Field types are
        guessed from the data — adjust anything before creating.
      </p>
      <div className="mt-6">
        <AppFromCsv wsId={ws.id} orgSlug={org.slug} wsSlug={ws.slug} />
      </div>
    </div>
    </main>
  );
}
