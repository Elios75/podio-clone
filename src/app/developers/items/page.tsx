import {
  Callout,
  EndpointTable,
  InlineCode,
  PageHeader,
  SectionHeading,
  TryIt,
} from "../_components/docs";

export default function ItemsDocsPage() {
  return (
    <div>
      <PageHeader
        title="Apps, Items & Tasks"
        lede={
          <>
            Apps define fields; items hold values keyed by each field&apos;s{" "}
            <InlineCode>external_id</InlineCode>. This page covers app and
            workspace discovery, the full item lifecycle (create, update,
            revisions, clone, bulk delete) and tasks.
          </>
        }
      />

      <SectionHeading id="apps">Applications & workspaces</SectionHeading>
      <div className="mt-4">
        <EndpointTable
          rows={[
            {
              method: "GET",
              path: "/api/v1/apps",
              params: "—",
              response:
                '{ "apps": [ { "id", "name", "workspace_id", "fields": [ { "external_id", "label", "type" } ] } ] }',
            },
            {
              method: "GET",
              path: "/api/v1/workspaces",
              params: "—",
              response: '{ "workspaces": [ { "id", "name", "slug", "app_count" } ] }',
            },
          ]}
        />
      </div>
      <TryIt
        request={`curl "$BASE_URL/api/v1/apps" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY"`}
        response={`{
  "apps": [
    {
      "id": "a91c…",
      "name": "Projects",
      "workspace_id": "b1f0…",
      "fields": [
        { "external_id": "title", "label": "Title", "type": "text" },
        { "external_id": "status", "label": "Status", "type": "category" },
        { "external_id": "due-date", "label": "Due date", "type": "date" }
      ]
    }
  ]
}`}
      />

      <SectionHeading id="items">Items</SectionHeading>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        Item values are keyed by field <InlineCode>external_id</InlineCode>.
        Creating an item fires <InlineCode>item.create</InlineCode> hooks and any
        matching flows/automations.
      </p>
      <div className="mt-4">
        <EndpointTable
          rows={[
            {
              method: "GET",
              path: "/api/v1/apps/{appId}/items",
              params: "limit (default 50), offset",
              response: '{ "items": [ { "id", "title", "values": { … } } ], "total" }',
            },
            {
              method: "POST",
              path: "/api/v1/apps/{appId}/items",
              params: '{ "values": { "<external-id>": <value>, … } }',
              response: '201 — { "id", "item_number", "values": { … } }',
            },
            {
              method: "GET",
              path: "/api/v1/items/{itemId}",
              params: "—",
              response: '{ "id", "app_id", "title", "values": { … } }',
            },
            {
              method: "PUT",
              path: "/api/v1/items/{itemId}",
              params: '{ "values": { "<external-id>": <value>, … } } — partial update',
              response: '{ "id", "values": { … } }',
            },
            {
              method: "PUT",
              path: "/api/v1/items/{itemId}/values/{fieldId}",
              params: '{ "value": <value> } — update a single field by id or external_id',
              response: '{ "id", "field", "value" }',
            },
            {
              method: "DELETE",
              path: "/api/v1/items/{itemId}",
              params: "—",
              response: "204 — item is soft-deleted",
            },
            {
              method: "POST",
              path: "/api/v1/apps/{appId}/items/delete",
              params: '{ "item_ids": ["…", "…"] } — bulk soft-delete',
              response: '{ "deleted": <count> }',
            },
            {
              method: "POST",
              path: "/api/v1/items/{itemId}/clone",
              params: "optional { \"values\": { … } } overrides on the copy",
              response: '201 — { "id" } of the new item',
            },
          ]}
        />
      </div>
      <TryIt
        request={`curl -X POST "$BASE_URL/api/v1/apps/APP_ID/items" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "values": { "title": "Launch website", "status": "in-process", "due-date": "2026-08-01" } }'`}
        response={`{
  "id": "9f2e…",
  "item_number": 42,
  "values": {
    "title": "Launch website",
    "status": "in-process",
    "due-date": "2026-08-01"
  }
}`}
      />

      <SectionHeading id="revisions">Revisions</SectionHeading>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        Every update creates a revision. You can list revisions, diff two of
        them, and revert an item to an earlier revision (the revert itself is
        recorded as a new revision).
      </p>
      <div className="mt-4">
        <EndpointTable
          rows={[
            {
              method: "GET",
              path: "/api/v1/items/{itemId}/revisions",
              params: "—",
              response:
                '{ "revisions": [ { "revision", "created_by", "created_at" } ] }',
            },
            {
              method: "GET",
              path: "/api/v1/items/{itemId}/revisions/diff",
              params: "from, to (revision numbers) as query params",
              response:
                '{ "changes": [ { "field", "from": <value>, "to": <value> } ] }',
            },
            {
              method: "POST",
              path: "/api/v1/items/{itemId}/revisions/revert",
              params: '{ "revision": <number> }',
              response: '{ "id", "revision": <new revision number> }',
            },
          ]}
        />
      </div>
      <TryIt
        request={`curl "$BASE_URL/api/v1/items/ITEM_ID/revisions/diff?from=3&to=5" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY"`}
        response={`{
  "changes": [
    { "field": "status", "from": "in-process", "to": "completed" },
    { "field": "due-date", "from": "2026-08-01", "to": "2026-07-20" }
  ]
}`}
      />

      <SectionHeading id="tasks">Tasks</SectionHeading>
      <div className="mt-4">
        <EndpointTable
          rows={[
            {
              method: "GET",
              path: "/api/v1/tasks",
              params: "status (open | completed), limit (default 50)",
              response: '{ "tasks": [ { "id", "title", "status", "due_at", "assignee_id" } ] }',
            },
            {
              method: "POST",
              path: "/api/v1/tasks",
              params:
                '{ "title", "description"?, "workspace_id"?, "assignee_id"?, "due_at"? (ISO timestamp) }',
              response: '201 — { "id", "title", "status": "open" }',
            },
            {
              method: "POST",
              path: "/api/v1/tasks/{taskId}/complete",
              params: "—",
              response: '{ "id", "status": "completed" }',
            },
          ]}
        />
      </div>
      <TryIt
        request={`curl -X POST "$BASE_URL/api/v1/tasks" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "title": "Review launch checklist", "due_at": "2026-07-25T09:00:00Z" }'`}
        response={`{ "id": "c77a…", "title": "Review launch checklist", "status": "open" }`}
      />

      <Callout title="Prefer bulk and partial operations">
        Updating one field? Use{" "}
        <InlineCode>PUT …/values/{"{fieldId}"}</InlineCode> instead of resending
        the whole values map. Deleting many items? One{" "}
        <InlineCode>POST …/items/delete</InlineCode> beats N DELETE calls — and
        counts as one request against your rate limit.
      </Callout>
    </div>
  );
}
