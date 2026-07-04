# Development Phases 2 — Gap Analysis & Roadmap (Phases 8–14)

Written after completing Phases 0–7. Every item below is in `podio-clone.md` (the spec) but not yet built, or built as a v1 slice that lacks spec depth. Ordered so that gaps in *existing* features close before new surface area opens.

---

## Working notes (read me first, next session)

- **Personal project mode**: billing limits are intentionally disabled — both orgs are set to the `enterprise` plan (unlimited). Ignore plan-limit concerns until commercialization; the Stripe/billing machinery is built but dormant (env-gated).
- Migrations 0–39 are applied to the linked Supabase project. Repo migration files are kept in sync for fresh installs.
- Workflow: develop in a sandbox clone, apply migrations via the Supabase connector, copy changed files to `C:\Users\fd\podio-clone`, and the user commits/pushes (the GitHub connector is read-only).
- `.env.local` exists locally (gitignored) with the Supabase URL + anon key. Optional keys documented in `.env.local.example` (Turnstile, Stripe, Anthropic).

---

## Phase 8 — App builder completion (the biggest gap)

The builder is create-only. Podio's core promise is *modify anytime*.

- **Edit app schema after creation**: add/rename/retype/delete fields on a live app; soft-delete keeps existing values (`app_fields.status='deleted'` already supported by every query).
- Warning flow when changing/removing fields that hold data (count values, confirm).
- Snapshot each publish to `app_schema_revisions` (table exists, never written) + schema history viewer.
- Builder inputs that exist in schema but not UI: help text, description, default values, hidden / hidden-if-empty toggles.
- Drag-and-drop field ordering (dnd-kit; replaces arrows).
- App settings editing: name, icon, description, usage instructions, item name, archive/delete app with confirmation.
- Field-type depth: multi-select category; multiple values for phone/email (positions exist); date end + time; money currency list per field; link previews/embeds.
- **Calculation engine v1**: same-item formulas over number/money/progress fields, evaluated in `save_item`, stored as normal values (spec §2.12). Rollups from related items follow in Phase 9.
- Enforce spec limits (§20): max fields/app, options/field — cheap trigger checks.

## Phase 9 — Relationships & views depth

- **Related-items section on item detail** (reverse relationships — `item_relationships` has the data; nothing displays it).
- Multi-value relationship fields; restrict selectable items by saved view; cross-workspace picker.
- **Rollup/aggregate over related items** (sum of deal values on a company).
- Relationship map visualization (simple graph of app-to-app links).
- Table layout: show/hide/reorder/resize columns persisted to `app_views.columns` (column exists, unused); inline cell editing.
- Badge and stream layouts (last two of the six spec layouts).
- Group/sub-group in table views; default view per app; view ordering; last-used view memory.
- **View-filter → SQL translation** — the scale prototype flagged since Phase 3; required before any app holds >500 items.

## Phase 10 — Tasks, calendar & collaboration depth

- Task labels UI (schema since day 1), repeating tasks (materialize from `repeat_rule` via the existing cron), reminders (queue notifications at `reminder_at`), task comments/files (polymorphic tables ready), workspace task lists, task filters.
- **Personal calendar**: tasks + items across all apps/workspaces; workspace calendar; week/day views; per-app colors; **ICS feed** (signed URL) for Google/Outlook subscription.
- Status posts UI on workspace streams (schema only today); like/react on activity; feed filters; mute workspace from home stream (`follows.muted` is wired for it).
- Comment depth: revision history, convert-comment-to-task.
- Notification preferences UI (`notification_prefs` jsonb exists) + daily digest (cron assembles, outbound queue sends).

## Phase 11 — Email & files, production-grade

- **Wire outbound delivery**: worker (edge function or route + cron) draining `outbound_emails` through Resend; covers automation emails, notification digests, share invites.
- Inbound live: point provider at `/api/inbound-email`; reply-to-item threading (plus-addressing on item comments → comment instead of new item); attach inbound files.
- Send email from an item; `email_templates` UI (table exists).
- **Storage hardening**: private bucket + signed URLs (current bucket is public — flagged since Phase 2), per-plan size limits, storage quota tracking per org.
- File versioning UI (`previous_version_id` ready), workspace files page, external-link files (Drive/Dropbox URLs as `provider` rows — full pickers in Phase 13).

## Phase 12 — Automation & platform depth

