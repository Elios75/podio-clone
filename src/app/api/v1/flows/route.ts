import { flowsApiCall } from "./_lib/flows-api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  return flowsApiCall(req, "flow.list", {
    app_id: url.searchParams.get("app_id"),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return flowsApiCall(req, "flow.create", {
    app_id: body.app_id,
    name: body.name,
    trigger: body.trigger,
    conditions: body.conditions,
    actions: body.actions,
  });
}
