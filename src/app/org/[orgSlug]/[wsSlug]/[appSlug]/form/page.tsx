import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormSettings } from "./form-settings";
import { EmailToApp } from "./email-to-app";

export default async function FormPage({
  params,
}: {
  params: Promise<{ orgSlug: string; wsSlug: string; appSlug: string }>;
}) {
  const { orgSlug, wsSlug, appSlug } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations").select("id, slug").eq("slug", orgSlug).single();
  if (!org) notFound();
  const { data: ws } = await supabase
    .from("workspaces").select("id, slug")
    .eq("organization_id", org.id).eq("slug", wsSlug).single();
  if (!ws) notFound();
  const { data: app } = await supabase
    .from("apps").select("id, name, slug, icon")
    .eq("workspace_id", ws.id).eq("slug", appSlug).single();
  if (!app) notFound();

  const { data: fields } = await supabase
    .from("app_fields")
    .select("id, external_id, label, type")
    .eq("app_id", app.id).eq("status", "active")
    .order("position");

  const { data: webform } = await supabase
    .from("webforms")
    .select("*")
    .eq("app_id", app.id)
    .maybeSingle();

  const { data: emailAddress } = await supabase
    .from("app_email_addresses")
    .select("*")
    .eq("app_id", app.id)
    .maybeSingle();

  const { data: submissions } = webform
    ? await supabase
        .from("webform_submissions")
        .select("id, submitter_email, created_at, item_id")
        .eq("webform_id", webform.id)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] as any[] };

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">
        Webform — {app.icon} {app.name}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        A public page where anyone can submit new records into this app — no
        login required.
      </p>
      <div className="mt-6">
        <FormSettings
          appId={app.id}
          appSlug={app.slug}
          fields={(fields ?? []) as any}
          webform={webform}
          recentSubmissions={submissions ?? []}
        />
        <EmailToApp
          appId={app.id}
          appSlug={app.slug}
          fields={(fields ?? []) as any}
          address={emailAddress}
        />
      </div>
    </main>
  );
}
