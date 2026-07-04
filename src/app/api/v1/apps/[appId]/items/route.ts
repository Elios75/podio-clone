import { apiCall } from "@/lib/api-auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const url = new URL(req.url);
  return apiCall(req, "list_items", {
    app_id: appId,
    limit: url.searchParams.get("limit"),
    offset: url.searchParams.get("offset"),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const body = await req.json().catch(() => ({}));
  return apiCall(req, "create_item", {
    app_id: appId,
    values: body.values ?? {},
  });
}
