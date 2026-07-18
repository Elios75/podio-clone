import { flowsApiCall } from "../flows/_lib/flows-api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  return flowsApiCall(req, "notification.list", {
    limit: url.searchParams.get("limit"),
    unread_only: url.searchParams.get("unread_only") === "true",
    offset: url.searchParams.get("offset"),
  });
}
