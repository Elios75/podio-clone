"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";
import type { Label } from "./task-labels";

type Member = { user_id: string; full_name: string | null };

// Podio's task composer: a large bordered "Enter a task" input with a
// check-square glyph inside, over a grey affordance strip of quiet icons —
// calendar (due date + optional time), contact (assignee), tag (labels).
// Enter creates the task via the create_task RPC (standalone: p_ws null,
// org = the user's first membership).
export function TaskComposer({
  orgId,
  members,
  labels,
}: {
  orgId: string | null;
  members: Member[];
  labels: Label[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [time, setTime] = useState("");
  const [assignee, setAssignee] = useState("");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [picker, setPicker] = useState<null | "due" | "assignee" | "labels">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!title.trim() || !orgId || busy) return;
    setBusy(true);
    setError(null);
    const dueIso = due ? new Date(`${due}T${time || "00:00"}`).toISOString() : null;
    const { data: task, error: rpcError } = await supabase.rpc("create_task", {
      p_org: orgId,
      p_ws: null,
      p_title: title.trim(),
      p_assignee: assignee || null,
      p_due: dueIso,
    });
    if (rpcError) {
      setBusy(false);
      setError(rpcError.message);
      return;
    }
    if (task) {
      if (due && time) {
        await supabase.from("tasks").update({ all_day: false }).eq("id", task.id);
      }
      if (labelIds.length) {
        await supabase
          .from("task_label_links")
          .insert(labelIds.map((label_id) => ({ task_id: task.id, label_id })));
      }
    }
    setTitle("");
    setDue("");
    setTime("");
    setAssignee("");
    setLabelIds([]);
    setPicker(null);
    setBusy(false);
    router.refresh();
  }

  const assigneeName =
    members.find((m) => m.user_id === assignee)?.full_name ??
    (assignee ? assignee.slice(0, 8) : null);
  const dueText = due ? `${due.slice(5, 7)}/${due.slice(8, 10)}/${due.slice(0, 4)}` : null;

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-podio-meta">
          <PodioIcon icon="check-square" className="h-5 w-5" />
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder={orgId ? "Enter a task" : "Join an organization to create tasks"}
          disabled={!orgId || busy}
          className="w-full rounded-t border border-podio-border py-2.5 pl-10 pr-3 text-[15px] text-podio-ink placeholder:text-podio-meta focus:border-podio-teal focus:outline-none disabled:bg-podio-row-alt"
        />
      </div>

      {/* Quiet affordance strip */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-b border-x border-b border-podio-border bg-podio-row-alt px-2 py-1.5">
        <button
          type="button"
          title="Due date"
          onClick={() => setPicker(picker === "due" ? null : "due")}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm ${
            due || picker === "due"
              ? "text-podio-teal"
              : "text-podio-meta hover:text-podio-secondary"
          }`}
        >
          <PodioIcon icon="calendar" className="h-[18px] w-[18px]" />
          {dueText && (
            <span>
              {dueText}
              {time && ` ${time}`}
            </span>
          )}
        </button>
        {picker === "due" && (
          <span className="flex items-center gap-1">
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="rounded border border-podio-border bg-white px-2 py-0.5 text-sm text-podio-ink focus:border-podio-teal focus:outline-none"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded border border-podio-border bg-white px-2 py-0.5 text-sm text-podio-ink focus:border-podio-teal focus:outline-none"
            />
          </span>
        )}

        <button
          type="button"
          title="Assign to"
          onClick={() => setPicker(picker === "assignee" ? null : "assignee")}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm ${
            assignee || picker === "assignee"
              ? "text-podio-teal"
              : "text-podio-meta hover:text-podio-secondary"
          }`}
        >
          <PodioIcon icon="contact" className="h-[18px] w-[18px]" />
          {assigneeName && <span>{assigneeName}</span>}
        </button>
        {picker === "assignee" && (
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="rounded border border-podio-border bg-white px-2 py-0.5 text-sm text-podio-ink focus:border-podio-teal focus:outline-none"
          >
            <option value="">Myself</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name ?? m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          title="Labels"
          onClick={() => setPicker(picker === "labels" ? null : "labels")}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm ${
            labelIds.length || picker === "labels"
              ? "text-podio-teal"
              : "text-podio-meta hover:text-podio-secondary"
          }`}
        >
          <PodioIcon icon="tag" className="h-[18px] w-[18px]" />
          {labelIds.length > 0 && <span>{labelIds.length}</span>}
        </button>
        {picker === "labels" && (
          <span className="flex flex-wrap items-center gap-1">
            {labels.map((l) => {
              const on = labelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() =>
                    setLabelIds(
                      on ? labelIds.filter((x) => x !== l.id) : [...labelIds, l.id]
                    )
                  }
                  className={`rounded border px-2 py-0.5 text-xs ${
                    on
                      ? "border-podio-teal bg-white font-medium text-podio-teal"
                      : "border-podio-border bg-white text-podio-secondary hover:text-podio-ink"
                  }`}
                >
                  {l.name}
                </button>
              );
            })}
            {labels.length === 0 && (
              <span className="text-xs text-podio-meta">No labels yet</span>
            )}
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
