"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AiBuilder({
  wsId, orgSlug, wsSlug,
}: { wsId: string; orgSlug: string; wsSlug: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [prompt, setPrompt] = useState("");
  const [def, setDef] = useState<any>(null);
  const [busy, setBusy] = useState<"gen" | "install" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy("gen"); setError(null); setDef(null);
    const res = await fetch("/api/ai/build-app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    setBusy(null);
    if (res.error) return setError(res.error);
    setDef(res.definition);
  }

  async function install() {
    setBusy("install"); setError(null);
    const { data, error: rpcError } = await supabase.rpc("ai_install_app", {
      p_workspace: wsId, p_definition: def,
    });
    setBusy(null);
    if (rpcError) return setError(rpcError.message);
    router.push(`/org/${orgSlug}/${wsSlug}/${data.slug}`);
  }

  return (
    <div className="space-y-4">
      <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the workflow you want to manage — e.g. 'Track our catering orders: client, event date, menu tier, headcount, deposit paid, status from inquiry to delivered. Remind us 2 days before each event.'"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
      <button onClick={generate} disabled={busy !== null || !prompt.trim()}
        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
        {busy === "gen" ? "Designing your app…" : "Generate app"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {def && (
        <div className="rounded-lg border border-violet-200 bg-white p-4">
          <p className="font-medium">{def.app?.icon} {def.app?.name}</p>
          <p className="mt-1 text-sm text-slate-500">{def.app?.description}</p>

          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Fields</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {(def.fields ?? []).map((f: any) => (
              <li key={f.external_id}>
                <span className="font-medium">{f.label}</span>
                <span className="text-slate-400"> · {f.type}</span>
                {f.type === "category" && (
                  <span className="text-slate-400">
                    {" "}({(f.config?.options ?? []).map((o: any) => o.label).join(" / ")})
                  </span>
                )}
                {f.is_required && <span className="text-red-400"> *</span>}
              </li>
            ))}
          </ul>

          {(def.views ?? []).length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Views</p>
              <p className="text-sm text-slate-600">
                {(def.views ?? []).map((v: any) => `${v.name} (${v.layout})`).join(" · ")}
              </p>
            </>
          )}

          {(def.automations ?? []).length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Automations</p>
              <ul className="space-y-0.5 text-sm text-slate-600">
                {(def.automations ?? []).map((a: any, i: number) => (
                  <li key={i}>⚡ {a.name}</li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button onClick={install} disabled={busy !== null}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              {busy === "install" ? "Creating app…" : "Create this app"}
            </button>
            <button onClick={() => setDef(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
              Discard
            </button>
            <span className="text-xs text-slate-400">You can edit everything after creation.</span>
          </div>
        </div>
      )}
    </div>
  );
}
