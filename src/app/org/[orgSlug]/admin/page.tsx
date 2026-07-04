import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ApiKeysSection } from "../api-keys-section";
import { WebhooksSection } from "../webhooks-section";
import { EmailTemplatesSection } from "../email-templates-section";
import { SsoSettings } from "../sso-settings";
import { BrandingSection } from "../branding-section";
import { BillingSection } from "../billing-section";
import { BackupButton } from "../backup-button";

// Administration: all org-admin machinery lives here (moved off the org
// overview, which is now just workspaces + members — like Podio).
export default async function OrgAdminPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, security_settings, logo_url, branding")
    .eq("slug", orgSlug)
    .single();
  if (!org) notFound();

  const { data: myMembership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isOwner = myMembership?.role === "owner";
  const isAdmin = isOwner || myMembership?.role === "admin";

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold text-podio-ink">Administration</h1>
        <div className="mt-8 rounded border border-podio-border bg-white p-6 text-sm text-podio-secondary">
          Only organization owners and admins can manage these settings.
        </div>
      </main>
    );
  }

  // RLS additionally limits each dataset to org admins.
  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, name, prefix, scopes, last_used_at, revoked_at, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  const { data: emailTemplates } = await supabase
    .from("email_templates")
    .select("id, name, subject, body_text")
    .eq("organization_id", org.id)
    .order("name");

  const { data: hooks } = await supabase
    .from("webhooks")
    .select("id, url, events, is_verified, is_active, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });
  const hookIds = (hooks ?? []).map((h) => h.id);
  const { data: hookDeliveries } = hookIds.length
    ? await supabase
        .from("webhook_deliveries")
        .select("id, webhook_id, event_type, status, response_status, created_at")
        .in("webhook_id", hookIds)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] as any[] };

  // Storage usage (approximate; scoped by what RLS lets this user see)
  const { data: fileSizes } = await supabase
    .from("files")
    .select("size_bytes")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .limit(5000);
  const storageBytes = (fileSizes ?? []).reduce(
    (a, f) => a + Number(f.size_bytes ?? 0), 0);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-podio-ink">
          Administration
        </h1>
        <span className="flex items-center gap-4">
          <Link
            href={`/org/${org.slug}/audit`}
            className="text-sm text-podio-secondary hover:underline"
          >
            Audit log
          </Link>
          <Link
            href={`/org/${org.slug}`}
            className="text-sm text-podio-teal hover:underline"
          >
            ← {org.name}
          </Link>
        </span>
      </div>
      <p className="mt-1 text-sm text-podio-secondary">
        API access, integrations, security, branding, and billing for{" "}
        {org.name}.
      </p>

      <ApiKeysSection orgId={org.id} keys={(apiKeys ?? []) as any} />
      <WebhooksSection
        orgId={org.id}
        hooks={(hooks ?? []) as any}
        deliveries={(hookDeliveries ?? []) as any}
      />
      <EmailTemplatesSection orgId={org.id} templates={(emailTemplates ?? []) as any} />
      <SsoSettings orgId={org.id} settings={org.security_settings as any} />
      <BrandingSection
        orgId={org.id}
        orgSlug={org.slug}
        logoUrl={(org as any).logo_url ?? null}
        branding={(org as any).branding ?? null}
      />
      <BillingSection orgId={org.id} isOwner={isOwner} />
      <BackupButton orgId={org.id} orgSlug={org.slug} />

      <p className="mt-10 text-xs text-podio-meta">
        Storage used: {(storageBytes / 1024 / 1024).toFixed(1)} MB of 1024 MB
        (plan baseline).
      </p>
    </main>
  );
}
