import { hooksCall } from "../../_lib";

// GET /api/v1/hooks/:hookId/deliveries?limit=50 — recent delivery diagnostics
export async function GET(
  req: Request,
  ctx: { params: Promise<{ hookId: string }> }
) {
  const { hookId } = await ctx.params;
  const url = new URL(req.url);
  const params: Record<string, unknown> = { id: hookId };
  const limit = url.searchParams.get("limit");
  if (limit) params.limit = Number(limit);
  return hooksCall(req, "hook.deliveries", params);
}
