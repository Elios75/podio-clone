import { flowsApiCall } from "../../_lib/flows-api";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params;
  return flowsApiCall(req, "flow.effect_attributes", { flow_id: flowId });
}
