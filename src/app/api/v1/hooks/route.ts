import { hooksCall } from "./_lib";

// GET /api/v1/hooks?app_id=... | ?workspace_id=...  — list hooks
export async function GET(req: Request) {
  const url = new URL(req.url);
  const params: Record<string, unknown> = {};
  const appId = url.searchParams.get("app_id");
  const workspaceId = url.searchParams.get("workspace_id");
  if (appId) params.app_id = appId;
  if (workspaceId) params.workspace_id = workspaceId;
  return hooksCall(req, "hook.list", params);
}

// POST /api/v1/hooks  { url, event, app_id | workspace_id, field_id? }
// Created unverified; a hook.verify delivery with the verification code is
// queued to the target URL automatically.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  return hooksCall(req, "hook.create", {
    url: body.url,
    event: body.event,
    app_id: body.app_id,
    workspace_id: body.workspace_id,
    field_id: body.field_id,
  });
}
