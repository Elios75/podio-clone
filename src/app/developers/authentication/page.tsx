import {
  Callout,
  CodeBlock,
  EndpointTable,
  InlineCode,
  PageHeader,
  SectionHeading,
  TryIt,
} from "../_components/docs";

export default function AuthenticationDocsPage() {
  return (
    <div>
      <PageHeader
        title="Authentication"
        lede={
          <>
            Two ways in: long-lived <strong>API keys</strong> for scripts and
            server-to-server integrations, or <strong>OAuth2</strong> for apps
            acting on behalf of a user. Both produce a bearer token accepted by
            every <InlineCode>/api/v1</InlineCode> endpoint.
          </>
        }
      />

      <SectionHeading id="api-keys">API keys</SectionHeading>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        Create a key in your organization settings (Settings → API keys). Keys
        carry scopes: <InlineCode>read</InlineCode> and{" "}
        <InlineCode>write</InlineCode>. Write endpoints (POST/PUT/DELETE) require
        the write scope. Send the key as a bearer token on every request:
      </p>
      <TryIt
        request={`curl "$BASE_URL/api/v1/workspaces" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY"`}
        response={`{
  "workspaces": [
    { "id": "b1f0…", "name": "Projects", "slug": "projects", "app_count": 4 }
  ]
}`}
      />

      <SectionHeading id="oauth2">OAuth2</SectionHeading>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        Register an OAuth client (client ID + secret) in organization settings.
        The token endpoint supports four grant types; access tokens are used
        exactly like API keys — <InlineCode>Authorization: Bearer …</InlineCode>{" "}
        on any <InlineCode>/api/v1</InlineCode> endpoint.
      </p>
      <div className="mt-4">
        <EndpointTable
          rows={[
            {
              method: "GET",
              path: "/oauth/authorize",
              params:
                "client_id, redirect_uri, response_type=code, state, scope? — renders the user consent screen",
              response: "302 redirect to redirect_uri with ?code=…&state=…",
            },
            {
              method: "POST",
              path: "/api/oauth/token",
              params:
                "grant_type: authorization_code | refresh_token | app | password, plus grant-specific fields (see below)",
              response:
                '{ "access_token", "token_type": "bearer", "expires_in", "refresh_token" }',
            },
          ]}
        />
      </div>

      <h3 className="mt-8 text-[16px] font-semibold text-podio-ink">
        Grant types
      </h3>
      <div className="mt-3 space-y-2 text-[15px] leading-relaxed text-podio-secondary">
        <p>
          <strong className="text-podio-ink">authorization_code</strong> — the
          standard web flow. Send the user to{" "}
          <InlineCode>/oauth/authorize</InlineCode>; after consent you receive a{" "}
          <InlineCode>code</InlineCode> on your redirect URI and exchange it:
        </p>
      </div>
      <TryIt
        request={`curl -X POST "$BASE_URL/api/oauth/token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "authorization_code",
    "client_id": "your_client_id",
    "client_secret": "your_client_secret",
    "code": "the_code_from_redirect",
    "redirect_uri": "https://yourapp.example/callback"
  }'`}
        response={`{
  "access_token": "at_…",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "rt_…"
}`}
      />
      <div className="mt-5 space-y-2 text-[15px] leading-relaxed text-podio-secondary">
        <p>
          <strong className="text-podio-ink">refresh_token</strong> — exchange a
          refresh token for a new access token when the old one expires. Refresh
          tokens rotate: each refresh response contains a <em>new</em>{" "}
          refresh token and invalidates the old one — always persist the latest
          pair.
        </p>
      </div>
      <CodeBlock>{`curl -X POST "$BASE_URL/api/oauth/token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "refresh_token",
    "client_id": "your_client_id",
    "client_secret": "your_client_secret",
    "refresh_token": "rt_…"
  }'`}</CodeBlock>
      <div className="mt-5 space-y-2 text-[15px] leading-relaxed text-podio-secondary">
        <p>
          <strong className="text-podio-ink">app</strong> — server-to-server
          access scoped to a single app (the equivalent of Podio&apos;s app
          authentication). Use the app&apos;s ID and its app token from the app&apos;s
          developer settings:
        </p>
      </div>
      <CodeBlock>{`curl -X POST "$BASE_URL/api/oauth/token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "app",
    "client_id": "your_client_id",
    "client_secret": "your_client_secret",
    "app_id": "APP_ID",
    "app_token": "APP_TOKEN"
  }'`}</CodeBlock>
      <div className="mt-5 space-y-2 text-[15px] leading-relaxed text-podio-secondary">
        <p>
          <strong className="text-podio-ink">password</strong> — resource-owner
          credentials for trusted first-party tooling only. Avoid it in anything
          user-facing; prefer the authorization-code flow.
        </p>
      </div>
      <CodeBlock>{`curl -X POST "$BASE_URL/api/oauth/token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "password",
    "client_id": "your_client_id",
    "client_secret": "your_client_secret",
    "username": "user@example.com",
    "password": "…"
  }'`}</CodeBlock>

      <Callout title="Refresh-token rotation">
        Refresh tokens are single-use. When you call the token endpoint with{" "}
        <InlineCode>grant_type: refresh_token</InlineCode>, store the returned{" "}
        <InlineCode>refresh_token</InlineCode> before discarding the old one, and
        serialize refreshes (one at a time per user) so concurrent workers do not
        race and strand a valid token. A <InlineCode>401</InlineCode> with an
        expired access token means &quot;refresh and retry once&quot; — not
        &quot;retry in a loop&quot;.
      </Callout>

      <SectionHeading id="rate-limits">Rate limits</SectionHeading>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        Each key or token allows <strong className="text-podio-ink">60 requests
        per minute</strong> by default (fixed one-minute windows). Exceeding the
        limit returns <InlineCode>429</InlineCode> with an explanatory message.
        Contact your org admin to raise a key&apos;s limit. Responses include:
      </p>
      <div className="mt-3 overflow-x-auto rounded border border-podio-border">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-podio-row-alt text-xs font-semibold uppercase tracking-wide text-podio-secondary">
              <th className="px-3 py-2">Header</th>
              <th className="px-3 py-2">Meaning</th>
            </tr>
          </thead>
          <tbody className="text-[13px] text-podio-secondary">
            <tr className="border-t border-podio-border">
              <td className="px-3 py-2"><code>X-RateLimit-Limit</code></td>
              <td className="px-3 py-2">Requests allowed per window for this key.</td>
            </tr>
            <tr className="border-t border-podio-border">
              <td className="px-3 py-2"><code>X-RateLimit-Remaining</code></td>
              <td className="px-3 py-2">Requests left in the current window.</td>
            </tr>
            <tr className="border-t border-podio-border">
              <td className="px-3 py-2"><code>Retry-After</code></td>
              <td className="px-3 py-2">Seconds until the window resets (sent with 429).</td>
            </tr>
          </tbody>
        </table>
      </div>
      <CodeBlock label="429 response">{`HTTP/1.1 429 Too Many Requests
Retry-After: 21

{ "error": "rate limit exceeded — 60 requests/minute" }`}</CodeBlock>
    </div>
  );
}
