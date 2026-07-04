# Podio Clone — Public REST API (v1)

Authentication: create a key on your organization page, then send it on every request:

```
Authorization: Bearer pk_live_xxxxxxxx
```

Keys are org-scoped. Read-only keys can't mutate (403). Raw keys are never stored — only a SHA-256 hash — so a lost key must be revoked and recreated.

Base URL: your deployment origin (e.g. `http://localhost:3000` in dev).

## Endpoints

### List apps
`GET /api/v1/apps`

Returns every app in the organization with its field schema. Field `external_id`s are the keys you use for item values.

### List items
`GET /api/v1/apps/:appId/items?limit=50&offset=0`

Item `values` are keyed by field `external_id`. Max limit 200.

### Create item
`POST /api/v1/apps/:appId/items`

```json
{ "values": { "title-0": "Acme deal", "value-1": 5000, "stage-2": "<category option id>" } }
```

Value shapes by field type: text/phone/email/link/location/organization/category → string (category = option id); number/progress → number; duration → seconds; money → `{"amount": 100, "currency": "USD"}`; date → `{"start": "2026-07-01"}`; relationship → item uuid; contact → user uuid.

Creating via API fires `item_created` automations.

### Get / update / delete item
`GET /api/v1/items/:itemId`
`PUT /api/v1/items/:itemId` — body `{ "values": { ... } }`; PATCH semantics: only the fields you send are replaced.
`DELETE /api/v1/items/:itemId` — soft delete.

## Errors

JSON `{ "error": "message" }` with status 401 (bad/missing key), 403 (scope), 404 (not found), 400 (other).

## Example

```bash
curl -H "Authorization: Bearer pk_live_..." http://localhost:3000/api/v1/apps

curl -X POST -H "Authorization: Bearer pk_live_..." -H "Content-Type: application/json" \
  -d '{"values":{"title-0":"API lead","value-1":1200}}' \
  http://localhost:3000/api/v1/apps/<APP_ID>/items
```

## Not yet implemented

Webhooks (schema ready: `webhooks`, `webhook_deliveries`), rate limiting, cursor pagination, filtering via query params.
