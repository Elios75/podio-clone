# PWA: offline support, web push, camera capture

Phase 14 PWA depth. Three pieces, all env-gated and safe to leave unconfigured:

- **Service worker** (`public/sw.js`, cache `podio-v1`) — precaches `/offline`
  and `/icon.svg`; navigations are network-first with the offline page as
  fallback; `/icon.svg` and `/_next/static/*` are cache-first with a
  background refresh. Registered by `src/app/sw-register.tsx` from the root
  layout.
- **Web push** — subscribe UI on `/notifications` (`push-toggle.tsx`), rows in
  `podio.push_subscriptions`, delivery via the `push-worker` edge function
  which drains `podio.notifications` where `pushed_at is null`.
- **Offline drafts + camera** — in the item form (`item-form.tsx`).

## Web push setup

1. **Generate VAPID keys** (once per environment):

   ```bash
   npx web-push generate-vapid-keys
   ```

2. **Edge function secrets:**

   ```bash
   supabase secrets set \
     VAPID_PUBLIC_KEY=<public key> \
     VAPID_PRIVATE_KEY=<private key> \
     VAPID_SUBJECT=mailto:you@example.com \
     PUSH_WORKER_TOKEN=<long-random-string>
   ```

   With no VAPID secrets set the worker no-ops (rows keep `pushed_at = null`),
   mirroring the SMS/Resend workers.

3. **Deploy the worker** (auth is the `x-worker-token` header, not a JWT):

   ```bash
   supabase functions deploy push-worker --no-verify-jwt
   ```

4. **Vault secrets** (lets a DB cron find and authenticate to the worker,
   same pattern as `sms_worker_url`/`sms_worker_token`):

   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-worker', 'push_worker_url');
   select vault.create_secret('<same-long-random-string>', 'push_worker_token');
   ```

5. **Client key** in `.env.local` (the "Enable push notifications" button on
   `/notifications` only renders when this is set):

   ```bash
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
   ```

### How delivery works

```
notification insert         cron / manual POST              push-worker edge fn
  pushed_at = null     →    x-worker-token header      →    up to 20 recent (24h) rows,
                                                            web-push to each of the
                                                            user's subscriptions,
                                                            sets pushed_at = now()
```

- Notification title is the humanized `event_type` ("task_assigned" → "Task
  assigned"); body comes from `payload.message` / `task_title` / `item_title`
  with a generic fallback; clicking opens `/notifications`.
- `pushed_at` is always set after an attempt — even when the user has no
  subscriptions — so each notification is pushed at most once.
- Endpoints answering 404/410 (expired subscriptions) are deleted.
- Disabling push in the UI unsubscribes the browser and deletes the row;
  `push_subscriptions` is RLS'd so users manage only their own rows.

## Offline drafts

In **create mode only**, the item form debounce-saves `{values, savedAt}` to
`localStorage` under `podio-draft-<appId>` as you type. If you return to the
form (after a crash, offline drop, or closed tab), the draft is restored and a
bar offers "clear draft". The key is removed after a successful save. Edit
mode never touches drafts, so existing items can't be clobbered by stale local
state. File/image values store only `{path, name}` (uploads already on
storage), so drafts stay small.

## Camera capture

Image fields show a "📷 Camera" button next to the file input. It clicks a
hidden `<input type="file" accept="image/*" capture="environment">`, which on
mobile opens the rear camera directly; the photo flows through the same upload
handler as a picked file. On desktop browsers without capture support it
behaves like a normal file picker.

## Offline page

`/offline` is a static page precached at service-worker install; any failed
navigation while offline falls back to it. It reminds the user that typed
drafts are already saved on the device.
