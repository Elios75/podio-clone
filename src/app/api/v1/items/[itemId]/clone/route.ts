import { itemsApiCall } from "../items-api";

// POST /api/v1/items/:itemId/clone — deep-copy the item within its app
export async function POST(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  return itemsApiCall(req, "item.clone", { item_id: itemId });
}