> **Status: Phase 12a shipped** (migration 35): date-reached / comment-added / task-completed / manual triggers; http_request + update_related_item actions; dry-run test mode; run-log detail viewer.
>
> **Phase 12b shipped** (migration 36): webform depth (theme/custom CSS, redirect URL, URL-param prefill via external_ids, embed snippet, allowed-domains stored); API v1.1 (per-key rate limiting w/ 429s, automatic webhook verification handshake, /api/v1/workspaces + /api/v1/tasks endpoints, hosted docs at /developers); marketplace depth (ratings + reviews UI, install with sample data, version bump on re-save, public publishing flow); XLSX import/export via SheetJS (export button + both import flows accept .xlsx). Remaining in Phase 12: scheduled flows, inbound-webhook trigger, PDF/approval/loop actions, flow versioning UI, form captcha + file uploads, embed-domain enforcement, org backup export.
>
> **Phase 12c shipped** (migration 37): scheduled flows (hourly/daily/weekly cron over condition-matched items); inbound-webhook trigger (token-secured POST /api/hooks/:id creates item + fires flow); generate_pdf action + /api/pdf/:itemId renderer (pdf-lib); approval steps (flow pauses on an approval task, resumes on completion) and loop-related steps in advanced flows; automatic flow versioning with history/restore UI; per-form Turnstile captcha (verified in /api/forms/submit; note: direct RPC path bypasses captcha until a service-role gate exists); org backup export (admin JSON snapshot, audit-logged). Phase 12 is complete except: public form file uploads, embed-domain enforcement (frame-ancestors), captcha RPC-bypass hardening.

- Triggers: **date-reached** (cron scans date fields), scheduled flows, task-completed (RPC exists, no automation hook), comment-added, manual "run now" button, inbound-webhook trigger.
- Actions: HTTP request (via `pg_net`, mirroring webhook delivery), **PDF generation** from item + template, approval step (approve/reject task gating the flow), update-related-item, loop over related items.
- Test mode (`automation_runs.is_test` exists), run log detail viewer, flow versioning UI (`automation_revisions` table waiting).
- Webform depth: theme/custom CSS, redirect URL, captcha (Turnstile), embed snippet + allowed domains, URL-parameter prefill (spec §8 — `external_id`s were designed for this), file uploads on forms.
- API v1.1: automatic webhook verification handshake, per-key rate limiting, hosted API docs page, workspace/task endpoints, service-user keys.
- Marketplace depth: install with sample data, template versioning, ratings UI (`template_reviews` exists), public publishing flow.
- XLSX import/export (SheetJS) + background jobs for large files; org backup export.

## Phase 13 — Integrations & billing

