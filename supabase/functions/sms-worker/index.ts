// sms-worker: drains podio.outbound_sms through Twilio.
//
// Why an edge function? Twilio's Messages API requires an
// application/x-www-form-urlencoded body + HTTP Basic auth — pg_net can only
// POST JSON, so the DB cron (podio.process_outbound_sms) pings this function
// whenever queued rows exist, and this function speaks Twilio's dialect.
//
// Secrets (supabase secrets set ...):
//   SMS_WORKER_TOKEN   — must match the 'sms_worker_token' Vault secret
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy with verify_jwt=false; auth is the x-worker-token header.

import { createClient } from "jsr:@supabase/supabase-js@2";

const BATCH = 10;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const workerToken = Deno.env.get("SMS_WORKER_TOKEN");
  if (!workerToken || req.headers.get("x-worker-token") !== workerToken) {
    return new Response("unauthorized", { status: 401 });
  }

  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const auth = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM");
  if (!sid || !auth || !from) {
    // Not configured: no-op, rows stay queued (mirrors the Resend worker).
    return Response.json({ sent: 0, reason: "twilio secrets not set" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "podio" } },
  );

  const { data: queued, error } = await supabase
    .from("outbound_sms")
    .select("id, to_number, body")
    .eq("status", "queued")
    .order("created_at")
    .limit(BATCH);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const row of queued ?? []) {
    // Claim the row first so overlapping invocations never double-send.
    const { data: claimed } = await supabase
      .from("outbound_sms")
      .update({ status: "running" })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id");
    if (!claimed?.length) continue;

    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${sid}:${auth}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: row.to_number,
            From: from,
            Body: row.body,
          }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        await supabase.from("outbound_sms").update({
          status: "success",
          provider_sid: payload.sid ?? null,
          sent_at: new Date().toISOString(),
          error: null,
        }).eq("id", row.id);
        sent++;
      } else {
        await supabase.from("outbound_sms").update({
          status: "failed",
          error: String(payload.message ?? `HTTP ${res.status}`).slice(0, 300),
        }).eq("id", row.id);
        failed++;
      }
    } catch (e) {
      await supabase.from("outbound_sms").update({
        status: "failed",
        error: String(e).slice(0, 300),
      }).eq("id", row.id);
      failed++;
    }
  }

  return Response.json({ sent, failed, batch: queued?.length ?? 0 });
});
