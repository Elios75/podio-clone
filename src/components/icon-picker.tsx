"use client";

import { useState } from "react";
import { PodioIcon, PODIO_ICONS } from "@/components/podio-icon";

// Searchable app-icon picker: a small inline (in-flow, never absolutely
// positioned) panel with a filter input and a scrollable grid of the
// PODIO_ICONS line glyphs. Picking an icon does NOT close the panel — the
// parent owns open/close (usually via the square icon button that toggles
// it). This is the standard way to choose an app icon in the clone.
export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const icons = q
    ? PODIO_ICONS.filter(
        (i) => i.key.includes(q) || i.label.toLowerCase().includes(q)
      )
    : PODIO_ICONS;

  return (
    <div className="rounded border border-podio-border bg-white p-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons…"
        aria-label="Search icons"
        className="mb-2 w-full rounded-sm border border-podio-border px-2 py-1.5 text-sm text-podio-ink placeholder:text-podio-meta focus:border-podio-teal focus:outline-none"
      />
      <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto">
        {icons.map((i) => (
          <button
            key={i.key}
            type="button"
            title={i.label}
            onClick={() => onChange(i.key)}
            className={`flex h-9 w-9 items-center justify-center rounded ${
              value === i.key
                ? "bg-podio-row-hover ring-1 ring-podio-teal"
                : "hover:bg-podio-row-alt"
            }`}
          >
            <PodioIcon icon={i.key} className="h-5 w-5 text-podio-secondary" />
          </button>
        ))}
        {icons.length === 0 && (
          <p className="col-span-8 py-3 text-center text-sm text-podio-meta">
            No icons match &ldquo;{query}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
