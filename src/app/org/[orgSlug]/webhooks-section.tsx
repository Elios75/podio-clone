"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EVENTS = [
  "item_created", "item_updated", "comment_added",
  "task_created", "task_completed", "form_submitted", "email_received",
];

type Hook = {
  id: string;
  url: string;
  events: string[];
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
};
type Delivery = {
  id: string;
  webhook_id: string;
  event_type: string;
  status: string;
  response_status: number | null;
  created_at: string;
};

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "whsec_" + btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "a").replace(/\//g, "b").replace(/=/g, "");
}

export function WebhooksSection({
  orgId,
  hooks,
  deliveries,
}: {
  orgId: string;
  hooks: Hook[];
  deliveries: Delivery[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["item_created"]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleEvent(e: string) {
    setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);
  }

  async function create() {
    setError(null);
    if (!url.startsWith("http") || events.length === 0)
      return setError("Valid URL and at least one event required.");
    const secret = randomSecret();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insError } = await supabase.from("webhooks").insert({
      organization_id: orgId,
      url,
      events,
      secret,
      verify_token: crypto.randomUUID(),
      created_by: user?.id,
    });
    if (insError) return setError(insError.message);
    setNewSecret(secret);
    setUrl("");
    router.refresh();
  }

  async function ping(id: string) {
    await supabase.rpc("ping_webhook", { p_hook: id });
    router.refresh();
  }

  async function verify(id: string) {
    await supabase.from("webhooks").update({ is_verified: true }).eq("id", id);
    router.refresh();
  }

  async function toggleActive(h: Hook) {
    await supabase.from("webhooks").update({ is_active: !h.is_active }).eq("id", h.id);
    router.refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium">Webhooks</h2>
      <p className="mt-1 text-xs text-slate-400">
        POST events to external URLs, signed with{" "}
        <code>X-Webhook-Signature</code> (HMAC-SHA256 of the body with your
        secret). Delivered by a background worker with retries.
      </p>

      {newSecret && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">
            Signing secret — copy now, shown once:
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 text-xs">{newSecret}</code>
            <button onClick={() => navigator.clipboard.writeText(newSecret)}
              className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700">Copy</button>
            <button onClick={() => setNewSecret(null)} className="text-xs text-amber-600">Done</button>
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {hooks.map((h) => {
          const hDeliveries = deliveries.filter((d) => d.webhook_id === h.id).slice(0, 5);
          return (
            <li key={h.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${
                  !h.is_active ? "bg-slate-300" : h.is_verified ? "bg-green-500" : "bg-amber-400"}`} />
                <code className="truncate text-xs">{h.url}</code>
                <span className="ml-auto flex gap-3 text-xs">
                  <button onClick={() => ping(h.id)} className="text-slate-500 hover:text-blue-600">
                    send ping
                  </button>
                  {!h.is_verified && (
                    <button onClick={() => verify(h.id)} className="text-amber-600 hover:underline">
                      mark verified
                    </button>
                  )}
                  <button onClick={() => toggleActive(h)} className="text-slate-500 hover:text-blue-600">
                    {h.is_active ? "disable" : "enable"}
                  </button>
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {h.events.join(", ")}
                {!h.is_verified && " · unverified — only pings are sent until you mark it verified"}
              </p>
              {hDeliveries.length > 0 && (
                <div className="mt-1 flex gap-2 text-xs text-slate-400">
                  Recent:
                  {hDeliveries.map((d) => (
                    <span key={d.id}
                      title={`${d.event_type} → ${d.response_status ?? "…"}`}
                      className={
                        d.status === "success" ? "text-green-600"
                        : d.status === "failed" ? "text-red-500" : "text-slate-400"}>
                      {d.status === "success" ? "✓" : d.status === "failed" ? "✕" : "…"}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {hooks.length === 0 && <li className="text-sm text-slate-400">No webhooks yet.</li>}
      </ul>

      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
        <input placeholder="https://your-endpoint.example.com/hook" value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {EVENTS.map((e) => (
            <label key={e} className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={events.includes(e)} onChange={() => toggleEvent(e)} />
              {e}
            </label>
          ))}
        </div>
        <button onClick={create}
          className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Create webhook
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </section>
  );
}
