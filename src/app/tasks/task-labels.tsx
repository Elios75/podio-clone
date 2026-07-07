"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";

export type Label = { id: string; name: string; color: string | null };

// Podio's task labels render as a pale-green tag glyph in the rail; labels
// created before the redesign keep their stored color.
export const DEFAULT_LABEL_COLOR = "#86BFA0";

// Right rail: the user's personal labels (task_labels is per-user via RLS).
// Clicking a label filters the list (?label= searchParam, tab preserved);
// clicking the active one clears the filter. Hover reveals a delete trash;
// "+ Add label" inserts a new one.
export function LabelsRail({
  labels,
  activeLabel,
  tab,
}: {
  labels: Label[];
  activeLabel: string | null;
  tab: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function hrefFor(labelId: string | null) {
    const qs = new URLSearchParams();
    if (tab) qs.set("tab", tab);
    if (labelId) qs.set("label", labelId);
    const q = qs.toString();
    return q ? `/tasks?${q}` : "/tasks";
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("task_labels")
      .insert({ user_id: user!.id, name: trimmed, color: DEFAULT_LABEL_COLOR });
    setName("");
    setAdding(false);
    router.refresh();
  }

  async function remove(id: string) {
    await supabase.from("task_labels").delete().eq("id", id);
    if (activeLabel === id) router.push(hrefFor(null));
    router.refresh();
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-podio-teal">Labels</h2>
      <ul className="mt-2">
        {labels.map((l) => (
          <li key={l.id} className="group flex items-center gap-1 border-b border-podio-border">
            <Link
              href={hrefFor(activeLabel === l.id ? null : l.id)}
              className={`flex min-w-0 flex-1 items-center gap-2 py-2 text-[15px] ${
                activeLabel === l.id
                  ? "font-semibold text-podio-teal"
                  : "text-podio-ink hover:text-podio-teal"
              }`}
            >
              <span className="shrink-0" style={{ color: l.color ?? DEFAULT_LABEL_COLOR }}>
                <PodioIcon icon="tag" className="h-4 w-4" />
              </span>
              <span className="truncate">{l.name}</span>
            </Link>
            <button
              onClick={() => remove(l.id)}
              title="Delete label"
              className="hidden shrink-0 rounded p-1 text-podio-meta hover:text-red-600 group-hover:block"
            >
              <PodioIcon icon="trash" className="h-4 w-4" />
            </button>
          </li>
        ))}
        {labels.length === 0 && (
          <li className="border-b border-podio-border py-2 text-sm text-podio-meta">
            No labels yet.
          </li>
        )}
      </ul>

      {adding ? (
        <div className="mt-3 flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Label name"
            className="w-full min-w-0 rounded border border-podio-border px-2 py-1 text-sm text-podio-ink focus:border-podio-teal focus:outline-none"
          />
          <button
            onClick={create}
            className="shrink-0 rounded bg-podio-teal px-2 py-1 text-sm font-semibold text-white hover:bg-podio-teal-dark"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 text-sm text-podio-meta hover:text-podio-teal"
        >
          + Add label
        </button>
      )}
    </>
  );
}

// Small popover (opened from a task row's tag icon) toggling that task's
// labels via task_label_links.
export function TaskLabelMenu({
  taskId,
  allLabels,
  assigned,
  onClose,
}: {
  taskId: string;
  allLabels: Label[];
  assigned: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  async function toggle(labelId: string) {
    if (assigned.includes(labelId)) {
      await supabase
        .from("task_label_links")
        .delete()
        .eq("task_id", taskId)
        .eq("label_id", labelId);
    } else {
      await supabase
        .from("task_label_links")
        .insert({ task_id: taskId, label_id: labelId });
    }
    router.refresh();
  }

  return (
    <span className="absolute right-4 top-full z-10 -mt-1 flex w-48 flex-col gap-0.5 rounded border border-podio-border bg-white p-2 shadow-sm">
      {allLabels.map((l) => (
        <button
          key={l.id}
          onClick={() => toggle(l.id)}
          className="flex items-center gap-2 rounded px-2 py-1 text-left text-sm text-podio-ink hover:bg-podio-row-hover"
        >
          <span className="shrink-0" style={{ color: l.color ?? DEFAULT_LABEL_COLOR }}>
            <PodioIcon icon="tag" className="h-4 w-4" />
          </span>
          <span className="truncate">{l.name}</span>
          {assigned.includes(l.id) && <span className="ml-auto text-podio-teal">✓</span>}
        </button>
      ))}
      {allLabels.length === 0 && (
        <span className="px-2 py-1 text-sm text-podio-meta">No labels yet</span>
      )}
      <button
        onClick={onClose}
        className="mt-1 rounded px-2 py-1 text-left text-xs text-podio-meta hover:bg-podio-row-hover"
      >
        Close
      </button>
    </span>
  );
}
