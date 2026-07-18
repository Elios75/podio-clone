import { hooksCall } from "../../_lib";

// POST /api/v1/hooks/:hookId/verify — re-send the hook.verify delivery
export async function POST(
  req: Request,
  ctx: { params: Promise<{ hookId: string }> }
) {
  const { hookId } = await ctx.params;
  return hooksCall(req, "hook.verify.request", { id: hookId });
}
