# Phase 7 Plan — Chat, Audit Viewer, SSO/SAML

Sequenced by dependency and risk: chat is pure app code over an existing schema; audit needs a small write-side addition before the viewer makes sense; SSO comes last because it depends on external identity providers and a Supabase plan feature.

---

## 7b. Chat / messaging UI (~1 session)

The schema has been ready since migration 3: `conversations`, `conversation_participants`, `messages`, all with RLS keyed on `is_conversation_participant()`.

**Database (migration 21)**
- `send_message(p_conversation, p_body)` RPC: insert message + notify participants who aren't the sender (notifications require security definer, same pattern as comments) + bump `conversations.updated_at` for list ordering.
- `start_conversation(p_subject, p_participant_ids uuid[])` RPC: conversation + creator + participants atomically (avoids the multi-insert RLS dance).
- Enable realtime: `alter publication supabase_realtime add table podio.messages`.

**UI**
- `/messages` page: two-pane layout — conversation list (subject or participant names, last message preview, unread dot computed from `last_read_at` vs newest message) and thread view with composer.
- New-conversation modal: pick people from `user_profiles` (already globally readable), optional subject, group chats = 2+ participants.
- Mark-read on thread open: update own `conversation_participants.last_read_at`.
- Realtime subscription on `messages` filtered by conversation for live delivery; star/unstar via existing `starred` column.
- Nav: 💬 icon in the org sidebar, mobile top bar, and home header.

**Exit criteria:** two users chat live in a group conversation; unread indicators clear on open.

---

## 7c. Audit log viewer (~half session)

`audit_logs` exists but nothing writes to it yet — so this is write-side first, viewer second.

**Database (migration 22)**
- One generic trigger function `tg_audit()` capturing `TG_TABLE_NAME`, `TG_OP`, actor (`auth.uid()`), row id, and a compact old/new diff into `audit_logs`.
- Attach to the sensitive tables only (audit noise is a real failure mode): `organization_members` (role changes, adds/removals), `workspace_members`, `workspaces` (create/archive/delete), `api_keys`, `webhooks`, `item_shares`, `automations`, `app_templates`.
- Backfill nothing — audit starts at deployment, which is the honest semantic.

**UI**
- `/org/[slug]/audit` page, org admins only (the existing `p_audit_select` RLS policy already returns nothing for others).
- Filters: action type, actor, date range; newest first, paginated (50/page).
- Export current filter to CSV (reuse `lib/csv.ts`).
- Link from the org page next to API keys/webhooks.

**Exit criteria:** changing a member's role produces a visible, exportable audit entry within one refresh.

---

## 7d. SSO/SAML groundwork (~half session of code + external IdP setup)

Supabase Auth handles SAML 2.0 natively (Pro plan or above — flag: verify the project's plan before starting). Our work is routing, provisioning, and admin controls; the IdP handshake is configuration, not code.

**Database (migration 23)**
- Convention: `organizations.security_settings` gains `{ "sso_domain": "acme.com", "enforce_sso": false }`.
- `claim_sso_membership()` RPC: on first SSO login, match the user's email domain against org `sso_domain`s and auto-provision an `organization_members` row (role `employee`); also claim any pending `item_shares` rows matching the email (this fixes guest-share activation for SSO users for free).

**App**
- Login page: "Continue with SSO" path — user enters email, we extract the domain and call `supabase.auth.signInWithSSO({ domain })`; falls back to password if no provider matches. If an org has `enforce_sso`, block password login for emails on that domain.
- Post-login callback calls `claim_sso_membership`.
- Org settings UI (admins): set SSO domain, enforce toggle — writes `security_settings`.

**External (documented in docs/SSO.md, not code)**
- Register the IdP with Supabase CLI: `supabase sso add --type saml --metadata-url <IdP metadata>` with attribute mapping (email, name).
- IdP-side app setup for Okta / Azure AD / Google Workspace with the Supabase ACS URL and entity ID.

**Exit criteria:** a user from the configured domain lands in the right org with `employee` role having never seen a password screen.

---

## Order of operations

1. **7b chat** — most user-visible, zero external dependencies.
2. **7c audit** — small, self-contained, makes 7a's role changes observable.
3. **7d SSO** — code groundwork can merge anytime; the live handshake waits on an IdP and plan check.

After these, remaining Phase 7 backlog: retention policies for revisions/files, UI hiding of controls light members can't use, workflow versioning UI (`automation_revisions` is already populated-ready), and the strategic AI features (describe-a-workflow → generated app).
