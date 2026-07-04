# SSO / SAML Setup

The app-side groundwork is complete: domain-based login routing, auto-provisioning, and org settings. Going live requires registering your identity provider with Supabase Auth — configuration, not code.

## Prerequisites

- **Supabase Pro plan or above** — SAML SSO is not available on the free tier.
- An identity provider (Okta, Azure AD/Entra, Google Workspace, OneLogin…).

## 1. Enable SAML on the project

```bash
supabase sso add --project-ref <ref> \
  --type saml \
  --metadata-url "https://<your-idp>/metadata.xml" \
  --domains company.com \
  --attribute-mapping-file mapping.json
```

`mapping.json` (adjust attribute names to your IdP). Include a `groups` key if
you want IdP group → role mapping (Phase 13b):

```json
{
  "keys": {
    "email": { "name": "email" },
    "name": { "name": "displayName" },
    "groups": { "name": "groups" }
  }
}
```

`supabase sso list` shows registered providers; `supabase sso info` gives the
values the IdP needs.

## 2. Configure the IdP

Create a SAML app in your IdP with:
- **ACS URL:** `https://<project-ref>.supabase.co/auth/v1/sso/saml/acs`
- **Entity ID:** `https://<project-ref>.supabase.co/auth/v1/sso/saml/metadata`
- Assign the users/groups who should have access.

## 3. Configure the organization (in-app)

Org page → **Single sign-on (SAML)** → set the email domain (e.g. `company.com`)
and optionally check **Require SSO**. This drives:

- The login page's "Continue with SSO" routing (`sso_domain_lookup` RPC).
- Auto-provisioning: on first login, `claim_sso_membership()` adds the user to
  every org whose `sso_domain` matches their email domain, as `employee`, and
  claims any pending single-item guest shares addressed to their email.

## Flow

1. User enters `alice@company.com` on the login page → "Continue with SSO".
2. `sso_domain_lookup` confirms the domain is configured → `signInWithSSO({ domain })`.
3. Supabase redirects to the IdP; SAML assertion comes back; session issued.
4. First `/home` load runs `claim_sso_membership()` → org membership appears.

## 4. Hard enforcement (Phase 13b — Auth Hooks)

Migration 40 ships two hook functions that reject password auth at the API
level (not just in the login UI) for domains with **Require SSO** checked:

- `podio.hook_password_verification` — rejects password sign-in.
- `podio.hook_before_user_created` — rejects password sign-up.

They exist in the database but are inert until **enabled** in
Dashboard → Authentication → Hooks (Postgres function type):

- *Password verification attempt* → `podio.hook_password_verification`
- *Before user created* → `podio.hook_before_user_created`

Non-SSO domains are unaffected (`decision: continue`).

## 5. IdP group → role mapping (Phase 13b)

Org page → **Single sign-on (SAML)** → *IdP group → role mapping*. Stored as
`security_settings.sso_group_roles`, e.g.
`{ "Engineering Admins": "admin", "Contractors": "light" }`.

On every SSO login, `claim_sso_membership()` reads groups from
`raw_user_meta_data.groups` (or `.custom_claims.groups` — see the attribute
mapping above), resolves the highest-ranked matching role
(`admin > employee > light > guest`), and applies it:

- New users join with the mapped role (or `employee` if no group matches).
- Existing members are re-synced — the IdP is authoritative, except `owner`,
  which is never changed.

## Known limitations (by design, for now)

- One SSO domain per organization.
- Hooks must be enabled by hand in the dashboard (Supabase has no SQL/CLI
  surface for it on this plan).
