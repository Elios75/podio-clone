"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CategoryOption } from "@/lib/fields";

type Card = {
  id: string;
  item_number: number;
  title: string | null;
  optionId: string | null;
};

export function BoardView({
  fieldId,
  options,
  cards,
  baseHref,
}: {
  fieldId: string;
  options: CategoryOption[];
  cards: Card[];
  baseHref: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const columns: { key: string; label: string; color: string; optionId: string | null }[] = [
    ...options.map((o) => ({ key: o.id, label: o.label, color: o.color, optionId: o.id })),
    { key: "__none__", label: "No value", color: "#cbd5e1", optionId: null },
  ];

  async function moveCard(itemId: string, optionId: string | null) {
    setBusy(true);
    if (optionId === null) {
      await supabase
        .from("item_field_values")
        .delete()
        .eq("item_id", itemId)
        .eq("field_id", fieldId);
    } else {
      await supabase.from("item_field_values").upsert(
        {
          item_id: itemId,
          field_id: fieldId,
          position: 0,
          value: optionId,
          value_text: optionId,
        },
        { onConflict: "item_id,field_id,position" }
      );
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className={`flex gap-4 overflow-x-auto pb-4 ${busy ? "opacity-60" : ""}`}>
      {columns.map((col) => {
        const colCards = cards.filter((c) => c.optionId === col.optionId);
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.key);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const itemId = e.dataTransfer.getData("text/plain");
              if (itemId) moveCard(itemId, col.optionId);
            }}
            className={`w-64 shrink-0 rounded-lg border p-3 ${
              dragOver === col.key
                ? "border-blue-400 bg-blue-50"
                : "border-slate-200 bg-slate-100/60"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: col.color }}
              />
              <span className="text-sm font-medium">{col.label}</span>
              <span className="ml-auto text-xs text-slate-400">{colCards.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {colCards.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                  className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
                >
                  <Link
                    href={`${baseHref}/${c.item_number}`}
                    className="text-sm font-medium hover:text-blue-600"
                  >
                    {c.title ?? `#${c.item_number}`}
                  </Link>
                  <p className="mt-1 text-xs text-slate-400">#{c.item_number}</p>
                </div>
              ))}
              {colCards.length === 0 && (
                <p className="rounded border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400">
                  Drop here
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
