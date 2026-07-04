import { apiCall } from "@/lib/api-auth";

export async function GET(req: Request) {
  return apiCall(req, "list_workspaces");
}
