import { apiCall } from "@/lib/api-auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  return apiCall(req, "list_tasks", {
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return apiCall(req, "create_task", body);
}
