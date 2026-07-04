# White-label client portals (v1, Phase 14)

A branded, public landing page per organization where external guests see the
items that have been shared with them (via item shares). Enabled per org from
the org settings page ("Branding & client portal" section); the portal then
lives at `/portal/<org-slug>`.

## How it works

- **Public shell.** `/portal/<org-slug>` is reachable without a session. It
  calls the anon-granted RPC `podio.portal_lookup(p_slug)`, which returns the
  org's branding only when `portal_enabled` is true (otherwise the page 404s).
- **Signed-in guests.** If the visitor has a session, the page calls
  `podio.my_shared_items()` and lists every non-revoked item share for that
  user, linking into the normal item pages. Anonymous visitors get a
  "Sign in" button pointing at `/login`.

## Branding fields

Stored on `organizations`:

| Field | Where | Meaning |
|---|---|---|
| `logo_url` | column | Logo shown in the portal header (h-8) and org UI |
| `branding.portal_enabled` | jsonb | Master switch; portal 404s when false |
| `branding.accent` | jsonb | Header/button color, defaults to `#15808D` |
| `branding.portal_title` | jsonb | Header title, defaults to `<Org> Portal` |
| `branding.welcome` | jsonb | Intro text shown above the shared-items panel |

## Custom domains (`PORTAL_DOMAINS`)

Optional, env-gated mapping from a hostname to an org slug. Set in
`.env.local` (or your deployment's env):

```
PORTAL_DOMAINS={"clients.acme.com":"acme","portal.bluebird.example":"bluebird"}
```

When a request arrives with a matching `Host` header and pathname `/`, the
middleware rewrites it to `/portal/<slug>` — the visitor sees the branded
portal at the bare domain. All other paths on that host behave normally.

To use it, point the custom domain's DNS (or your reverse proxy) at the app
deployment. **Per-org custom domains with TLS certificates are a deployment
concern, not app code** — terminate TLS at your host/proxy (Vercel domain
aliases, Caddy/nginx with ACME, a CDN, etc.) and keep this env var in sync
with whatever hostnames you route in.
