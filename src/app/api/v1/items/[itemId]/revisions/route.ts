import { itemsApiCall } from "../items-api";

// GET /api/v1/items/:itemId/revisions — list revisions (number, created_at, created_by)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  return itemsApiCall(req, "item.revisions", { item_id: itemId });
}
