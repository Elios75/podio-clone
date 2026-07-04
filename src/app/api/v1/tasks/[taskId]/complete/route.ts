import { apiCall } from "@/lib/api-auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  return apiCall(req, "complete_task", { task_id: taskId });
}
