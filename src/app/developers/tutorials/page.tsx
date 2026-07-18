import {
  Callout,
  CodeBlock,
  InlineCode,
  PageHeader,
  SectionHeading,
} from "../_components/docs";

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-podio-teal text-xs font-semibold text-white">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-podio-ink">{title}</div>
        <div className="mt-1 text-[15px] leading-relaxed text-podio-secondary">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function TutorialsDocsPage() {
  return (
    <div>
      <PageHeader
        title="Tutorials & SDK patterns"
        lede={
          <>
            Five short walkthroughs, each copy-paste runnable once{" "}
            <InlineCode>$BASE_URL</InlineCode> and{" "}
            <InlineCode>$PODIO_CLONE_KEY</InlineCode> are exported in your shell,
            followed by idiomatic snippets for JavaScript, Python and PowerShell.
          </>
        }
      />

      {/* ------------------------------------------------------------------ */}
      <SectionHeading id="items">1. Create and update items</SectionHeading>
      <Step n={1} title="Find your app and its field external_ids">
        <CodeBlock>{`curl "$BASE_URL/api/v1/apps" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY"`}</CodeBlock>
        Note the app <InlineCode>id</InlineCode> and each field&apos;s{" "}
        <InlineCode>external_id</InlineCode> — values are always keyed by
        external_id.
      </Step>
      <Step n={2} title="Create an item">
        <CodeBlock>{`curl -X POST "$BASE_URL/api/v1/apps/APP_ID/items" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "values": { "title": "Launch website", "status": "in-process" } }'
# => { "id": "9f2e…", "item_number": 42, … }`}</CodeBlock>
      </Step>
      <Step n={3} title="Update one field without resending the rest">
        <CodeBlock>{`curl -X PUT "$BASE_URL/api/v1/items/9f2e…/values/status" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "value": "completed" }'`}</CodeBlock>
      </Step>
      <Step n={4} title="Check the revision trail">
        <CodeBlock>{`curl "$BASE_URL/api/v1/items/9f2e…/revisions" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY"`}</CodeBlock>
        Every update from step 3 appears here; diff and revert are one call away.
      </Step>

      {/* ------------------------------------------------------------------ */}
      <SectionHeading id="hooks">2. Automate with hooks</SectionHeading>
      <Step n={1} title="Stand up a receiver">
        Any HTTPS endpoint that answers 200 quickly. For local testing, expose it
        with a tunnel (ngrok, cloudflared).
      </Step>
      <Step n={2} title="Create the hook">
        <CodeBlock>{`curl -X POST "$BASE_URL/api/v1/hooks" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "url": "https://yourapp.example/hook",
        "type": "item.create", "ref_type": "app", "ref_id": "APP_ID" }'
# => { "id": "h_123", "status": "inactive" }`}</CodeBlock>
      </Step>
      <Step n={3} title="Complete the verification handshake">
        Your receiver immediately gets{" "}
        <InlineCode>{'{ "type": "hook.verify", "code": "8c41f0…" }'}</InlineCode>.
        Echo it back:
        <CodeBlock>{`curl -X POST "$BASE_URL/api/v1/hooks/h_123/verify/validate" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "code": "8c41f0…" }'
# => { "id": "h_123", "status": "active" }`}</CodeBlock>
        No <InlineCode>hook.verify</InlineCode> in your logs? Re-send it with{" "}
        <InlineCode>POST /api/v1/hooks/h_123/verify</InlineCode>.
      </Step>
      <Step n={4} title="Trigger and observe">
        Create an item (tutorial 1, step 2) and watch the delivery arrive. Audit
        with:
        <CodeBlock>{`curl "$BASE_URL/api/v1/hooks/h_123/deliveries" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY"`}</CodeBlock>
        Failed deliveries retry with exponential backoff, up to 5 attempts.
      </Step>

      {/* ------------------------------------------------------------------ */}
      <SectionHeading id="flows">3. Your first flow via API</SectionHeading>
      <Step n={1} title="Discover trigger attributes">
        <CodeBlock>{`curl "$BASE_URL/api/v1/flows/possible-attributes?ref_type=app&ref_id=APP_ID&trigger_type=item.create" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY"
# => { "attributes": [ { "key": "item.title", … }, … ] }`}</CodeBlock>
      </Step>
      <Step n={2} title="Create the flow (inactive by default)">
        <CodeBlock>{`curl -X POST "$BASE_URL/api/v1/flows" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "New project -> kickoff task",
        "ref_type": "app", "ref_id": "APP_ID",
        "trigger": { "type": "item.create" },
        "effects": [ { "type": "task.create",
                       "params": { "title": "Kick off {{item.title}}" } } ] }'
# => { "id": "fl_88…", "status": "inactive" }`}</CodeBlock>
      </Step>
      <Step n={3} title="Activate it">
        <CodeBlock>{`curl -X POST "$BASE_URL/api/v1/flows/fl_88…/activate" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY"`}</CodeBlock>
      </Step>
      <Step n={4} title="Test end-to-end">
        Create an item in the app, then list tasks — the kickoff task is there:
        <CodeBlock>{`curl "$BASE_URL/api/v1/tasks?status=open" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY"`}</CodeBlock>
      </Step>

      {/* ------------------------------------------------------------------ */}
      <SectionHeading id="webforms">4. Collect data with webforms</SectionHeading>
      <Step n={1} title="Create the form in the app">
        In the app&apos;s tools menu, create a webform, choose which fields it
        exposes, and copy its public slug (e.g. <InlineCode>contact-us</InlineCode>).
      </Step>
      <Step n={2} title="Submit from anywhere — no API key">
        <CodeBlock>{`curl -X POST "$BASE_URL/api/forms/submit" \\
  -H "Content-Type: application/json" \\
  -d '{ "slug": "contact-us",
        "values": { "name": "Dana", "message": "Interested in a demo" },
        "email": "dana@example.com" }'
# => { "item_id": "d4a1…" }`}</CodeBlock>
        With captcha enabled, include the Turnstile{" "}
        <InlineCode>captcha_token</InlineCode> from the widget.
      </Step>
      <Step n={3} title="React to submissions">
        Point a hook at <InlineCode>item.create</InlineCode> on the form&apos;s app
        (tutorial 2) or subscribe to <InlineCode>form_submitted</InlineCode>{" "}
        events — each submission is a regular item.
      </Step>

      {/* ------------------------------------------------------------------ */}
      <SectionHeading id="xlsx">5. Export to XLSX</SectionHeading>
      <Step n={1} title="Grab the field schema">
        <CodeBlock>{`curl "$BASE_URL/api/v1/apps" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY" > apps.json`}</CodeBlock>
        The field list gives you column headers in the right order.
      </Step>
      <Step n={2} title="Page through all items">
        <CodeBlock>{`offset=0
while : ; do
  curl -s "$BASE_URL/api/v1/apps/APP_ID/items?limit=100&offset=$offset" \\
    -H "Authorization: Bearer $PODIO_CLONE_KEY" > "page-$offset.json"
  [ "$(jq '.items | length' page-$offset.json)" -lt 100 ] && break
  offset=$((offset + 100))
done`}</CodeBlock>
      </Step>
      <Step n={3} title="Write the workbook (Python + openpyxl)">
        <CodeBlock>{`import glob, json
from openpyxl import Workbook

apps = json.load(open("apps.json"))["apps"]
fields = next(a for a in apps if a["id"] == "APP_ID")["fields"]
cols = [f["external_id"] for f in fields]

wb = Workbook(); ws = wb.active
ws.append([f["label"] for f in fields])
for page in sorted(glob.glob("page-*.json")):
    for item in json.load(open(page))["items"]:
        ws.append([item["values"].get(c, "") for c in cols])
wb.save("export.xlsx")`}</CodeBlock>
        Prefer zero code? Any sheet view has an Export button in the app tools
        menu that produces the same workbook.
      </Step>

      {/* ------------------------------------------------------------------ */}
      <SectionHeading id="sdk">SDK patterns</SectionHeading>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        There is no official SDK — the API is plain JSON over HTTPS, so a
        ten-line helper in your language of choice is the SDK. Auth header + one
        CRUD example each:
      </p>

      <h3 className="mt-6 text-[16px] font-semibold text-podio-ink">
        JavaScript (fetch)
      </h3>
      <CodeBlock>{`const BASE = process.env.BASE_URL;
const KEY = process.env.PODIO_CLONE_KEY;

async function api(path, options = {}) {
  const res = await fetch(\`\${BASE}\${path}\`, {
    ...options,
    headers: {
      Authorization: \`Bearer \${KEY}\`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? 5);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return api(path, options); // one polite retry
  }
  if (!res.ok) throw new Error(\`\${res.status} \${await res.text()}\`);
  return res.status === 204 ? null : res.json();
}

// Create an item
const item = await api("/api/v1/apps/APP_ID/items", {
  method: "POST",
  body: JSON.stringify({ values: { title: "From JS" } }),
});`}</CodeBlock>

      <h3 className="mt-6 text-[16px] font-semibold text-podio-ink">
        Python (requests)
      </h3>
      <CodeBlock>{`import os, time, requests

BASE = os.environ["BASE_URL"]
S = requests.Session()
S.headers["Authorization"] = f"Bearer {os.environ['PODIO_CLONE_KEY']}"

def api(method, path, **kw):
    r = S.request(method, f"{BASE}{path}", **kw)
    if r.status_code == 429:
        time.sleep(int(r.headers.get("Retry-After", 5)))
        r = S.request(method, f"{BASE}{path}", **kw)
    r.raise_for_status()
    return r.json() if r.content else None

# Update an item
api("PUT", "/api/v1/items/ITEM_ID",
    json={"values": {"status": "completed"}})`}</CodeBlock>

      <h3 className="mt-6 text-[16px] font-semibold text-podio-ink">
        PowerShell (Invoke-RestMethod)
      </h3>
      <CodeBlock>{`$headers = @{ Authorization = "Bearer $env:PODIO_CLONE_KEY" }

# List open tasks
Invoke-RestMethod -Uri "$env:BASE_URL/api/v1/tasks?status=open" -Headers $headers

# Create a task
Invoke-RestMethod -Method Post -Uri "$env:BASE_URL/api/v1/tasks" \`
  -Headers $headers -ContentType "application/json" \`
  -Body (@{ title = "From PowerShell"; due_at = "2026-07-25T09:00:00Z" } | ConvertTo-Json)`}</CodeBlock>

      <Callout title="Refresh-token rotation in SDK code">
        If you authenticate via OAuth2 instead of an API key, wrap the helper so
        a <InlineCode>401</InlineCode> triggers exactly one{" "}
        <InlineCode>grant_type: refresh_token</InlineCode> call, persists the{" "}
        <em>new</em> refresh token before retrying, and holds a lock so parallel
        requests don&apos;t both refresh — the token endpoint rotates the refresh
        token on every use, and a stale one is dead.
      </Callout>
    </div>
  );
}
