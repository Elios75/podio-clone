import { itemsApiCall } from "../../items-api";

// PUT /api/v1/items/:itemId/values/:fieldId  { value: <jsonb> }
// Surgical single-field update: only this field's rows are rewritten.
// Send { value: null } to clear the field.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ itemId: string; fieldId: string }> }
) {
  const { itemId, fieldId } = await params;
  const body = await req.json().catch(() => ({}));
  return itemsApiCall(req, "item.value.update", {
    item_id: itemId,
    field_id: fieldId,
    value: body.value ?? null,
  });
}
