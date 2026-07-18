import {
  Callout,
  CodeBlock,
  EndpointTable,
  InlineCode,
  PageHeader,
  SectionHeading,
  TryIt,
} from "../_components/docs";

const EVENTS: { name: string; fires: string }[] = [
  { name: "item.create", fires: "an item is created in the hooked app" },
  { name: "item.update", fires: "any field on an item changes (field-level hooks narrow this to one field)" },
  { name: "item.delete", fires: "an item is deleted" },
  { name: "comment.create", fires: "a comment is posted on an item" },
  { name: "comment.delete", fires: "a comment is removed" },
  { name: "file.change", fires: "a file is attached, replaced or removed" },
  { name: "app.update", fires: "the app's fields or settings change" },
  { name: "app.delete", fires: "the app is deleted" },
  { name: "form.create / form.update / form.delete", fires: "a webform is created, changed or removed" },
  { name: "space.member.add", fires: "a member joins the hooked workspace" },
  { name: "space.member.remove", fires: "a member leaves the hooked workspace" },
  { name: "hook.verify", fires: "the hook is created — carries the verification code (see handshake)" },
];

export default function HooksDocsPage() {
  return (
    <div>
      <PageHeader
        title="Hooks & Webhooks"
        lede={
          <>
            Hooks push JSON to your URL when things change — the alternative to
            polling. Hooks attach at three levels:{" "}
            <strong>app</strong> (all events in an app),{" "}
            <strong>field</strong> (only when one specific field changes), or{" "}
            <strong>space</strong> (workspace-level events like membership). A
            hook delivers nothing until you complete the verification handshake.
          </>
        }
      />

      <SectionHeading id="endpoints">Hooks API</SectionHeading>
      <div className="mt-4">
        <EndpointTable
          rows={[
            {
              method: "GET",
              path: "/api/v1/hooks",
              params: "ref_type? (app | app_field | space), ref_id?",
              response: '{ "hooks": [ { "id", "url", "type", "status" } ] }',
            },
            {
              method: "POST",
              path: "/api/v1/hooks",
              params:
                '{ "url", "type": "<event>", "ref_type": "app" | "app_field" | "space", "ref_id" }',
              response: '201 — { "id", "status": "inactive" } (until verified)',
            },
            {
              method: "DELETE",
              path: "/api/v1/hooks/{id}",
              params: "—",
              response: "204",
            },
            {
              method: "POST",
              path: "/api/v1/hooks/{id}/verify",
              params: "— (re-sends the hook.verify delivery to your URL)",
              response: '{ "status": "verification_sent" }',
            },
            {
              method: "POST",
              path: "/api/v1/hooks/{id}/verify/validate",
              params: '{ "code": "<code from the hook.verify delivery>" }',
              response: '{ "id", "status": "active" }',
            },
            {
              method: "GET",
              path: "/api/v1/hooks/{id}/deliveries",
              params: "limit?, offset?",
              response:
                '{ "deliveries": [ { "id", "event", "response_status", "attempts", "delivered_at" } ] }',
            },
          ]}
        />
      </div>

      <SectionHeading id="handshake">The verification handshake</SectionHeading>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-podio-secondary">
        <li>
          You <InlineCode>POST /api/v1/hooks</InlineCode>. The hook is created{" "}
          <InlineCode>inactive</InlineCode>.
        </li>
        <li>
          Your URL immediately receives a{" "}
          <InlineCode>hook.verify</InlineCode> POST containing a{" "}
          <InlineCode>code</InlineCode>.
        </li>
        <li>
          Echo the code back with{" "}
          <InlineCode>POST /api/v1/hooks/{"{id}"}/verify/validate</InlineCode>.
          The hook flips to <InlineCode>active</InlineCode> and starts delivering.
        </li>
        <li>
          Missed the delivery? <InlineCode>POST /api/v1/hooks/{"{id}"}/verify</InlineCode>{" "}
          re-sends it.
        </li>
      </ol>
      <TryIt
        request={`# 1. Create the hook
curl -X POST "$BASE_URL/api/v1/hooks" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "url": "https://yourapp.example/hook", "type": "item.create", "ref_type": "app", "ref_id": "APP_ID" }'

# 2. Your endpoint receives:
#    POST https://yourapp.example/hook
#    { "type": "hook.verify", "hook_id": "h_123", "code": "8c41f0…" }

# 3. Validate the code
curl -X POST "$BASE_URL/api/v1/hooks/h_123/verify/validate" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "code": "8c41f0…" }'`}
        response={`{ "id": "h_123", "status": "active" }`}
      />

      <SectionHeading id="events">Event types</SectionHeading>
      <div className="mt-4 overflow-x-auto rounded border border-podio-border">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-podio-row-alt text-xs font-semibold uppercase tracking-wide text-podio-secondary">
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Fires when</th>
            </tr>
          </thead>
          <tbody className="text-[13px] text-podio-secondary">
            {EVENTS.map((e) => (
              <tr key={e.name} className="border-t border-podio-border">
                <td className="px-3 py-2 whitespace-nowrap">
                  <code className="text-podio-ink">{e.name}</code>
                </td>
                <td className="px-3 py-2">{e.fires}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        Field-level hooks: set <InlineCode>ref_type: &quot;app_field&quot;</InlineCode>{" "}
        with the field&apos;s id to receive <InlineCode>item.update</InlineCode> only
        when that field changes. Space-level hooks (
        <InlineCode>ref_type: &quot;space&quot;</InlineCode>) receive membership and
        app lifecycle events for a workspace.
      </p>
      <CodeBlock label="Example delivery payload">{`POST https://yourapp.example/hook
Content-Type: application/json

{
  "type": "item.update",
  "hook_id": "h_123",
  "app_id": "APP_ID",
  "item_id": "9f2e…",
  "changed_fields": ["status"],
  "occurred_at": "2026-07-17T14:03:22Z"
}`}</CodeBlock>

      <SectionHeading id="deliveries">Deliveries, retries & signatures</SectionHeading>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-podio-secondary">
        <li>
          Respond <InlineCode>2xx</InlineCode> quickly (under 5s); do slow work
          async. Non-2xx responses retry with exponential backoff, up to{" "}
          <strong className="text-podio-ink">5 attempts</strong>.
        </li>
        <li>
          Inspect what was sent — and whether your endpoint accepted it — with{" "}
          <InlineCode>GET /api/v1/hooks/{"{id}"}/deliveries</InlineCode>.
        </li>
        <li>
          Organization-level webhooks (Settings → Webhooks) additionally sign
          each delivery: <InlineCode>X-Webhook-Signature</InlineCode> is the
          HMAC-SHA256 of the raw body with your webhook secret — verify it
          before trusting the payload. Legacy org webhooks verify by token echo:
          the <InlineCode>hook.verify</InlineCode> delivery carries a{" "}
          <InlineCode>verify_token</InlineCode>, which you POST to{" "}
          <InlineCode>/api/v1/webhooks/verify</InlineCode> as{" "}
          <InlineCode>{'{ "token": "…" }'}</InlineCode> (GET{" "}
          <InlineCode>?token=…</InlineCode> also works).
        </li>
      </ul>

      <SectionHeading id="inbound">Inbound webhooks (trigger an automation)</SectionHeading>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        The reverse direction: external systems (Zapier, Make, your own cron)
        can trigger a Podio Clone automation by POSTing to its inbound-webhook
        URL. Create an automation with the &quot;Inbound webhook received&quot; trigger
        and copy its URL — the token is the credential, no API key needed.
      </p>
      <TryIt
        request={`curl -X POST "$BASE_URL/api/hooks/AUTOMATION_ID?token=WEBHOOK_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "values": { "title": "Created from outside" }, "item_id": null }'`}
        response={`{ "ok": true, "automation_id": "AUTOMATION_ID", "triggered": true }`}
      />
      <p className="mt-3 text-[13px] text-podio-meta">
        The token may also be sent as <code>_token</code> in the JSON body
        instead of the query string.
      </p>

      <Callout title="Hooks instead of polling">
        A hook on <InlineCode>item.create</InlineCode> +{" "}
        <InlineCode>item.update</InlineCode> replaces a poll loop entirely, costs
        zero rate-limit budget, and tells you <em>which</em> fields changed. If
        you must reconcile, poll rarely (hourly) and let hooks carry the
        real-time signal.
      </Callout>
    </div>
  );
}
