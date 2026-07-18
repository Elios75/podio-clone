import { flowsApiCall } from "../../_lib/flows-api";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params;
  return flowsApiCall(req, "flow.deactivate", { flow_id: flowId });
}
