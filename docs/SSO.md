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

`mapping.json` (adjust attribute names to your IdP):

```json
{ "keys": { "email": { "name": "email" }, "name": { "name": "displayName" } } }
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

## Known limitations (by design, for now)

- **"Require SSO" is app-level enforcement.** The login UI blocks password
  auth for enforced domains, but a determined user could hit the Supabase Auth
  API directly. Hard enforcement requires a Supabase Auth Hook
  (before-sign-in) rejecting password grants for enforced domains — add when
  moving to production SSO.
- Auto-provisioned users get org role `employee`; group/role mapping from IdP
  attributes is a future enhancement.
- One SSO domain per organization.
