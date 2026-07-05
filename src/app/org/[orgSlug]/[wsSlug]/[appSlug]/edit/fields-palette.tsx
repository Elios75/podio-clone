"use client";

import { PodioIcon } from "@/components/podio-icon";
import { FIELD_TYPES, type FieldType } from "@/lib/fields";

// Monochrome line-icon key for every field type the builder supports.
// Shared by the palette and the canvas blocks' type indicator.
export const FIELD_TYPE_ICONS: Record<FieldType, string> = {
  text: "text-a",
  category: "grid",
  date: "calendar",
  relationship: "link",
  contact: "contact",
  phone: "phone",
  email: "mail",
  organization: "people",
  number: "hash",
  money: "money",
  progress: "progress",
  calculation: "calc",
  location: "pin",
  duration: "clock",
  image: "image",
  file: "paperclip",
  link: "globe",
  separator: "separator",
};

// Podio lists the everyday types first (Text, Category, Date, Relationship,
// Contact, Phone, Email, Number, Link, Money, …). Order the existing
// FIELD_TYPES list accordingly; anything unlisted sinks to the bottom.
const PALETTE_ORDER: FieldType[] = [
  "text", "category", "date", "relationship", "contact", "phone",
  "email", "number", "link", "money", "progress", "duration",
  "location", "organization", "image", "file", "calculation", "separator",
];

// "Contact (member)" → "Contact" for the compact palette rows.
export function shortTypeLabel(label: string): string {
  return label.replace(/\s*\(.*\)$/, "");
}

export function FieldsPalette({
  onAdd,
  onDone,
  onDragStateChange,
}: {
  onAdd: (type: FieldType) => void;
  onDone: () => void;
  // Lets the canvas show its "Drop a field here" zone while a palette row
  // is mid-drag (native DnD has no global "is dragging" signal).
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const types = [...FIELD_TYPES].sort(
    (a, b) => PALETTE_ORDER.indexOf(a.value) - PALETTE_ORDER.indexOf(b.value)
  );
  return (
    <aside className="sticky top-4 w-64 shrink-0 self-start rounded border border-podio-border bg-white shadow-sm">
      <div className="flex items-center border-b border-podio-border px-4 py-3">
        <h2 className="text-lg font-semibold text-podio-teal">Fields</h2>
        <PodioIcon icon="wrench" className="ml-auto h-[18px] w-[18px] text-podio-meta" />
      </div>
      <ul className="max-h-[55vh] overflow-y-auto py-1">
        {types.map((t) => {
          const label = shortTypeLabel(t.label);
          return (
            <li key={t.value}>
              <button
                type="button"
                onClick={() => onAdd(t.value)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-field-type", t.value);
                  e.dataTransfer.effectAllowed = "copy";
                  onDragStateChange?.(true);
                }}
                onDragEnd={() => onDragStateChange?.(false)}
                title={`Add a ${label} field (click, or drag into the template)`}
                className="flex w-full cursor-grab items-center gap-3 px-4 py-2 text-left text-[15px] text-podio-ink hover:bg-podio-row-hover active:cursor-grabbing"
              >
                <PodioIcon
                  icon={FIELD_TYPE_ICONS[t.value]}
                  className="h-5 w-5 shrink-0 text-podio-secondary"
                />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-podio-border p-3">
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-sm bg-podio-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-podio-teal-dark"
        >
          Done
        </button>
      </div>
    </aside>
  );
}
