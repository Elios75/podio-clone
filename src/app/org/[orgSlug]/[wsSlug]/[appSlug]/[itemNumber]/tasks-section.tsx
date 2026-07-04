"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Task = {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  assignee_name: string | null;
};
type Member = { user_id: string; full_name: string | null };

export function TasksSection({
  itemId,
  orgId,
  wsId,
  members,
  tasks,
}: {
  itemId: string;
  orgId: string;
  wsId: string;
  members: Member[];
  tasks: Task[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createTask() {
    setError(null);
    if (!title.trim()) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("create_task", {
      p_org: orgId,
      p_ws: wsId,
      p_title: title,
      p_assignee: assignee || null,
      p_due: due ? new Date(due).toISOString() : null,
      p_target_type: "item",
      p_target_id: itemId,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    setTitle("");
    setAssignee("");
    setDue("");
    router.refresh();
  }

  async function toggle(task: Task) {
    if (task.status === "open") {
      await supabase.rpc("complete_task", { p_task: task.id });
    } else {
      await supabase
        .from("tasks")
        .update({ status: "open", completed_at: null, completed_by: null })
        .eq("id", task.id);
    }
    router.refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium">Tasks ({tasks.filter((t) => t.status === "open").length} open)</h2>

      <ul className="mt-3 space-y-2">
        {tasks.map((t) => (
          <li key={t.id}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <input
              type="checkbox"
              checked={t.status === "completed"}
              onChange={() => toggle(t)}
              className="h-4 w-4"
            />
            <span className={`text-sm ${t.status === "completed" ? "text-slate-400 line-through" : ""}`}>
              {t.title}
            </span>
            <span className="ml-auto flex items-center gap-3 text-xs text-slate-400">
              {t.assignee_name && <span>→ {t.assignee_name}</span>}
              {t.due_at && (
                <span className={new Date(t.due_at) < new Date() && t.status === "open" ? "text-red-500" : ""}>
                  due {new Date(t.due_at).toLocaleDateString()}
                </span>
              )}
            </span>
          </li>
        ))}
        {tasks.length === 0 && <li className="text-sm text-slate-400">No tasks yet.</li>}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <input
          placeholder="New task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name ?? m.user_id.slice(0, 8)}
            </option>
          ))}
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <button onClick={createTask} disabled={busy || !title.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Add
        </button>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </div>
    </section>
  );
}
