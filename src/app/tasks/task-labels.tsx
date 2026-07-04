"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export type Label = { id: string; name: string; color: string | null };

const LABEL_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

// Personal color-coded labels (visible only to you, per Podio's model)
export function LabelManager({
  labels,
  activeLabel,
}: {
  labels: Label[];
  activeLabel: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[0]);

  async function create() {
    if (!name.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("task_labels").insert({ user_id: user!.id, name, color });
    setName("");
    setAdding(false);
    router.refresh();
  }

  async function remove(id: string) {
    await supabase.from("task_labels").delete().eq("id", id);
    if (activeLabel === id) router.push("/tasks");
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Link href="/tasks"
        className={`rounded-full px-3 py-1 text-xs ${
          !activeLabel ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-600"}`}>
        All
      </Link>
      {labels.map((l) => (
        <span key={l.id} className="group flex items-center">
          <Link href={`/tasks?label=${l.id}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              activeLabel === l.id ? "text-white" : "border text-slate-700"}`}
            style={activeLabel === l.id
              ? { backgroundColor: l.color ?? "#64748b" }
              : { borderColor: l.color ?? "#cbd5e1" }}>
            {l.name}
          </Link>
          <button onClick={() => remove(l.id)}
            className="ml-0.5 hidden text-xs text-slate-300 hover:text-red-500 group-hover:inline">
            ✕
          </button>
        </span>
      ))}
      {adding ? (
        <span className="flex items-center gap-1">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Label name"
            className="w-28 rounded border border-slate-300 px-2 py-1 text-xs" />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
            className="h-6 w-8" />
          <button onClick={create} className="rounded bg-blue-600 px-2 py-1 text-xs text-white">✓</button>
          <button onClick={() => setAdding(false)} className="text-xs text-slate-400">✕</button>
        </span>
      ) : (
        <button onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-400 hover:text-slate-600">
          + label
        </button>
      )}
    </div>
  );
}

export function LabelPicker({
  taskId,
  allLabels,
  assigned,
}: {
  taskId: string;
  allLabels: Label[];
  assigned: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function toggle(labelId: string) {
    if (assigned.includes(labelId)) {
      await supabase.from("task_label_links").delete()
        .eq("task_id", taskId).eq("label_id", labelId);
    } else {
      await supabase.from("task_label_links").insert({ task_id: taskId, label_id: labelId });
    }
    router.refresh();
  }

  return (
    <span className="relative">
      <span className="flex items-center gap-1">
        {allLabels.filter((l) => assigned.includes(l.id)).map((l) => (
          <span key={l.id} className="h-2.5 w-2.5 rounded-full" title={l.name}
            style={{ backgroundColor: l.color ?? "#64748b" }} />
        ))}
        <button onClick={() => setOpen(!open)}
          className="text-xs text-slate-300 hover:text-slate-600" title="Labels">
          🏷
        </button>
      </span>
      {open && (
        <span className="absolute right-0 top-6 z-10 flex w-40 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {allLabels.map((l) => (
            <button key={l.id} onClick={() => toggle(l.id)}
              className="flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-50">
              <span className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: l.color ?? "#64748b" }} />
              {l.name}
              {assigned.includes(l.id) && <span className="ml-auto text-blue-600">✓</span>}
            </button>
          ))}
          {allLabels.length === 0 && (
            <span className="px-2 py-1 text-xs text-slate-400">No labels yet</span>
          )}
        </span>
      )}
    </span>
  );
}
