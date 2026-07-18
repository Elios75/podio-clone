import { hooksCall } from "../../../_lib";

// POST /api/v1/hooks/:hookId/verify/validate  { code } — activate on match
export async function POST(
  req: Request,
  ctx: { params: Promise<{ hookId: string }> }
) {
  const { hookId } = await ctx.params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  return hooksCall(req, "hook.verify.validate", { id: hookId, code: body.code });
}
