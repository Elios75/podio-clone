# Permission Matrix

Enforced in two layers: RLS policies for direct table access, and matching guards inside every `security definer` RPC (which bypass RLS by design).

## Workspace roles

| Capability | admin | member | light | guest |
|---|---|---|---|---|
| View workspace, apps, items, views | ✓ | ✓ | ✓ | ✓ |
| Comment, react, follow | ✓ | ✓ | ✓ | — |
| Complete tasks assigned to them | ✓ | ✓ | ✓ | ✓ |
| Create / edit / delete items | ✓ | ✓ | — | — |
| Import / export | ✓ | ✓ | — | — |
| Build & edit apps (fields, views) | ✓ | ✓ | — | — |
| Automations, webforms, email-to-app | ✓ | ✓ | — | — |
| Dashboard tiles | ✓ | ✓ | — | — |
| Share single items with guests | ✓ | ✓ | — | — |
| Workspace settings, member roles | ✓ | — | — | — |

Org owners/admins implicitly hold workspace-admin rights everywhere in the org.

## Organization roles

| Capability | owner | admin | employee | light | external | guest |
|---|---|---|---|---|---|---|
| Billing, org settings, delete org | ✓ | ✓ | — | — | — | — |
| Manage org members & roles | ✓ | ✓ | — | — | — | — |
| API keys, webhooks, audit logs | ✓ | ✓ | — | — | — | — |
| Create workspaces | ✓ | ✓ | ✓ | — | — | — |
| Self-join open workspaces | ✓ | ✓ | ✓ | — | — | — |
| Be invited into workspaces | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

External clients typically get workspace `member` or `light` in specific
workspaces. Guests usually get no workspace at all — only single-item access
via item shares (view / comment / edit).

## Key functions (all in the `podio` schema)

`workspace_role_of(ws)` — effective role (org admins → admin);
`can_edit_items(ws)` — admin/member; `can_edit_item(item)` — that, or an
active edit-share; `is_org_employee(org)` — owner/admin/employee;
`is_workspace_member(ws)` — any visibility-level access.
