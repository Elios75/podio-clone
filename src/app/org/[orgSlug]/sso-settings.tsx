"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAPPABLE_ROLES = ["admin", "employee", "light", "guest"] as const;

export function SsoSettings({
  orgId,
  settings,
}: {
  orgId: string;
  settings: {
    sso_domain?: string;
    enforce_sso?: boolean;
    sso_group_roles?: Record<string, string>;
  } | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [domain, setDomain] = useState(settings?.sso_domain ?? "");
  const [enforce, setEnforce] = useState(settings?.enforce_sso ?? false);
  const [rows, setRows] = useState<{ group: string; role: string }[]>(
    Object.entries(settings?.sso_group_roles ?? {}).map(([group, role]) => ({ group, role }))
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setRow(i: number, patch: Partial<{ group: string; role: string }>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function save() {
    setError(null);
    setSaved(false);
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (r.group.trim()) map[r.group.trim()] = r.role;
    }
    const { error: upError } = await supabase
      .from("organizations")
      .update({
        security_settings: {
          ...(settings ?? {}),
          sso_domain: domain.trim().toLowerCase() || null,
          enforce_sso: enforce,
          sso_group_roles: map,
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
        provider and auto-join this organization. Provider registration happens
        via the Supabase CLI — see docs/SSO.md.
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
      </div>
      {enforce && (
        <p className="mt-2 text-xs text-amber-600">
          Hard enforcement (rejecting password auth at the API, not just in this UI)
          requires the two Auth Hooks from docs/SSO.md to be enabled on the Supabase
          project. Without them this is a UI-level block only.
        </p>
      )}

      <h3 className="mt-5 text-sm font-medium text-slate-700">
        IdP group → role mapping
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        Maps SAML group attributes to organization roles on every SSO login (the
        IdP is authoritative; owners are never changed). Users with no matching
        group join as <span className="font-mono">employee</span>.
      </p>
      <div className="mt-2 space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              placeholder="IdP group name (e.g. Engineering Admins)"
              value={r.group}
              onChange={(e) => setRow(i, { group: e.target.value })}
              className="w-64 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <span className="text-xs text-slate-400">→</span>
            <select
              value={r.role}
              onChange={(e) => setRow(i, { role: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              {MAPPABLE_ROLES.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <button
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              className="text-xs text-slate-400 hover:text-red-600"
            >
              remove
            </button>
          </div>
        ))}
        <button
          onClick={() => setRows((rs) => [...rs, { group: "", role: "employee" }])}
          className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
        >
          + Add mapping
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
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
// Phase 13b: group→role mapping UI added alongside hard-SSO hooks (docs/SSO.md)
