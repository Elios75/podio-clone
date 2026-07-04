import { apiCall } from "@/lib/api-auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  return apiCall(req, "get_item", { item_id: itemId });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const body = await req.json().catch(() => ({}));
  return apiCall(req, "update_item", {
    item_id: itemId,
    values: body.values ?? {},
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  return apiCall(req, "delete_item", { item_id: itemId });
}