> **Status: Phase 13a shipped** (migration 38): billing plans (free/team/business/enterprise) with enforced limits — users, items, storage, automations/month via DB triggers + bounded counts; usage dashboard + upgrade UI on the org page; Stripe Checkout + signature-verified webhook (env-gated, manual set-plan fallback for dev; Covantia org grandfathered to business); chat_message action posting to Slack/Teams incoming webhooks; external file links (Drive/Dropbox/OneDrive URLs) attachable to items; plan-based retention cron (runs, webhook deliveries, item revisions, daily 03:30 UTC); Zapier/Make/Stripe recipes on /developers.
>
> **Phase 13b shipped** (migration 40): Twilio SMS — `send_sms` action queues `outbound_sms`, cron pings the `sms-worker` edge function (deployed; form-encoded Twilio API + Basic auth, which pg_net can't do), env-gated via Vault `sms_worker_url`/`sms_worker_token` + edge secrets `TWILIO_*`/`SMS_WORKER_TOKEN` (docs/SMS.md); OAuth file pickers on item detail — Google Picker, Dropbox Chooser, OneDrive picker (client-side SDKs, links stored as external `files` rows; env-gated per provider, see .env.local.example); hard SSO enforcement — `hook_password_verification` + `hook_before_user_created` Auth Hook functions (must be enabled by hand in Dashboard → Auth → Hooks, docs/SSO.md); IdP group→role mapping — `security_settings.sso_group_roles` editor on the org page, `claim_sso_membership()` applies it authoritatively each login (owners never touched). Remaining in Phase 13: calendar push sync.

- File pickers: Google Drive, OneDrive, Dropbox (attach as external files).
- Calendar sync out (ICS from Phase 10 → push integration), Slack/Teams notification channel (webhook consumer recipes), Zapier/Make templates over the public API, Twilio SMS action.
- **Billing**: Stripe subscriptions mapped to `organizations.billing_plan`; plan-gated limits (users, items, storage, automations/month) enforced by the existing limit checks; upgrade UI. (Free/Team/Business/Enterprise from spec §19.)
- Hard SSO enforcement via Supabase Auth Hook; IdP group → role mapping.
- Retention policies: revision pruning + file cleanup by plan (cron).

## Phase 14 — Differentiators (spec §23)

> **Status: AI app builder shipped** (migration 39): describe a workflow → Claude generates a definition (app/fields/views/automations with external_id refs) → preview → ai_install_app() installs it and keeps a private template as provenance. Workspace page: /org/:org/:ws/ai-builder (needs ANTHROPIC_API_KEY).
>
> **Phase 14 shipped** (migration 41): calendar sync out — Add to Google/Outlook/Apple-webcal subscribe buttons on /calendar (closes Phase 13); AI formula builder (/api/ai/formula + ✨ button in both builders' calculation config) and AI automation suggestions (/api/ai/suggest-automations + suggestion panels on the automations page), both ANTHROPIC_API_KEY-gated; white-label portals v1 — organizations.branding jsonb + BrandingSection on the org page, public /portal/:orgSlug (portal_lookup RPC, my_shared_items for signed-in guests), PORTAL_DOMAINS env-gated custom-domain rewrite (docs/PORTALS.md); relationship map — /org/:org/:ws/map server-rendered SVG of app-to-app links; template installs now create definition automations (shared install_definition_automations; ai_install_app deduped); 4 industry starter packs seeded public (Recruiting, Client Onboarding, Field Service, Purchase Approvals — with sample items + automations); PWA depth — sw.js (offline fallback, cache strategy, push display), /offline, create-mode item drafts in localStorage with restore bar, 📷 camera capture on image fields, push_subscriptions + pushed_at + push-worker edge function (deployed; VAPID env-gated, docs/PWA.md). Remaining in Phase 14: none — differentiator backlog moves to spec §23 wishlist (AI dashboards, offline queue for edits).
>
> **Phase 14.5 shipped (UI convergence, core journey)**: Podio design language applied per the `podio-design` skill (source: docs/design/podio-design-skill/). Foundation: `podio` color family in tailwind.config.ts, Source Sans 3 via next/font, page bg `podio-page`. Converted: org shell (grey-teal global top bar + restyled workspace sidebar), shared AppTabBar (icon-over-label tabs, active = white card) on workspace + app pages, app page rebuilt as Podio two-zone body (white left views pane with teal app title + view rows, toolbar with orange active-layout pill + teal Add button, sheet with row numbers/pastel option-color chips, card/board/calendar restyles), item detail, tasks, calendar, notifications, home, login. Core-journey files verified free of legacy blue; still-blue elsewhere (builders, settings, marketplace, developers) converges page-by-page as touched — the skill triggers automatically on any podio-clone UI work.

- **AI app builder**: describe a workflow in chat → generated app + fields + views + automations (Claude API; the `app_templates.definition` format is the generation target — this is why it's JSON).
- AI formula builder for calculation fields; AI workflow suggestions.
- White-label client portals (custom domain + logo per org, guest-facing views).
- Better relationship diagrams, approval-flow templates, industry starter packs seeded into the public marketplace.
- Mobile: real service worker (offline drafts), push notifications, camera capture into image fields.

---

## Cross-cutting debt to schedule alongside (not a phase)

- **UI/permission polish**: hide controls light/guest members can't use (backend enforces; UI still shows buttons that fail).
- Generated TypeScript types (`supabase gen types --schema podio`) replacing the `as any` casts accumulated across pages.
- Error toasts + optimistic updates instead of full `router.refresh()` round-trips.
- Test suite: pgTAP for RLS policies (highest value per line of test code in this codebase), Playwright happy paths.
- Tighten `user_profiles` visibility to shared-org members before multi-org production use.

## Suggested order

8 → 9 → 10 → 11 → 12 → 13 → 14. Phases 8–10 make existing surface spec-complete (roughly one session each per phase half, as before). Phase 11 is the production-readiness gate. Phases 12+ are expansion. The AI builder (14) can be pulled forward any time after 8 — it only depends on the template format, which is stable.
