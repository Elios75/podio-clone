# Twilio SMS (Phase 13b)

The `send_sms` automation action queues rows in `podio.outbound_sms`. Delivery
runs through the `sms-worker` edge function because Twilio's Messages API needs
a form-encoded body + Basic auth, which `pg_net` (JSON-only) can't produce.

```
exec_action('send_sms')          pg_cron (every minute,          sms-worker edge fn
  → INSERT outbound_sms    →     only if queued rows exist)  →   claims rows, POSTs to
    status='queued'              pings worker via pg_net          Twilio form-encoded,
                                                                  marks success/failed
```

Everything is env-gated: with no secrets set, rows stay `queued` and nothing
errors (same pattern as the Resend email worker).

## Setup

1. **Deploy the worker** (already deployed on the linked project; for fresh
   installs):

   ```bash
   supabase functions deploy sms-worker --no-verify-jwt
   ```

   `--no-verify-jwt` because auth is the `x-worker-token` header, not a user JWT.

2. **Edge function secrets:**

   ```bash
   supabase secrets set \
     TWILIO_ACCOUNT_SID=ACxxxxxxxx \
     TWILIO_AUTH_TOKEN=xxxxxxxx \
     TWILIO_FROM=+15551234567 \
     SMS_WORKER_TOKEN=<long-random-string>
   ```

3. **Vault secrets** (lets the DB cron find and authenticate to the worker):

   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/sms-worker', 'sms_worker_url');
   select vault.create_secret('<same-long-random-string>', 'sms_worker_token');
   ```

## Behavior

- Phone numbers are normalized to digits/`+` and validated (`+` E.164-ish,
  7–15 digits); bodies are truncated at 1600 chars (Twilio's max).
- The worker claims each row (`queued → running` with a guard) before sending,
  so overlapping invocations can't double-send.
- Results land on the row: `status`, `provider_sid` (Twilio message SID),
  `sent_at`, `error`. Org members can read their org's rows (RLS).
- Batch of 10 per invocation; the cron re-pings every minute while a backlog
  exists.
