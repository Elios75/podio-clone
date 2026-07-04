"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Share = {
  id: string;
  email: string | null;
  access: string;
  revoked_at: string | null;
  created_at: string;
};

export function ShareSection({ itemId, shares }: { itemId: string; shares: Share[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<"view" | "comment" | "edit">("view");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = shares.filter((s) => !s.revoked_at);

  async function share() {
    setError(null);
    setMessage(null);
    if (!email.trim()) return;
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("share_item", {
      p_item: itemId,
      p_email: email,
      p_access: access,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    setMessage(
      data?.registered_user
        ? "Shared — they've been notified."
        : "Shared — access activates when they sign up with that email."
    );
    setEmail("");
    router.refresh();
  }

  async function revoke(id: string) {
    await supabase
      .from("item_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    router.refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium">Sharing</h2>
      <p className="mt-1 text-xs text-slate-400">
        Guests get access to this single item only — not the app or workspace.
      </p>

      <ul className="mt-3 space-y-2">
        {active.map((s) => (
          <li key={s.id}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <span>{s.email}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s.access}</span>
            <button onClick={() => revoke(s.id)}
              className="ml-auto text-xs text-slate-400 hover:text-red-600">
              revoke
            </button>
          </li>
        ))}
        {active.length === 0 && (
          <li className="text-sm text-slate-400">Not shared with anyone outside the workspace.</li>
        )}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="email" placeholder="guest@example.com" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
        <select value={access} onChange={(e) => setAccess(e.target.value as any)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="view">Can view</option>
          <option value="comment">Can comment</option>
          <option value="edit">Can edit</option>
        </select>
        <button onClick={share} disabled={busy || !email.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Share
        </button>
      </div>
      {message && <p className="mt-1 text-xs text-green-600">{message}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </section>
  );
}
