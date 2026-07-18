import { flowsApiCall } from "../flows/_lib/flows-api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const targetType = url.searchParams.get("target_type");
  const targetId = url.searchParams.get("target_id");
  if (targetType && targetId) {
    return flowsApiCall(req, "subscription.get", {
      target_type: targetType,
      target_id: targetId,
    });
  }
  return flowsApiCall(req, "subscription.list", {
    limit: url.searchParams.get("limit"),
    offset: url.searchParams.get("offset"),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return flowsApiCall(req, "subscription.create", {
    target_type: body.target_type,
    target_id: body.target_id,
  });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  return flowsApiCall(req, "subscription.delete", {
    target_type: body.target_type ?? url.searchParams.get("target_type"),
    target_id: body.target_id ?? url.searchParams.get("target_id"),
  });
}
