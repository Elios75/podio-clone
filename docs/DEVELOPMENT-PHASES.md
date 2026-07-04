# Podio Clone — Development Phases

Stack: Next.js (App Router) + Tailwind + shadcn/ui + Supabase (Postgres, Auth, Storage, Realtime, Edge Functions). All database objects live in the isolated `podio` schema — completely separate from any other project sharing the Supabase instance.

A note on the architecture you now have: the schema uses a **hybrid EAV model**. Instead of one Postgres column per user-defined field (which would require `ALTER TABLE` every time a user edits an app), every field value is a row in `item_field_values` with a `jsonb` source of truth plus typed shadow columns (`value_text`, `value_number`, `value_date`, `ref_item_id`) that carry indexes. This is the pattern Airtable, Podio, and Notion all use in some form — it's what makes a "no-code database" possible without dynamic DDL.

---

## Phase 0 — Project setup (week 1)

- Create Next.js app (`create-next-app`, TypeScript, Tailwind), add shadcn/ui.
- Wire Supabase client (`@supabase/ssr`) with the `podio` schema: `createClient(url, key, { db: { schema: 'podio' } })`.
- Expose the `podio` schema to the API: Supabase Dashboard → Settings → API → "Exposed schemas" → add `podio`.
- Generate TypeScript types from the schema (`supabase gen types --schema podio`).
- Auth: email/password + magic link sign-in, `user_profiles` upsert on first login.
- CI: GitHub Actions running typecheck, lint, and `supabase db diff` drift check.
- Create the `podio-files` Storage bucket (private) with a path convention `org_id/workspace_id/file_id`.

Exit criteria: deployed skeleton on Vercel, login works, types generated.

## Phase 1 — Tenancy shell (weeks 2–3)

- Organization create/join flow (first member auto-becomes `owner` — the RLS bootstrap policy already allows this).
- Workspace CRUD: name, slug, icon, color, privacy (open/private), auto-join, archive/restore.
- Member management UIs: org user-management page (roles, remove, promote) and workspace member list.
- Navigation chrome: org switcher, workspace sidebar, breadcrumbs.

Exit criteria: two test users can share an org, join an open workspace, and see only what RLS allows.

## Phase 2 — App builder + items (weeks 4–7) ← the heart of the product

- App builder: drag-and-drop field list (dnd-kit), field type picker, per-field config panel (required, help text, hidden, defaults, options with colors, related app).
- Field types in order of value: text, category, date, number, contact/member, relationship, money, progress, phone, email, link, image, file, duration, location, calculation (read-only display first), separator.
- Publish flow: writing `app_fields` + snapshot to `app_schema_revisions`, warning when editing fields with existing data.
- Item CRUD: form renderer driven by field schema; writes go to `items` + `item_field_values` (and `item_relationships` for relationship fields) in one RPC or transaction.
- Item detail page: field values, activity timeline, comments, files, tasks, related items, followers.
- Item revisions: diff each save into `item_revisions`.

Exit criteria: a non-technical user can build a CRM app and enter leads without touching code.

## Phase 3 — Views and layouts (weeks 8–10)

- Table layout (TanStack Table): sort, show/hide/resize/reorder/pin columns, inline edit.
- Filter/sort/group builder writing to `app_views` (filters as jsonb — one translator function converts a view's filter jsonb into a Supabase query against `item_field_values`).
- Kanban layout (dnd-kit) keyed on a category field; drag = update field value.
- Calendar layout (FullCalendar) keyed on date fields; personal + workspace calendars including task due dates.
- Badge and stream (activity-sorted) layouts.
- Saved views: team vs private, default view, ordering, last-used memory (localStorage).

Exit criteria: same app data usable as spreadsheet, board, and calendar.

## Phase 4 — Collaboration (weeks 11–13)

- Comments with TipTap rich text, @mention autocomplete (writes `mentions`), reactions, edit/delete, file attachments.
- Activity events: emit from a single helper on every mutation; home feed + workspace feed + item feed with filters.
- Notifications: fan-out on mention/assignment/comment/follow (Postgres trigger or Edge Function), notification center, mark read, email digest via scheduled Edge Function (`pg_cron` is already installed on this instance).
- Realtime: Supabase Realtime channels per workspace for live feed/comment updates.
- Tasks: my-tasks list, item-attached tasks, due dates, reminders, personal color-coded labels, repeating tasks (materialize next occurrence on completion).
- Files: upload to Storage, attach to items/tasks/comments, previews, versioning (`previous_version_id`).

Exit criteria: two users collaborating on an item see each other's comments live and get notified.

## Phase 5 — Intake + simple automations (weeks 14–16)

- Webforms: public form page rendered from `webforms.field_ids`, submissions handled by an Edge Function using the service role (RLS stays closed to anon), captcha, redirect/success message, embed snippet, URL-parameter prefill via field `external_id`.
- Simple automation engine: when/then rules from `automations` (kind='simple'). Run via a database trigger enqueueing `automation_runs` + a worker Edge Function that executes actions (update field, create task, create item, comment, notify, send email via Resend).
- Search: global search across `items`, `tasks`, `comments`, `files`, `messages` using the tsvector columns already in place; permissions come free because search queries run under RLS.
- CSV/XLSX import (create `import_jobs`, process in Edge Function with field mapping + row validation) and view export (`export_jobs`).

Exit criteria: an external lead-capture form creates items that trigger an automation that assigns a task.

## Phase 6 — Advanced platform (months 5–6)

- Advanced workflow builder: visual multi-step flows (React Flow), branches, delays, loops over related items, HTTP action, PDF generation, run history + test mode (schema: `automations.definition`, `automation_revisions`, `automation_runs`).
- Email-to-app: inbound address per app (Resend/Postmark inbound webhooks → `inbound_emails` → parser → item).
- Dashboards/reports: tile-based workspace dashboards, count/sum/avg reports, charts (Recharts).
- Guest sharing: single-item invitations via `item_shares` (RLS already enforces it), read-only app sharing.
- Public REST API (Next.js route handlers authenticated by `api_keys` hash) + webhooks with verification, retries (`webhook_deliveries.next_retry_at`), and delivery logs.
- Template marketplace: save app as template (`app_templates.definition`), install into workspace, categories, reviews.
- Mobile PWA pass: responsive layouts, push notifications, camera capture.

## Phase 7 — Enterprise (months 7+)

- SSO/SAML (Supabase Auth SAML), audit log UI, retention policies for revisions/files.
- Granular permission matrix (upgrade the baseline RLS policies to respect `light`/`external`/`guest` role restrictions and app-level `permissions` jsonb).
- Chat/messaging UI on `conversations`/`messages` (schema already present).
- Integrations: Google Drive/OneDrive file pickers, Zapier/Make/n8n, Twilio SMS, e-signature.
- AI differentiators: describe-a-workflow → generated app + fields + views; AI formula builder for calculation fields.

---

## Design limits (baseline, from Podio's published limits — improve where cheap)

Items per app: target millions (indexes in place); fields per app: 200; category options: 500; private views per user: 100; import/export: background jobs, no hard row cap; revisions: retention policy per plan.

## Key technical risks to tackle early

1. **View-filter → SQL translation** over EAV (Phase 3) — prototype in week 1 of Phase 3; it dictates whether saved views stay fast.
2. **Calculation fields** across related items — start read-only, computed in an Edge Function on write, stored as a normal field value.
3. **RLS performance** — helper functions are `security definer` + `stable` so Postgres caches them per statement; add `explain analyze` checks to CI when item counts grow.
