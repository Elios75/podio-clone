"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ConsentForm({
  clientId,
  redirectUri,
  scopes,
  state,
}: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function redirectWith(params: Record<string, string>) {
    const url = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (state) url.searchParams.set("state", state);
    window.location.href = url.toString();
  }

  async function allow() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("oauth_authorize", {
      p_client_id: clientId,
      p_redirect_uri: redirectUri,
      p_scopes: scopes,
    });
    if (rpcError || !data?.code) {
      setBusy(false);
      setError(rpcError?.message ?? "Authorization failed. Try again.");
      return;
    }
    redirectWith({ code: data.code });
  }

  function deny() {
    redirectWith({ error: "access_denied" });
  }

  return (
    <div className="mt-5">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={deny}
          disabled={busy}
          className="rounded border border-podio-border bg-white px-4 py-1.5 text-sm text-podio-ink hover:bg-podio-row-hover disabled:opacity-50"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={allow}
          disabled={busy}
          className="rounded bg-podio-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-podio-teal-dark disabled:opacity-50"
        >
          {busy ? "Authorizing…" : "Allow"}
        </button>
      </div>
    </div>
  );
}
