import {
  Callout,
  EndpointTable,
  InlineCode,
  PageHeader,
  SectionHeading,
  TryIt,
} from "../_components/docs";

export default function FlowsDocsPage() {
  return (
    <div>
      <PageHeader
        title="Flows, Subscriptions & Notifications"
        lede={
          <>
            Flows are automations defined as{" "}
            <em>trigger → effects</em>: &quot;when an item is created in app X, create
            a task and post to a channel&quot;. The Flows API lets you build them
            programmatically. Subscriptions let a user follow objects and receive
            notifications, which the Notifications API reads and clears.
          </>
        }
      />

      <SectionHeading id="flows">Flows</SectionHeading>
      <div className="mt-4">
        <EndpointTable
          rows={[
            {
              method: "GET",
              path: "/api/v1/flows",
              params: "ref_type?, ref_id? — filter to one app or space",
              response: '{ "flows": [ { "id", "name", "status", "trigger", "effects" } ] }',
            },
            {
              method: "POST",
              path: "/api/v1/flows",
              params:
                '{ "name", "ref_type": "app", "ref_id", "trigger": { "type": "item.create", … }, "effects": [ … ] }',
              response: '201 — { "id", "status": "inactive" }',
            },
            {
              method: "GET",
              path: "/api/v1/flows/{id}",
              params: "—",
              response: '{ "id", "name", "status", "trigger", "effects" }',
            },
            {
              method: "PUT",
              path: "/api/v1/flows/{id}",
              params: "same shape as POST — full replace of trigger/effects",
              response: '{ "id", … }',
            },
            {
              method: "DELETE",
              path: "/api/v1/flows/{id}",
              params: "—",
              response: "204",
            },
            {
              method: "POST",
              path: "/api/v1/flows/{id}/activate",
              params: "—",
              response: '{ "id", "status": "active" }',
            },
            {
              method: "POST",
              path: "/api/v1/flows/{id}/deactivate",
              params: "—",
              response: '{ "id", "status": "inactive" }',
            },
            {
              method: "GET",
              path: "/api/v1/flows/possible-attributes",
              params: "ref_type, ref_id, trigger_type — discover variables a trigger exposes",
              response: '{ "attributes": [ { "key", "label", "type" } ] }',
            },
            {
              method: "GET",
              path: "/api/v1/flows/{id}/effect-attributes",
              params: "—",
              response:
                '{ "effects": [ { "effect_id", "attributes": [ { "key", "label", "type" } ] } ] }',
            },
          ]}
        />
      </div>

      <p className="mt-4 text-[15px] leading-relaxed text-podio-secondary">
        Build a flow in three steps: discover the attributes the trigger exposes
        with <InlineCode>possible-attributes</InlineCode>, compose effects that
        reference them as <InlineCode>{"{{attribute.key}}"}</InlineCode>, then
        activate. Flows are created inactive so you can review before they run.
      </p>
      <TryIt
        request={`curl -X POST "$BASE_URL/api/v1/flows" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "New project -> kickoff task",
    "ref_type": "app",
    "ref_id": "APP_ID",
    "trigger": { "type": "item.create" },
    "effects": [
      {
        "type": "task.create",
        "params": { "title": "Kick off {{item.title}}", "due_in_days": 3 }
      }
    ]
  }'`}
        response={`{ "id": "fl_88…", "status": "inactive" }`}
      />

      <SectionHeading id="subscriptions">Subscriptions</SectionHeading>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        Subscribing (following) an object means the authenticated user gets a
        notification whenever it changes — items, apps or spaces.
      </p>
      <div className="mt-4">
        <EndpointTable
          rows={[
            {
              method: "GET",
              path: "/api/v1/subscriptions",
              params: "—",
              response:
                '{ "subscriptions": [ { "id", "ref_type", "ref_id", "created_at" } ] }',
            },
            {
              method: "POST",
              path: "/api/v1/subscriptions",
              params: '{ "ref_type": "item" | "app" | "space", "ref_id" }',
              response: '201 — { "id" }',
            },
            {
              method: "DELETE",
              path: "/api/v1/subscriptions?ref_type=item&ref_id=…",
              params: "ref_type + ref_id (or /api/v1/subscriptions/{id})",
              response: "204",
            },
          ]}
        />
      </div>

      <SectionHeading id="notifications">Notifications</SectionHeading>
      <div className="mt-4">
        <EndpointTable
          rows={[
            {
              method: "GET",
              path: "/api/v1/notifications",
              params: "unread_only? (true | false), limit?, offset?",
              response:
                '{ "notifications": [ { "id", "type", "text", "ref", "read", "created_at" } ] }',
            },
            {
              method: "POST",
              path: "/api/v1/notifications/mark-read",
              params: '{ "ids": ["…"] } — or { "all": true } to clear the inbox',
              response: '{ "marked": <count> }',
            },
          ]}
        />
      </div>
      <TryIt
        request={`curl "$BASE_URL/api/v1/notifications?unread_only=true&limit=20" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY"`}
        response={`{
  "notifications": [
    {
      "id": "n_501…",
      "type": "comment.create",
      "text": "Ana commented on Launch website",
      "ref": { "type": "item", "id": "9f2e…" },
      "read": false,
      "created_at": "2026-07-17T13:58:04Z"
    }
  ]
}`}
      />

      <Callout title="Flows vs. hooks — which one?">
        Use a <strong className="text-podio-ink">flow</strong> when the reaction
        lives <em>inside</em> Podio Clone (create a task, update a field, send a
        notification). Use a{" "}
        <strong className="text-podio-ink">hook</strong> when the reaction lives
        in <em>your</em> system. They compose: a flow can call a webhook effect,
        and an inbound webhook can trigger a flow.
      </Callout>
    </div>
  );
}
