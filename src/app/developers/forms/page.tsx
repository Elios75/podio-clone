import {
  Callout,
  CodeBlock,
  EndpointTable,
  InlineCode,
  PageHeader,
  SectionHeading,
  TryIt,
} from "../_components/docs";

export default function FormsDocsPage() {
  return (
    <div>
      <PageHeader
        title="Forms, Files & Export"
        lede={
          <>
            Public webforms feed submissions into an app without exposing an API
            key. Alongside them: item PDF rendering, tokenized iCalendar feeds,
            inbound email-to-item, and export patterns for getting your data out
            as XLSX.
          </>
        }
      />

      <SectionHeading id="forms">Webforms</SectionHeading>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        Each webform has a public slug. Submissions create an item in the form&apos;s
        app and fire <InlineCode>form_submitted</InlineCode> events (and any
        hooks/flows listening for item creation). No API key is required — the
        slug is public; optional Cloudflare Turnstile captcha protects against
        bots when <InlineCode>TURNSTILE_SECRET_KEY</InlineCode> is configured.
      </p>
      <div className="mt-4">
        <EndpointTable
          rows={[
            {
              method: "POST",
              path: "/api/forms/submit",
              params:
                '{ "slug", "values": { "<external-id>": <value> }, "email"?, "captcha_token"? }',
              response: '{ "item_id" } — 400 with { "error" } on captcha/validation failure',
            },
          ]}
        />
      </div>
      <TryIt
        request={`curl -X POST "$BASE_URL/api/forms/submit" \\
  -H "Content-Type: application/json" \\
  -d '{
    "slug": "contact-us",
    "values": { "name": "Dana", "message": "Interested in a demo" },
    "email": "dana@example.com"
  }'`}
        response={`{ "item_id": "d4a1…" }`}
      />

      <SectionHeading id="files">Files & feeds</SectionHeading>
      <div className="mt-4">
        <EndpointTable
          rows={[
            {
              method: "GET",
              path: "/api/pdf/{itemId}",
              params: "— (auth: session cookie; RLS decides visibility)",
              response: "application/pdf — the item rendered as a PDF document",
            },
            {
              method: "GET",
              path: "/api/ics/{token}",
              params: "— (the token in the URL is the credential)",
              response:
                "text/calendar — iCalendar feed; subscribe from Google Calendar / Outlook",
            },
            {
              method: "POST",
              path: "/api/inbound-email?secret=…",
              params:
                "provider payload (Resend, Postmark, SendGrid inbound parse); secured by INBOUND_EMAIL_SECRET",
              response: "JSON result of email-to-item processing",
            },
          ]}
        />
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        The PDF endpoint uses your browser session, so it&apos;s ideal for
        &quot;Download as PDF&quot; links inside the app rather than server-to-server use.
        The ICS token comes from the in-app calendar&apos;s &quot;Subscribe&quot; action —
        treat the URL as a secret.
      </p>

      <SectionHeading id="export">Export to XLSX</SectionHeading>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        In the app, any sheet view exports directly via the Export button
        (app tools menu). Programmatically, export = paginate the items API and
        write a workbook yourself — see the{" "}
        <a href="/developers/tutorials#xlsx" className="text-podio-teal hover:underline">
          Export to XLSX tutorial
        </a>{" "}
        for a complete script. The core loop:
      </p>
      <CodeBlock>{`# Page through all items (100 at a time)
offset=0
while : ; do
  curl -s "$BASE_URL/api/v1/apps/APP_ID/items?limit=100&offset=$offset" \\
    -H "Authorization: Bearer $PODIO_CLONE_KEY" > "page-$offset.json"
  count=$(jq '.items | length' "page-$offset.json")
  [ "$count" -lt 100 ] && break
  offset=$((offset + 100))
done`}</CodeBlock>

      <Callout title="CSV in, XLSX out">
        Going the other way? The in-app &quot;New app from CSV&quot; tool builds an app
        (fields inferred from headers) and imports rows in one step — usually
        faster than scripting <InlineCode>POST /items</InlineCode> for an initial
        migration.
      </Callout>
    </div>
  );
}
