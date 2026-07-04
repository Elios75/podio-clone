import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AiBuilder } from "./ai-builder";

export default async function AiBuilderPage({
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

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">✨ AI app builder</h1>
      <p className="mt-1 text-sm text-slate-500">
        Describe a workflow in your own words — get a working app with fields,
        views, and automations. Saved as a private template you can reuse.
      </p>
      <div className="mt-6">
        <AiBuilder wsId={ws.id} orgSlug={orgSlug} wsSlug={wsSlug} />
      </div>
    </main>
  );
}
