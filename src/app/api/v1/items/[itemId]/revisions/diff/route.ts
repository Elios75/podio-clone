import { itemsApiCall } from "../../items-api";

// GET /api/v1/items/:itemId/revisions/diff?from=1&to=3 — per-field diff between two revisions
export async function GET(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const url = new URL(req.url);
  return itemsApiCall(req, "item.revision.diff", {
    item_id: itemId,
    from_rev: url.searchParams.get("from"),
    to_rev: url.searchParams.get("to"),
  });
}
