// Shared field typing for the app builder and item forms.

export type FieldType =
  | "text" | "category" | "date" | "relationship" | "contact"
  | "phone" | "email" | "organization" | "number" | "money"
  | "progress" | "calculation" | "location" | "duration"
  | "image" | "file" | "link" | "separator";

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "category", label: "Category" },
  { value: "contact", label: "Contact (member)" },
  { value: "relationship", label: "Relationship (link items)" },
  { value: "money", label: "Money" },
  { value: "progress", label: "Progress (0–100%)" },
  { value: "duration", label: "Duration" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "link", label: "Link (URL)" },
  { value: "location", label: "Location (address)" },
  { value: "organization", label: "Organization (company)" },
  { value: "image", label: "Image" },
  { value: "file", label: "File" },
  { value: "calculation", label: "Calculation (formula)" },
  { value: "separator", label: "Separator (section divider)" },
];

export type CategoryOption = { id: string; label: string; color: string };

// ---------------------------------------------------------------------------
// Multi-column form layout (beyond-Podio feature).
//
// apps.layout_settings holds { columns: 1 | 2 | 3 } (absent = 1) and each
// field's config may hold { column: 0 | 1 | 2 } (absent = 0). Separator
// fields ignore column assignment: they split the form into SECTIONS, and
// each section renders its own N-column grid. The same section model is used
// by the template editor, the item creation form and the record detail view.

export type LayoutColumns = 1 | 2 | 3;

export function normalizeColumns(value: unknown): LayoutColumns {
  return value === 2 || value === 3 ? value : 1;
}

// Tailwind's JIT can't see dynamic class names like `grid-cols-${n}`, so the
// grid classes live in static maps. FORM_GRID_COLS collapses to one column on
// small screens; EDITOR_GRID_COLS is desktop-only (the builder never shrinks).
export const FORM_GRID_COLS: Record<LayoutColumns, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
};
export const EDITOR_GRID_COLS: Record<LayoutColumns, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

export type LayoutSection<F> = {
  // The separator that opens this section (null for the leading section).
  separator: F | null;
  // One bucket per layout column; `columns.length` always equals the layout's
  // column count. Fields keep their relative (global) order inside a bucket.
  columns: F[][];
};

// Split a flat, ordered field list into sections at every separator field,
// bucketing each section's fields by column. Column indexes ≥ the column
// count clamp into the LAST column so shrinking the layout never hides a
// field. Returns [] for an empty list.
export function splitSections<F extends { type: string }>(
  fields: F[],
  columns: LayoutColumns,
  columnOf: (f: F) => number
): LayoutSection<F>[] {
  const sections: LayoutSection<F>[] = [];
  const open = (separator: F | null): LayoutSection<F> => {
    const s: LayoutSection<F> = {
      separator,
      columns: Array.from({ length: columns }, () => [] as F[]),
    };
    sections.push(s);
    return s;
  };
  let current: LayoutSection<F> | null = null;
  for (const f of fields) {
    if (f.type === "separator") {
      current = open(f);
      continue;
    }
    if (!current) current = open(null);
    const raw = columnOf(f);
    const col = Math.min(
      Math.max(Number.isFinite(raw) ? Math.floor(raw) : 0, 0),
      columns - 1
    );
    current.columns[col].push(f);
  }
  return sections;
}

export const CATEGORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b",
];

export const CURRENCIES = ["USD", "EUR", "GBP", "MXN", "CAD"];

export function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Bucket is private since migration 30: use createSignedUrls server-side
// (or client-side for authenticated users) instead of public URLs.
