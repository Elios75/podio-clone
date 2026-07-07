"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";
import type { CategoryOption } from "@/lib/fields";

type Card = {
  id: string;
  item_number: number;
  title: string | null;
  optionId: string | null;
};
type GroupField = { id: string; label: string };

// Kanban "Board" layout (§5/§6 of the design skill, adapted). Items become
// cards grouped into columns by a single Category field — one column per option
// plus a trailing "No value" column. Dragging a card writes that item's
// category value.
//
// The write is a SURGICAL single-field upsert/delete on item_field_values —
// deliberately NOT the save_item RPC, which deletes and rewrites ALL of an
// item's values from its argument and would wipe every other field when handed
// only the category. RLS (p_ifv_write → can_edit_item) still gates it.
// Trade-off: a drag does not fire activity events / automations (save_item's
// job); that's an accepted v1 limitation for value safety.
export function BoardView({
  fieldId,
  fieldLabel,
  options,
  cards: initialCards,
  baseHref,
  groupFields,
}: {
  fieldId: string;
  fieldLabel: string;
  options: CategoryOption[];
  cards: Card[];
  baseHref: string;
  groupFields: GroupField[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns: { key: string; label: string; color: string; optionId: string | null }[] = [
    ...options.map((o) => ({ key: o.id, label: o.label, color: o.color, optionId: o.id })),
    { key: "__none__", label: "No value", color: "#B8C2C2", optionId: null },
  ];

  async function moveCard(itemId: string, optionId: string | null) {
    const card = cards.find((c) => c.id === itemId);
    if (!card || card.optionId === optionId) return;

    // Optimistic: move the card immediately, remember the prior value to revert.
    const prev = card.optionId;
    setCards((cs) => cs.map((c) => (c.id === itemId ? { ...c, optionId } : c)));
    setBusy(true);
    setError(null);

    const { error: writeError } =
      optionId === null
        ? await supabase
            .from("item_field_values")
            .delete()
            .eq("item_id", itemId)
            .eq("field_id", fieldId)
        : await supabase.from("item_field_values").upsert(
            {
              item_id: itemId,
              field_id: fieldId,
              position: 0,
              value: optionId,
              value_text: optionId,
            },
            { onConflict: "item_id,field_id,position" }
          );

    setBusy(false);
    if (writeError) {
      // Revert the optimistic move and surface the failure.
      setCards((cs) => cs.map((c) => (c.id === itemId ? { ...c, optionId: prev } : c)));
      setError(writeError.message);
      return;
    }
    // Reconcile server-derived counts (views pane, toolbar) with the new value.
    router.refresh();
  }

  return (
    <div>
      {/* Group-by selector — only meaningful when the app has >1 category
          field. Navigates with ?group=<fieldId>; the server re-buckets. */}
      <div className="mb-3 flex items-center gap-2 text-sm text-podio-secondary">
        <PodioIcon icon="board" className="h-4 w-4" />
        <span>Grouped by</span>
        {groupFields.length > 1 ? (
          <select
            value={fieldId}
            onChange={(e) =>
              router.push(`${baseHref}?view=kanban&group=${e.target.value}`)
            }
            className="rounded border border-podio-border bg-white px-2 py-1 text-sm text-podio-ink"
          >
            {groupFields.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-semibold text-podio-ink">{fieldLabel}</span>
        )}
        {error && <span className="ml-2 text-red-600">{error}</span>}
      </div>

      <div className={`flex gap-4 overflow-x-auto pb-4 ${busy ? "opacity-70" : ""}`}>
        {columns.map((col) => {
          const colCards = cards.filter((c) => c.optionId === col.optionId);
          const active = dragOver === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={() => setDragOver((k) => (k === col.key ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                setDragging(null);
                const itemId = e.dataTransfer.getData("text/plain");
                if (itemId) moveCard(itemId, col.optionId);
              }}
              className={`flex w-72 shrink-0 flex-col rounded border ${
                active
                  ? "border-podio-teal bg-podio-row-alt"
                  : "border-podio-border bg-podio-page"
              }`}
            >
              {/* Column header: colored dot + label + count */}
              <div className="flex items-center gap-2 border-b border-podio-border px-3 py-2">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: col.color }}
                />
                <span className="truncate text-sm font-semibold text-podio-ink">
                  {col.label}
                </span>
                <span className="ml-auto rounded bg-white px-1.5 text-xs font-semibold text-podio-meta">
                  {colCards.length}
                </span>
              </div>

              <div className="flex-1 space-y-2 p-2">
                {colCards.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(c.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={`cursor-grab rounded border border-podio-border bg-white p-3 shadow-sm active:cursor-grabbing ${
                      dragging === c.id ? "opacity-40" : "hover:border-podio-teal"
                    }`}
                  >
                    <Link
                      href={`${baseHref}/${c.item_number}`}
                      className="block truncate text-sm font-semibold text-podio-ink hover:text-podio-teal"
                    >
                      {c.title ?? `#${c.item_number}`}
                    </Link>
                    <p className="mt-1 text-xs text-podio-meta">#{c.item_number}</p>
                  </div>
                ))}
                {colCards.length === 0 && (
                  <p className="rounded border border-dashed border-podio-border py-6 text-center text-xs text-podio-meta">
                    Drop here
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
