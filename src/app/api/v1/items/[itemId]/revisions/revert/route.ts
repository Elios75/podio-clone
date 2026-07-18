import { itemsApiCall } from "../../items-api";

// POST /api/v1/items/:itemId/revisions/revert  { rev: 2 } — restore that revision's values
export async function POST(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const body = await req.json().catch(() => ({}));
  return itemsApiCall(req, "item.revert", {
    item_id: itemId,
    rev: body.rev,
  });
}
