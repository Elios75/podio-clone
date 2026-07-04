"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function TaskToggle({ taskId, status }: { taskId: string; status: string }) {
  const router = useRouter();
  const supabase = createClient();

  return (
    <input
      type="checkbox"
      checked={status === "completed"}
      onChange={async () => {
        if (status === "open") {
          await supabase.rpc("complete_task", { p_task: taskId });
        } else {
          await supabase
            .from("tasks")
            .update({ status: "open", completed_at: null, completed_by: null })
            .eq("id", taskId);
        }
        router.refresh();
      }}
      className="h-4 w-4 shrink-0"
    />
  );
}
