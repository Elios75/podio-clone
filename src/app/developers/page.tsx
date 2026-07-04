const ENDPOINTS = [
  {
    method: "GET", path: "/api/v1/apps",
    desc: "List all apps in your organization, including field definitions (external_id, label, type).",
    scope: "read",
  },
  {
    method: "GET", path: "/api/v1/workspaces",
    desc: "List workspaces with app counts.",
    scope: "read",
  },
  {
    method: "GET", path: "/api/v1/apps/:appId/items?limit=50&offset=0",
    desc: "List items in an app. Values are keyed by field external_id.",
    scope: "read",
  },
  {
    method: "POST", path: "/api/v1/apps/:appId/items",
    desc: 'Create an item. Body: { "values": { "<field-external-id>": <value>, … } }. Fires item_created automations and webhooks.',
    scope: "write",
  },
  {
    method: "GET", path: "/api/v1/items/:itemId",
    desc: "Get a single item with all field values.",
    scope: "read",
  },
  {
    method: "PUT", path: "/api/v1/items/:itemId",
    desc: 'Update field values on an item. Body: { "values": { … } }.',
    scope: "write",
  },
  {
    method: "DELETE", path: "/api/v1/items/:itemId",
    desc: "Soft-delete an item.",
    scope: "write",
  },
  {
    method: "GET", path: "/api/v1/tasks?status=open&limit=50",
    desc: "List tasks in your organization. Optional status filter (open / completed).",
    scope: "read",
  },
  {
    method: "POST", path: "/api/v1/tasks",
    desc: 'Create a task. Body: { "title": "…", "description"?, "workspace_id"?, "assignee_id"?, "due_at"? (ISO timestamp) }.',
    scope: "write",
  },
  {
    method: "POST", path: "/api/v1/tasks/:taskId/complete",
    desc: "Mark a task completed.",
    scope: "write",
  },
  {
    method: "POST", path: "/api/v1/webhooks/verify",
    desc: 'Webhook verification handshake. When a webhook is created it receives a hook.verify delivery containing a verify_token; echo it here — body { "token": "…" } (GET ?token=… also works). The webhook only receives events after verification.',
    scope: "none (token is the credential)",
  },
];

const methodColor: Record<string, string> = {
  GET: "bg-green-100 text-green-700",
  POST: "bg-blue-100 text-blue-700",
  PUT: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
};

export default function DevelopersPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">API documentation</h1>
      <p className="mt-2 text-sm text-slate-500">
        REST API v1.1 — programmatic access to apps, items, workspaces, tasks, and webhooks.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Authentication</h2>
        <p className="mt-2 text-sm text-slate-600">
          Create an API key in your organization settings (Settings → API keys). Send it as a
          bearer token on every request:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
{`curl https://your-domain/api/v1/apps \\
  -H "Authorization: Bearer pk_your_api_key"`}
        </pre>
        <p className="mt-2 text-sm text-slate-600">
          Keys carry scopes: <code className="rounded bg-slate-100 px-1">read</code> and{" "}
          <code className="rounded bg-slate-100 px-1">write</code>. Write endpoints require the
          write scope.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Rate limits</h2>
        <p className="mt-2 text-sm text-slate-600">
          Each key allows <strong>60 requests per minute</strong> by default (fixed one-minute
          windows). Exceeding the limit returns <code className="rounded bg-slate-100 px-1">429</code>{" "}
          with an explanatory message. Contact your org admin to raise a key's limit.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Endpoints</h2>
        <div className="mt-3 space-y-3">
          {ENDPOINTS.map((e) => (
            <div key={e.method + e.path} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${methodColor[e.method]}`}>
                  {e.method}
                </span>
                <code className="text-sm font-medium">{e.path}</code>
                <span className="ml-auto text-xs text-slate-400">scope: {e.scope}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{e.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Webhooks</h2>
        <p className="mt-2 text-sm text-slate-600">
          Webhooks are configured per organization (Settings → Webhooks) and deliver JSON payloads
          signed with an HMAC-SHA256 signature in the{" "}
          <code className="rounded bg-slate-100 px-1">X-Webhook-Signature</code> header. Verify the
          signature by computing HMAC-SHA256 of the raw body with your webhook secret.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          <strong>Verification handshake:</strong> immediately after you create a webhook, it
          receives a <code className="rounded bg-slate-100 px-1">hook.verify</code> event with a{" "}
          <code className="rounded bg-slate-100 px-1">verify_token</code>. POST that token to{" "}
          <code className="rounded bg-slate-100 px-1">/api/v1/webhooks/verify</code>. Until then the
          webhook receives no events. Deliveries retry with exponential backoff (up to 5 attempts).
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Events: <code className="rounded bg-slate-100 px-1">item_created</code>,{" "}
          <code className="rounded bg-slate-100 px-1">item_updated</code>,{" "}
          <code className="rounded bg-slate-100 px-1">comment_added</code>,{" "}
          <code className="rounded bg-slate-100 px-1">form_submitted</code>,{" "}
          <code className="rounded bg-slate-100 px-1">email_received</code>, and more — any activity
          event type can be subscribed to.
        </p>
      </section>
    </main>
  );
}
