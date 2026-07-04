// push-worker: delivers unread podio.notifications as Web Push messages.
//
// Why an edge function? Web Push requires VAPID-signed JWTs + payload
// encryption (RFC 8291) — far beyond what pg_net can do, so the DB cron pings
// this function (same shape as sms-worker) and it speaks the push protocol
// via the npm web-push library.
//
// Secrets (supabase secrets set ...):
//   PUSH_WORKER_TOKEN  — must match the 'push_worker_token' Vault secret
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (mailto:... or https URL)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy with verify_jwt=false; auth is the x-worker-token header.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push";

const BATCH = 20;

// "task_assigned" → "Task assigned"
function humanize(eventType: string): string {
  const s = (eventType || "notification").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const workerToken = Deno.env.get("PUSH_WORKER_TOKEN");
  if (!workerToken || req.headers.get("x-worker-token") !== workerToken) {
    return new Response("unauthorized", { status: 401 });
  }

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    // Not configured: no-op (mirrors the Twilio/Resend workers).
    return Response.json({ sent: 0, reason: "vapid secrets not set" });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "podio" } },
  );

  // Only push recent notifications so a stale backlog never spams devices.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await supabase
    .from("notifications")
    .select("id, user_id, event_type, payload")
    .is("pushed_at", null)
    .gte("created_at", since)
    .order("created_at")
    .limit(BATCH);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  let expired = 0;

  for (const n of pending ?? []) {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys")
      .eq("user_id", n.user_id);

    const payload = (n.payload ?? {}) as Record<string, unknown>;
    const body = String(
      payload.message ??
        payload.task_title ??
        payload.item_title ??
        "You have a new notification",
    );
    const message = JSON.stringify({
      title: humanize(n.event_type),
      body,
      url: "/notifications",
    });

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          message,
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Subscription is gone — drop it so we stop trying.
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
          expired++;
        } else {
          failed++;
        }
      }
    }

    // Always mark as pushed (even with zero subscriptions) so each
    // notification is attempted exactly once.
    await supabase
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", n.id);
  }

  return Response.json({
    notifications: pending?.length ?? 0,
    sent,
    failed,
    expired,
  });
});
