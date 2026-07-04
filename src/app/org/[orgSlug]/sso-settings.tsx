"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SsoSettings({
  orgId,
  settings,
}: {
  orgId: string;
  settings: { sso_domain?: string; enforce_sso?: boolean } | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [domain, setDomain] = useState(settings?.sso_domain ?? "");
  const [enforce, setEnforce] = useState(settings?.enforce_sso ?? false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaved(false);
    const { error: upError } = await supabase
      .from("organizations")
      .update({
        security_settings: {
          ...(settings ?? {}),
          sso_domain: domain.trim().toLowerCase() || null,
          enforce_sso: enforce,
        },
      })
      .eq("id", orgId);
    if (upError) return setError(upError.message);
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium">Single sign-on (SAML)</h2>
      <p className="mt-1 text-xs text-slate-400">
        Users signing in with an email on this domain are routed to your identity
        provider and auto-join this organization as employees. Provider
        registration happens via the Supabase CLI — see docs/SSO.md.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          placeholder="company.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={enforce}
            onChange={(e) => setEnforce(e.target.checked)}
          />
          Require SSO (block password login for this domain)
        </label>
        <button
          onClick={save}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Save
        </button>
        {saved && <span className="text-xs text-green-600">Saved ✓</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </section>
  );
}
