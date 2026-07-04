# Email Setup (Outbound + Inbound)

## Outbound (Resend)

Everything queues into `podio.outbound_emails` (automation send-email actions,
daily digests). A per-minute cron worker delivers through Resend using `pg_net`
— no server code, no env vars. The API key lives in Supabase Vault.

1. Create a free account at resend.com, generate an API key.
2. In the Supabase SQL editor:

```sql
select vault.create_secret('re_your_api_key_here', 'resend_api_key');
-- Optional custom sender (requires a verified domain in Resend):
select vault.create_secret('Acme <notifications@acme.com>', 'email_from');
```

3. Done. Queued rows drain within a minute; check `outbound_emails.status`
   (`success` / `failed` with the provider response in `error`).

Notes: without `email_from`, the default `onboarding@resend.dev` sender is used,
which Resend only delivers to your own account email — fine for testing.
Remove the key to pause sending (`select vault.update_secret(...)` or delete).

## Inbound (email-to-app + reply threading)

1. Generate an address per app on its Webform page ("Email to app").
2. Set `INBOUND_EMAIL_SECRET` in `.env.local` / Vercel env.
3. Point an inbound provider (Resend inbound, Postmark, SendGrid Inbound Parse)
   for your domain at:

```
POST https://your-app.example.com/api/inbound-email?secret=<INBOUND_EMAIL_SECRET>
```

4. Set `NEXT_PUBLIC_INBOUND_DOMAIN` to your inbound domain so generated
   addresses display correctly.

**Reply threading:** mail to `appaddress+i42@domain` attaches to item #42 of
that app (activity + follower notifications) instead of creating a new item.
Use it in outbound templates as the Reply-To to build ticket-style threads.

## Storage note

Since migration 30 the `podio-files` bucket is **private**; the app serves
files via signed URLs (1-hour expiry). Anyone with an old public URL no longer
has access.
