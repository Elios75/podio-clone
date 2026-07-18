import { flowsApiCall } from "../_lib/flows-api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  return flowsApiCall(req, "flow.possible_attributes", {
    app_id: url.searchParams.get("app_id"),
  });
}
