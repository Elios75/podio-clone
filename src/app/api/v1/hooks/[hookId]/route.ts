import { hooksCall } from "../_lib";

// DELETE /api/v1/hooks/:hookId
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ hookId: string }> }
) {
  const { hookId } = await ctx.params;
  return hooksCall(req, "hook.delete", { id: hookId });
}
