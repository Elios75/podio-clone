// Shared field typing for the app builder and item forms.

export type FieldType =
  | "text" | "category" | "date" | "relationship" | "contact"
  | "phone" | "email" | "organization" | "number" | "money"
  | "progress" | "calculation" | "location" | "duration"
  | "image" | "file" | "link" | "separator" | "table";

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "category", label: "Category" },
  { value: "contact", label: "Contact (member)" },
  { value: "relationship", label: "Relationship (link items)" },
  { value: "table", label: "Table (rows)" },
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

// Field types that can't be filtered or sorted (no scalar ordering / no
// query_items support). Drives the view toolbar's field pickers AND the
// sheet's clickable column headers — keep the two in sync via this list.
// Lives here (not in a "use client" module) so server components can read it.
export const NON_SORTABLE_FIELD_TYPES: readonly FieldType[] = [
  "separator", "calculation", "image", "file", "relationship", "table",
];

// ---------------------------------------------------------------------------
// Table field (beyond-Podio feature): an embedded one-to-many sub-table
// inside a record (e.g. a Customer with invoice lines: Date, Product,
// Amount).
//
// app_fields.config for a table field:
//   { columns: TableColumn[], currency?: "USD" }
// item_field_values.value for a table field:
//   { rows: [ { "<columnId>": string | number | boolean | null, ... } ] }
// (dates as ISO "YYYY-MM-DD" strings; money cells as plain numbers — the
// currency lives once on the field config). value_text mirrors a human
// summary ("3 rows") so search and generic renderers degrade gracefully.

export type TableColumnType =
  | "text" | "number" | "money" | "date" | "checkbox" | "category";

export type TableColumn = {
  id: string;
  label: string;
  type: TableColumnType;
  options?: CategoryOption[]; // category columns only
};

export type TableRow = Record<string, string | number | boolean | null>;

export const TABLE_COLUMN_TYPES: { value: TableColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "money", label: "Money" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "category", label: "Category" },
];

// Currency prefix for money cells and summaries (default USD).
export function currencySymbol(code: string | undefined): string {
  const map: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", MXN: "MX$", CAD: "CA$",
  };
  return map[code ?? "USD"] ?? `${code} `;
}

// Fixed locale so server and client render identical strings (hydration).
function formatCellNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Per-column sums for the totals footer: only number + money columns total.
export function tableColumnTotals(
  rows: TableRow[],
  columns: TableColumn[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const c of columns) {
    if (c.type !== "number" && c.type !== "money") continue;
    let sum = 0;
    for (const r of rows) {
      const v = r?.[c.id];
      if (typeof v === "number" && Number.isFinite(v)) sum += v;
    }
    totals[c.id] = sum;
  }
  return totals;
}

// Compact summary for sheet cells / exports: "3 rows · $1,250" (count + sum
// of the FIRST money column, else first number column, else count only).
// Tolerates any malformed value/config — never throws.
export function tableSummary(
  value: unknown,
  config?: { columns?: TableColumn[]; currency?: string } | null
): string {
  const rows: TableRow[] = Array.isArray((value as any)?.rows)
    ? (value as any).rows
    : [];
  const count = `${rows.length} row${rows.length === 1 ? "" : "s"}`;
  const columns = Array.isArray(config?.columns) ? config!.columns! : [];
  const sumCol =
    columns.find((c) => c?.type === "money") ??
    columns.find((c) => c?.type === "number");
  if (!sumCol || rows.length === 0) return count;
  const sum = tableColumnTotals(rows, [sumCol])[sumCol.id] ?? 0;
  const formatted =
    sumCol.type === "money"
      ? `${currencySymbol(config?.currency)}${formatCellNumber(sum)}`
      : formatCellNumber(sum);
  return `${count} · ${formatted}`;
}

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
  // A full-width field (e.g. a table field) that opens this segment: it
  // renders across every layout column, like separators do, but keeps its
  // form-field chrome (label, help text). Null for ordinary sections.
  fullWidth: F | null;
  // One bucket per layout column; `columns.length` always equals the layout's
  // column count. Fields keep their relative (global) order inside a bucket.
  columns: F[][];
};

// Split a flat, ordered field list into sections at every separator field,
// bucketing each section's fields by column. Fields matched by `isFullWidth`
// (table fields) also open a new segment — they span all columns, and the
// fields after them continue in a fresh column grid. Column indexes ≥ the
// column count clamp into the LAST column so shrinking the layout never
// hides a field. Returns [] for an empty list.
export function splitSections<F extends { type: string }>(
  fields: F[],
  columns: LayoutColumns,
  columnOf: (f: F) => number,
  isFullWidth: (f: F) => boolean = (f) => f.type === "table"
): LayoutSection<F>[] {
  const sections: LayoutSection<F>[] = [];
  const open = (separator: F | null, fullWidth: F | null = null): LayoutSection<F> => {
    const s: LayoutSection<F> = {
      separator,
      fullWidth,
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
    if (isFullWidth(f)) {
      current = open(null, f);
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
