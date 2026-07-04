"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const CATEGORIES = [
  "crm", "project_management", "help_desk", "recruiting", "real_estate",
  "accounting", "field_service", "asset_tracking", "client_onboarding", "event_management",
];

export function SaveTemplateButton({ appId, appName }: { appId: string; appName: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${appName} template`);
  const [category, setCategory] = useState("");
  const [includeSamples, setIncludeSamples] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const { error: rpcError } = await supabase.rpc("save_app_template", {
      p_app: appId,
      p_name: name,
      p_category: category || null,
      p_visibility: "org",
      p_include_samples: includeSamples,
    });
    if (rpcError) return setError(rpcError.message);
    setSaved(true);
    setTimeout(() => { setOpen(false); setSaved(false); }, 1500);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
        Save as template
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-2 py-1">
      {saved ? (
        <span className="px-2 text-sm text-green-600">Saved ✓</span>
      ) : (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-40 rounded border border-slate-300 px-2 py-1 text-xs" />
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-slate-300 px-1 py-1 text-xs">
            <option value="">category…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input type="checkbox" checked={includeSamples}
              onChange={(e) => setIncludeSamples(e.target.checked)} />
            samples
          </label>
          <button onClick={save}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white">
            Save
          </button>
          <button onClick={() => setOpen(false)} className="text-xs text-slate-400">✕</button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </>
      )}
    </span>
  );
}
