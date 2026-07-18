import { flowsApiCall } from "../_lib/flows-api";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params;
  return flowsApiCall(req, "flow.get", { flow_id: flowId });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params;
  const body = await req.json().catch(() => ({}));
  const p: Record<string, any> = { flow_id: flowId };
  if (body.name !== undefined) p.name = body.name;
  if (body.trigger !== undefined) p.trigger = body.trigger;
  if (body.conditions !== undefined) p.conditions = body.conditions;
  if (body.actions !== undefined) p.actions = body.actions;
  return flowsApiCall(req, "flow.update", p);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params;
  return flowsApiCall(req, "flow.delete", { flow_id: flowId });
}
