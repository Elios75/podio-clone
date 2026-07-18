"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ConnectionStatus = {
  connected: boolean;
  client_id: string | null;
  updated_at?: string | null;
};

// Connect-Podio card + queue-an-import form. Credentials are sent to a
// server-side RPC (podio.podio_connect) and stored for the background
// importer — they never touch the browser again after submit.
export function ConnectPodio({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Connect form state
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Queue form state
  const [spaceId, setSpaceId] = useState("");
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);

  const fetchStatus = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("podio_connection_status", {
      p_org: orgId,
    });
    if (!error && data) setStatus(data as ConnectionStatus);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectError(null);
    setConnecting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("podio_connect", {
      p_org: orgId,
      p_client_id: clientId.trim(),
      p_client_secret: clientSecret,
      p_refresh_token: refreshToken,
    });
    setConnecting(false);
    if (error) {
      setConnectError(error.message);
      return;
    }
    setClientId("");
    setClientSecret("");
    setRefreshToken("");
    await fetchStatus();
  };

  const handleDisconnect = async () => {
    setConnectError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("podio_disconnect", { p_org: orgId });
    if (error) {
      setConnectError(error.message);
      return;
    }
    await fetchStatus();
  };

  const handleQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setQueueError(null);
    const parsed = Number(spaceId.trim());
    if (!spaceId.trim() || !Number.isInteger(parsed) || parsed <= 0) {
      setQueueError("Enter a numeric Podio space id.");
      return;
    }
    setQueueing(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("podio_queue_import", {
      p_org: orgId,
      p_space_id: parsed,
    });
    setQueueing(false);
    if (error) {
      setQueueError(error.message);
      return;
    }
    setSpaceId("");
    router.refresh();
  };

  const inputClass =
    "w-full rounded border border-podio-border bg-white px-2.5 py-1.5 text-[15px] text-podio-ink placeholder:text-podio-meta focus:border-[#15808D] focus:outline-none";
  const labelClass = "block text-xs font-medium text-podio-secondary";

  if (loading) {
    return (
      <section className="mt-6 rounded border border-podio-border bg-white p-4 shadow-sm">
        <p className="text-sm text-podio-meta">Checking Podio connection…</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded border border-podio-border bg-white p-4 shadow-sm">
      {status?.connected ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-medium text-podio-teal">
              ✓ Podio connected
              {status.client_id ? (
                <span className="font-normal text-podio-secondary">
                  {" "}
                  (client{" "}
                  <code className="rounded bg-podio-row-alt px-1 py-0.5 text-[13px]">
                    {status.client_id}
                  </code>
                  )
                </span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-xs text-podio-secondary hover:text-[#A33B33] hover:underline"
            >
              Disconnect
            </button>
          </div>
          {connectError && (
            <p className="mt-2 text-sm text-[#A33B33]">{connectError}</p>
          )}

          <form onSubmit={handleQueue} className="mt-4 border-t border-podio-border pt-4">
            <h3 className="text-[15px] font-semibold text-podio-ink">
              Import a workspace
            </h3>
            <div className="mt-2 flex items-start gap-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
                placeholder="Podio space id"
                className={`${inputClass} max-w-[220px]`}
              />
              <button
                type="submit"
                disabled={queueing}
                className="rounded bg-[#15808D] px-4 py-1.5 text-[15px] font-semibold text-white hover:bg-[#0F6D79] disabled:opacity-60"
              >
                {queueing ? "Queueing…" : "Import"}
              </button>
            </div>
            {queueError && (
              <p className="mt-2 text-sm text-[#A33B33]">{queueError}</p>
            )}
            <p className="mt-2 text-xs text-podio-meta">
              Find space ids with the space list in{" "}
              <code className="rounded bg-podio-row-alt px-1 py-0.5">
                docs/PODIO-IMPORT.md
              </code>
              , or in the Podio URL of the workspace.
            </p>
          </form>
        </>
      ) : (
        <form onSubmit={handleConnect}>
          <h2 className="text-base font-semibold text-podio-ink">
            Connect Podio
          </h2>
          <p className="mt-1 text-sm text-podio-secondary">
            Create an API key at{" "}
            <span className="text-podio-ink">podio.com/settings/api</span>. The
            refresh token comes from the one-time token command in{" "}
            <code className="rounded bg-podio-row-alt px-1 py-0.5 text-[13px]">
              docs/PODIO-IMPORT.md
            </code>
            . Credentials are stored server-side for the background importer.
          </p>
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="podio-client-id" className={labelClass}>
                Client ID
              </label>
              <input
                id="podio-client-id"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                autoComplete="off"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label htmlFor="podio-client-secret" className={labelClass}>
                Client Secret
              </label>
              <input
                id="podio-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                autoComplete="off"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label htmlFor="podio-refresh-token" className={labelClass}>
                Refresh Token
              </label>
              <input
                id="podio-refresh-token"
                type="password"
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                autoComplete="off"
                className={`mt-1 ${inputClass}`}
              />
            </div>
          </div>
          {connectError && (
            <p className="mt-3 text-sm text-[#A33B33]">{connectError}</p>
          )}
          <button
            type="submit"
            disabled={
              connecting || !clientId.trim() || !clientSecret || !refreshToken
            }
            className="mt-4 rounded bg-[#15808D] px-4 py-1.5 text-[15px] font-semibold text-white hover:bg-[#0F6D79] disabled:opacity-60"
          >
            {connecting ? "Connecting…" : "Connect"}
          </button>
        </form>
      )}
    </section>
  );
}
