import { flowsApiCall } from "../../flows/_lib/flows-api";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return flowsApiCall(req, "notification.mark_read", {
    id: body.id,
    all: body.all === true,
  });
}
