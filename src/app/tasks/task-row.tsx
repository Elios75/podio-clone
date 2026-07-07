"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";
import { TaskLabelMenu, DEFAULT_LABEL_COLOR, type Label } from "./task-labels";

// All fields are precomputed on the server (date/time strings, overdue flag)
// so the row renders deterministically — no client-side date math at render
// time, no hydration drift.
export type TaskRowData = {
  id: string;
  title: string;
  status: string;
  dateText: string; // MM/DD/YYYY, "" when undated
  timeText: string; // HH:MM, "--:--" for all-day due dates, "" when undated
  overdue: boolean;
  dueValue: string; // yyyy-mm-dd for the reschedule input, "" when undated
  assigneeName: string | null;
  canDelete: boolean;
  linkHref: string | null;
  linkTitle: string | null;
  labelIds: string[];
};

export function TaskRow({ task, allLabels }: { task: TaskRowData; allLabels: Label[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [menu, setMenu] = useState<null | "date" | "labels">(null);
  const completed = task.status === "completed";

  async function toggle() {
    if (completed) {
      await supabase
        .from("tasks")
        .update({ status: "open", completed_at: null, completed_by: null })
        .eq("id", task.id);
    } else {
      await supabase.rpc("complete_task", { p_task: task.id });
    }
    router.refresh();
  }

  async function reschedule(value: string) {
    await supabase
      .from("tasks")
      .update({
        due_at: value ? new Date(`${value}T00:00`).toISOString() : null,
        all_day: true,
      })
      .eq("id", task.id);
    setMenu(null);
    router.refresh();
  }

  async function remove() {
    await supabase.from("tasks").delete().eq("id", task.id);
    router.refresh();
  }

  const assignedLabels = allLabels.filter((l) => task.labelIds.includes(l.id));

  return (
    <li className="group relative flex min-h-[44px] items-center gap-3 border-b border-podio-border px-4 py-1.5 hover:bg-podio-row-alt">
      <input
        type="checkbox"
        checked={completed}
        onChange={toggle}
        className="h-4 w-4 shrink-0"
      />
      <span
        className={`w-[76px] shrink-0 text-sm tabular-nums ${
          task.overdue ? "text-red-600" : "text-podio-ink"
        }`}
      >
        {task.dateText}
      </span>
      <span className="w-12 shrink-0 text-sm text-podio-meta">{task.timeText}</span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[15px] ${
            completed ? "text-podio-disabled line-through" : "text-podio-ink"
          }`}
        >
          {task.title}
        </span>
        {task.linkHref && (
          <Link
            href={task.linkHref}
            className="block truncate text-xs text-podio-teal hover:underline"
          >
            {task.linkTitle}
          </Link>
        )}
      </span>
      {assignedLabels.length > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          {assignedLabels.map((l) => (
            <span
              key={l.id}
              title={l.name}
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: l.color ?? DEFAULT_LABEL_COLOR }}
            />
          ))}
        </span>
      )}
      {task.assigneeName && (
        <span className="flex shrink-0 items-center gap-1 text-sm text-podio-meta">
          <PodioIcon icon="contact" className="h-4 w-4" />
          {task.assigneeName}
        </span>
      )}

      {/* Hover-revealed action cluster (always visible on touch layouts) */}
      <span className="ml-1 flex shrink-0 items-center gap-1 md:hidden md:group-hover:flex">
        <button
          title="Reschedule"
          onClick={() => setMenu(menu === "date" ? null : "date")}
          className="rounded p-1 text-podio-meta hover:bg-podio-row-hover hover:text-podio-secondary"
        >
          <PodioIcon icon="calendar" className="h-[18px] w-[18px]" />
        </button>
        <button
          title="Labels"
          onClick={() => setMenu(menu === "labels" ? null : "labels")}
          className="rounded p-1 text-podio-meta hover:bg-podio-row-hover hover:text-podio-secondary"
        >
          <PodioIcon icon="tag" className="h-[18px] w-[18px]" />
        </button>
        {task.canDelete && (
          <button
            title="Delete task"
            onClick={remove}
            className="rounded p-1 text-podio-meta hover:bg-podio-row-hover hover:text-red-600"
          >
            <PodioIcon icon="trash" className="h-[18px] w-[18px]" />
          </button>
        )}
      </span>

      {menu === "date" && (
        <span className="absolute right-4 top-full z-10 -mt-1 flex items-center gap-2 rounded border border-podio-border bg-white p-2 shadow-sm">
          <input
            type="date"
            defaultValue={task.dueValue}
            onChange={(e) => reschedule(e.target.value)}
            className="rounded border border-podio-border px-2 py-1 text-sm text-podio-ink focus:border-podio-teal focus:outline-none"
          />
          {task.dueValue && (
            <button
              onClick={() => reschedule("")}
              className="text-xs text-podio-meta hover:text-red-600"
            >
              Clear
            </button>
          )}
        </span>
      )}
      {menu === "labels" && (
        <TaskLabelMenu
          taskId={task.id}
          allLabels={allLabels}
          assigned={task.labelIds}
          onClose={() => setMenu(null)}
        />
      )}
    </li>
  );
}
