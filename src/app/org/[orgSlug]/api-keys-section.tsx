"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "a").replace(/\//g, "b").replace(/=/g, "");
  return `pk_live_${b64}`;
}

export function ApiKeysSection({ orgId, keys }: { orgId: string; keys: ApiKey[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "readwrite">("readwrite");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createKey() {
    setError(null);
    if (!name.trim()) return;
    setBusy(true);
    const raw = randomKey();
    const hash = await sha256Hex(raw);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insError } = await supabase.from("api_keys").insert({
      organization_id: orgId,
      name,
      key_hash: hash,
      prefix: raw.slice(0, 16),
      scopes: scope === "readwrite" ? ["read", "write"] : ["read"],
      created_by: user?.id,
    });
    setBusy(false);
    if (insError) return setError(insError.message);
    setNewKey(raw);
    setName("");
    router.refresh();
  }

  async function revoke(id: string) {
    await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    router.refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium">API keys</h2>
      <p className="mt-1 text-xs text-slate-400">
        Use with <code>Authorization: Bearer &lt;key&gt;</code> against{" "}
        <code>/api/v1/…</code> — see docs/API.md in the repo.
      </p>

      {newKey && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">
            Copy this key now — it won't be shown again:
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 text-xs">{newKey}</code>
            <button
              onClick={() => navigator.clipboard.writeText(newKey)}
              className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100"
            >
              Copy
            </button>
            <button onClick={() => setNewKey(null)} className="text-xs text-amber-600">
              Done
            </button>
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {keys.map((k) => (
          <li key={k.id}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
              k.revoked_at ? "border-slate-100 bg-slate-50 text-slate-400" : "border-slate-200 bg-white"
            }`}>
            <span className="font-medium">{k.name}</span>
            <code className="text-xs text-slate-400">{k.prefix}…</code>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {k.scopes.join(", ")}
            </span>
            <span className="ml-auto text-xs text-slate-400">
              {k.revoked_at
                ? "revoked"
                : k.last_used_at
                ? `used ${new Date(k.last_used_at).toLocaleDateString()}`
                : "never used"}
            </span>
            {!k.revoked_at && (
              <button onClick={() => revoke(k.id)}
                className="text-xs text-slate-400 hover:text-red-600">
                revoke
              </button>
            )}
          </li>
        ))}
        {keys.length === 0 && (
          <li className="text-sm text-slate-400">No API keys yet.</li>
        )}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input placeholder="Key name (e.g. Zapier integration)"
          value={name} onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
        <select value={scope} onChange={(e) => setScope(e.target.value as any)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="readwrite">Read + write</option>
          <option value="read">Read only</option>
        </select>
        <button onClick={createKey} disabled={busy || !name.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Create key
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </section>
  );
}
