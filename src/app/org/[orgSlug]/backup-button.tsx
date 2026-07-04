"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function BackupButton({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("export_org_backup", {
      p_org: orgId,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${orgSlug}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium">Organization backup</p>
      <p className="mt-1 text-xs text-slate-500">
        Download a JSON snapshot of workspaces, apps, fields, items (up to 10,000),
        tasks, automations, and webforms. Admins only; exports are audit-logged.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={download} disabled={busy}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          {busy ? "Preparing…" : "Download backup"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
