"use client";

import { useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  FIELD_TYPES,
  CATEGORY_COLORS,
  EDITOR_GRID_COLS,
  normalizeColumns,
  splitSections,
  type FieldType,
  type CategoryOption,
  type LayoutColumns,
  type LayoutSection,
} from "@/lib/fields";
import { PodioIcon } from "@/components/podio-icon";
import { IconPicker } from "@/components/icon-picker";
import { FieldsPalette, FIELD_TYPE_ICONS, shortTypeLabel } from "./fields-palette";

type EditField = {
  id: string | null; // null = new field
  key: string;
  external_id: string | null;
  label: string;
  type: FieldType;
  help_text: string;
  is_required: boolean;
  is_hidden: boolean;
  is_primary: boolean;
  options: CategoryOption[];
  multiple: boolean;      // category
  endDate: boolean;       // date
  formula: string;        // calculation (formula mode)
  calcMode: "formula" | "rollup";
  rollupSource: string;   // relationship field id in the source app
  rollupAgg: string;      // sum | count | avg
  rollupValueField: string;
  defaultValue: string;   // text/number
  column: number;         // layout column (0-based; separators ignore it)
  origType: FieldType | null;
};

// Tiny 3-state column glyph for the layout picker buttons.
function ColumnsGlyph({ n }: { n: LayoutColumns }) {
  const widths: Record<LayoutColumns, number[]> = {
    1: [12],
    2: [5.5, 5.5],
    3: [3.4, 3.4, 3.4],
  };
  let x = 1;
  return (
    <svg viewBox="0 0 14 12" className="h-3.5 w-4" aria-hidden="true" fill="currentColor">
      {widths[n].map((w, i) => {
        const rect = <rect key={i} x={x} y="1" width={w} height="10" rx="1" />;
        x += w + 1;
        return rect;
      })}
    </svg>
  );
}

const NUMERIC_TYPES = ["number", "money", "progress", "duration", "calculation"];

function AiFormulaAssist({
  aiFields,
  onFormula,
}: {
  aiFields: { external_id: string; label: string; type: string }[];
  onFormula: (formula: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setAiError(null);
    setExplanation(null);
    try {
      const res = await fetch("/api/ai/formula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, fields: aiFields }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAiError(data.error ?? "AI request failed");
      } else {
        onFormula(data.formula);
        setExplanation(data.explanation || null);
      }
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button"
        onClick={() => { setOpen(!open); setAiError(null); }}
        title="Write the formula with AI"
        className="rounded border border-podio-border px-1.5 py-1 text-[11px] text-podio-secondary hover:bg-podio-row-hover">
        ✨ AI
      </button>
      {open && (
        <div className="flex w-full items-center gap-1.5">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void generate(); } }}
            placeholder="e.g. 20% commission on deal value"
            className="min-w-0 flex-1 rounded border border-podio-border px-2 py-1 text-xs" />
          <button type="button" onClick={generate} disabled={busy || !prompt.trim()}
            className="rounded-sm bg-podio-teal px-2 py-1 text-[11px] font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50">
            {busy ? "…" : "Generate"}
          </button>
        </div>
      )}
      {explanation && <p className="w-full text-[11px] text-podio-meta">{explanation}</p>}
      {aiError && <p className="w-full text-[11px] text-red-600">{aiError}</p>}
    </>
  );
}

// Small color-swatch dropdown for a category option's chip color.
function ColorSwatch({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Chip color"
        className="flex items-center gap-1 rounded-sm border border-podio-border px-1.5 py-1 hover:bg-podio-row-hover"
      >
        <span className="h-4 w-4 rounded-sm" style={{ backgroundColor: value }} />
        <span className="text-[10px] leading-none text-podio-meta">⌄</span>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 flex gap-1 rounded border border-podio-border bg-white p-1.5 shadow-lg">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Use color ${c}`}
              onClick={() => { onChange(c); setOpen(false); }}
              className={`h-6 w-6 rounded-sm ${c === value ? "ring-2 ring-podio-teal ring-offset-1" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// "Enter a category option" — adds an option on Enter, Podio-style.
function AddOptionInput({ onAdd }: { onAdd: (label: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) {
          e.preventDefault();
          onAdd(value.trim());
          setValue("");
        }
      }}
      placeholder="Enter a category option"
      className="w-full bg-transparent text-sm text-podio-ink placeholder:text-podio-meta focus:outline-none"
    />
  );
}

export function AppEditor({
  app,
  wsName,
  initialFields,
  countByField,
  backHref,
  newHref,
  wsHref,
  revisions,
  rollupSources,
  srcNumFields,
}: {
  app: any;
  wsName: string;
  initialFields: any[];
  countByField: Record<string, number>;
  backHref: string;
  newHref: string;
  wsHref: string;
  revisions: { version: number; created_at: string }[];
  rollupSources: { id: string; label: string; app_id: string }[];
  srcNumFields: { id: string; label: string; app_id: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(app.name);
  const [icon, setIcon] = useState(app.icon ?? "📋");
  const [itemName, setItemName] = useState(app.item_name ?? "Item");
  const [description, setDescription] = useState(app.description ?? "");
  const [fields, setFields] = useState<EditField[]>(
    initialFields.map((f) => ({
      id: f.id,
      key: f.id,
      external_id: f.external_id ?? null,
      label: f.label,
      type: f.type,
      help_text: f.help_text ?? "",
      is_required: f.is_required,
      is_hidden: f.is_hidden,
      is_primary: f.is_primary,
      options: f.config?.options ?? [],
      multiple: f.config?.multiple ?? false,
      endDate: f.config?.end_date ?? false,
      formula: f.config?.formula ?? "",
      calcMode: f.config?.rollup ? "rollup" : "formula",
      rollupSource: f.config?.rollup?.source_field_id ?? "",
      rollupAgg: f.config?.rollup?.agg ?? "sum",
      rollupValueField: f.config?.rollup?.value_field_id ?? "",
      defaultValue:
        f.config?.default !== undefined && f.config?.default !== null
          ? String(f.config.default)
          : "",
      column: typeof f.config?.column === "number" ? f.config.column : 0,
      origType: f.type,
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Insertion indicator while dragging: section + column + position within
  // that column (pos === column length ⇒ the column's bottom drop zone).
  const [overSlot, setOverSlot] = useState<{ sec: number; col: number; pos: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // Layout: how many columns the form renders in (persisted on publish).
  const [columns, setColumns] = useState<LayoutColumns>(
    normalizeColumns(app.layout_settings?.columns)
  );
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [schemaDirty, setSchemaDirty] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);

  const numberTokens = fields
    .filter((f) => NUMERIC_TYPES.includes(f.type) && f.type !== "calculation" && f.external_id)
    .map((f) => ({ token: `{${f.external_id}}`, label: f.label }));

  function upd(key: string, patch: Partial<EditField>) {
    setSchemaDirty(true);
    setFields(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  // --- Section/column model ----------------------------------------------
  // The single global `fields` array stays the source of truth. Sections and
  // per-column buckets are DERIVED views (same splitSections helper as the
  // item form and record view); drops splice back into the global array.
  const sections = splitSections(fields, columns, (f) => f.column);
  const globalIndex = new Map(fields.map((f, i) => [f.key, i]));

  // Move a field one step within ITS OWN column (▲▼ buttons). Swapping two
  // same-column fields in the global array leaves every other column's
  // relative order untouched.
  function moveInColumn(colFields: EditField[], p: number, dir: -1 | 1) {
    const t = p + dir;
    if (t < 0 || t >= colFields.length) return;
    const a = globalIndex.get(colFields[p].key)!;
    const b = globalIndex.get(colFields[t].key)!;
    const next = [...fields];
    [next[a], next[b]] = [next[b], next[a]];
    setSchemaDirty(true);
    setFields(next);
  }

  // Move fields[from] to global index `to` (computed with the field still in
  // place) and assign it to layout column `col`. Removing the field first
  // shifts the target left by one whenever it sat before the insertion point.
  function moveToColumn(from: number, to: number, col: number) {
    if (from < 0 || from >= fields.length) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    const target = Math.max(0, Math.min(from < to ? to - 1 : to, next.length));
    const patched =
      moved.type === "separator" || moved.column === col
        ? moved
        : { ...moved, column: col };
    if (target === from && patched === moved) return; // true no-op
    next.splice(target, 0, patched);
    setSchemaDirty(true);
    setFields(next);
  }

  function remove(f: EditField) {
    const cnt = f.id ? countByField[f.id] ?? 0 : 0;
    if (cnt > 0) {
      const ok = window.confirm(
        `"${f.label}" holds values on ${cnt} item${cnt === 1 ? "" : "s"}. ` +
        `Removing it hides the field and its data from the app (data is kept in the database). Continue?`
      );
      if (!ok) return;
    }
    setSchemaDirty(true);
    setFields(fields.filter((x) => x.key !== f.key));
  }

  // Scroll a freshly added block into view, focus its label input and flash
  // a teal ring so adding a field is never invisible.
  function flashField(key: string) {
    setJustAdded(key);
    requestAnimationFrame(() => {
      document
        .getElementById(`field-block-${key}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      (document.getElementById(`field-label-${key}`) as HTMLInputElement | null)
        ?.focus({ preventScroll: true });
    });
    window.setTimeout(() => setJustAdded((k) => (k === key ? null : k)), 1500);
  }

  function addField(type: FieldType, at?: number, col = 0) {
    const key = crypto.randomUUID();
    const next = [...fields];
    next.splice(at ?? next.length, 0, {
      id: null, key, external_id: null,
      label: "", type,
      help_text: "", is_required: false, is_hidden: false,
      is_primary: false, options: [], multiple: false, endDate: false,
      formula: "", calcMode: "formula", rollupSource: "",
      rollupAgg: "sum", rollupValueField: "", defaultValue: "",
      column: type === "separator" ? 0 : col,
      origType: null,
    });
    setSchemaDirty(true);
    setFields(next);
    flashField(key);
  }

  // --- Native HTML5 drag-and-drop plumbing -------------------------------
  // Two payload kinds, distinguished by custom MIME types (the only thing
  // readable during dragover is `types`; the data itself only on drop):
  //   application/x-field-reorder — index of an existing block being moved
  //   application/x-field-type    — a field type dragged in from the palette
  function isFieldDrag(e: DragEvent) {
    return (
      e.dataTransfer.types.includes("application/x-field-reorder") ||
      e.dataTransfer.types.includes("application/x-field-type")
    );
  }

  // Insertion position inside ONE column from the pointer's Y: before the
  // first block whose vertical midpoint the cursor is above, else at the end
  // (the midpoint technique from the old single-column canvas, per column).
  function posFromPointer(colFields: EditField[], clientY: number): number {
    for (let p = 0; p < colFields.length; p++) {
      const el = document.getElementById(`field-block-${colFields[p].key}`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return p;
    }
    return colFields.length;
  }

  // Map a (section, column, position) slot back to an insertion index in the
  // GLOBAL fields array. Inserting there preserves every column's order:
  //  - before an existing column member ⇒ directly before it globally;
  //  - at the end of a non-empty column ⇒ directly after its last member
  //    (still inside the section, last within that column);
  //  - into an empty column ⇒ right after the section's separator (or at 0
  //    for the leading section) — it becomes the column's sole member and no
  //    other column's relative order changes.
  function globalInsertIndex(
    section: LayoutSection<EditField>,
    colFields: EditField[],
    pos: number
  ): number {
    if (pos < colFields.length) return globalIndex.get(colFields[pos].key)!;
    if (colFields.length > 0)
      return globalIndex.get(colFields[colFields.length - 1].key)! + 1;
    return section.separator ? globalIndex.get(section.separator.key)! + 1 : 0;
  }

  function clearDragState() {
    setDragIndex(null);
    setOverSlot(null);
    setDragging(false);
  }

  function handleColumnDrop(
    e: DragEvent,
    section: LayoutSection<EditField>,
    colFields: EditField[],
    col: number,
    pos: number
  ) {
    if (!isFieldDrag(e) || e.defaultPrevented) return;
    e.preventDefault();
    const reorder = e.dataTransfer.getData("application/x-field-reorder");
    const droppedType = e.dataTransfer.getData("application/x-field-type");
    const index = globalInsertIndex(section, colFields, pos);
    clearDragState();
    if (reorder !== "") {
      moveToColumn(Number(reorder), index, col);
    } else if (FIELD_TYPES.some((t) => t.value === droppedType)) {
      addField(droppedType as FieldType, index, col);
    }
  }

  // Drops ON a separator row insert just before it in the flow (a dragged
  // field keeps its own column; palette drops land in column 0).
  function handleSeparatorDrop(e: DragEvent, sep: EditField) {
    if (!isFieldDrag(e) || e.defaultPrevented) return;
    e.preventDefault();
    const reorder = e.dataTransfer.getData("application/x-field-reorder");
    const droppedType = e.dataTransfer.getData("application/x-field-type");
    const index = globalIndex.get(sep.key)!;
    clearDragState();
    if (reorder !== "") {
      const from = Number(reorder);
      moveToColumn(from, index, fields[from]?.column ?? 0);
    } else if (FIELD_TYPES.some((t) => t.value === droppedType)) {
      addField(droppedType as FieldType, index, 0);
    }
  }

  // Grip handle — the only draggable element on a block, so text selection
  // in the inputs keeps working. Shared by field blocks and separator rows.
  function renderGrip(f: EditField) {
    const i = globalIndex.get(f.key)!;
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-field-reorder", String(i));
          e.dataTransfer.effectAllowed = "move";
          const block = document.getElementById(`field-block-${f.key}`);
          if (block) e.dataTransfer.setDragImage(block, 24, 24);
          setDragIndex(i);
          setDragging(true);
        }}
        onDragEnd={clearDragState}
        title="Drag to reorder"
        aria-label="Drag to reorder"
        className="-ml-1.5 flex shrink-0 cursor-grab items-center self-stretch rounded-sm px-1 text-podio-disabled hover:bg-podio-row-hover hover:text-podio-secondary active:cursor-grabbing"
      >
        <svg viewBox="0 0 10 16" className="h-4 w-2.5" fill="currentColor" aria-hidden="true">
          <circle cx="2.5" cy="2.5" r="1.5" />
          <circle cx="2.5" cy="8" r="1.5" />
          <circle cx="2.5" cy="13.5" r="1.5" />
          <circle cx="7.5" cy="2.5" r="1.5" />
          <circle cx="7.5" cy="8" r="1.5" />
          <circle cx="7.5" cy="13.5" r="1.5" />
        </svg>
      </div>
    );
  }

  // A separator on the canvas: full-width hairline with an inline, optional
  // section-label input. It ignores column assignment and splits the form
  // into sections. Dropping onto the line inserts just before it.
  function renderSeparatorRow(f: EditField, si: number) {
    const i = globalIndex.get(f.key)!;
    const over = overSlot !== null && overSlot.sec === si && overSlot.col === -1;
    return (
      <div
        id={`field-block-${f.key}`}
        onDragOver={(e) => {
          if (!isFieldDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes(
            "application/x-field-reorder"
          )
            ? "move"
            : "copy";
          if (overSlot?.sec !== si || overSlot?.col !== -1)
            setOverSlot({ sec: si, col: -1, pos: 0 });
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setOverSlot((v) => (v && v.sec === si && v.col === -1 ? null : v));
        }}
        onDrop={(e) => handleSeparatorDrop(e, f)}
        className={`flex items-center gap-2 rounded border-t-2 px-1 py-1 ${
          over && dragIndex !== i ? "border-t-podio-teal" : "border-t-transparent"
        } ${dragIndex === i ? "opacity-60" : ""} ${
          justAdded === f.key ? "ring-2 ring-podio-teal" : ""
        }`}
      >
        {renderGrip(f)}
        <PodioIcon icon="separator" className="h-5 w-5 shrink-0 text-podio-secondary" />
        <span className="h-px min-w-6 flex-1 bg-podio-border" aria-hidden />
        <input
          id={`field-label-${f.key}`}
          value={f.label}
          placeholder="Section label (optional)"
          aria-label="Section label"
          onChange={(e) => upd(f.key, { label: e.target.value })}
          className="w-52 shrink-0 bg-transparent text-center text-xs font-semibold uppercase tracking-wide text-podio-meta placeholder:font-normal placeholder:normal-case placeholder:tracking-normal focus:outline-none"
        />
        <span className="h-px min-w-6 flex-1 bg-podio-border" aria-hidden />
        <button
          onClick={() => remove(f)}
          title="Remove separator"
          className="text-sm text-podio-meta hover:text-red-600"
        >
          ✕
        </button>
      </div>
    );
  }

  // Done = publish-and-leave: everything dirty is saved (settings, layout,
  // schema) before navigating back. If any save fails — including schema
  // validation like a missing label — we stay on the page with the error
  // visible instead of discarding work.
  async function done() {
    if (saving) return; // a publish is already in flight
    if (settingsDirty && !(await saveSettings())) return;
    if (layoutDirty) {
      const { error: layoutError } = await supabase
        .from("apps")
        .update({
          layout_settings: { ...(app.layout_settings ?? {}), columns },
        })
        .eq("id", app.id);
      if (layoutError) {
        setError(layoutError.message);
        return;
      }
      setLayoutDirty(false);
    }
    if (schemaDirty && !(await saveSchema())) return;
    router.push(backHref);
  }

  async function saveSettings(): Promise<boolean> {
    setError(null);
    setSaved(null);
    const { error: upError } = await supabase
      .from("apps")
      .update({ name, icon, item_name: itemName || "Item", description: description || null })
      .eq("id", app.id);
    if (upError) {
      setError(upError.message);
      return false;
    }
    setSettingsDirty(false);
    setSaved("Settings saved.");
    router.refresh();
    return true;
  }

  async function saveSchema(): Promise<boolean> {
    setError(null);
    setSaved(null);
    if (fields.some((f) => f.type !== "separator" && !f.label.trim())) {
      setError("Every field needs a label.");
      return false;
    }

    // Warn on type changes for fields with data
    for (const f of fields) {
      if (f.id && f.origType && f.type !== f.origType && (countByField[f.id] ?? 0) > 0) {
        const ok = window.confirm(
          `"${f.label}" changes type ${f.origType} → ${f.type} and holds data on ` +
          `${countByField[f.id]} item(s). Existing values may display incorrectly. Continue?`
        );
        if (!ok) return false;
      }
    }

    setSaving(true);
    const payload = fields.map((f) => {
      const config: any = {};
      if (f.type === "category") {
        config.options = f.options;
        config.multiple = f.multiple;
      }
      if (f.type === "date") config.end_date = f.endDate;
      if (f.type === "calculation") {
        if (f.calcMode === "rollup" && f.rollupSource) {
          config.rollup = {
            source_field_id: f.rollupSource,
            agg: f.rollupAgg,
            value_field_id: f.rollupAgg === "count" ? null : f.rollupValueField || null,
          };
        } else {
          config.formula = f.formula;
        }
      }
      if (["text", "number"].includes(f.type) && f.defaultValue !== "") {
        config.default = f.type === "number" ? Number(f.defaultValue) : f.defaultValue;
      }
      // Layout column rides inside config (absent = column 0; separators span
      // all columns, so they never store one).
      if (f.type !== "separator" && f.column > 0) config.column = f.column;
      return {
        id: f.id,
        label: f.label,
        type: f.type,
        help_text: f.help_text,
        is_required: f.is_required,
        is_hidden: f.is_hidden,
        is_primary: f.is_primary,
        config,
      };
    });
    // Layout (column count) lives on the app row, not in the field schema —
    // persist it with the same publish action, via a plain apps update like
    // the settings save.
    if (layoutDirty) {
      const { error: layoutError } = await supabase
        .from("apps")
        .update({ layout_settings: { ...(app.layout_settings ?? {}), columns } })
        .eq("id", app.id);
      if (layoutError) {
        setSaving(false);
        setError(layoutError.message);
        return false;
      }
      setLayoutDirty(false);
    }

    const { data, error: rpcError } = await supabase.rpc("update_app_schema", {
      p_app: app.id,
      p_fields: payload,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return false;
    }
    setSchemaDirty(false);
    setSaved(`Published schema v${data.version}.`);
    router.refresh();
    return true;
  }

  async function archiveApp() {
    if (!window.confirm(`Archive "${app.name}"? It disappears from the workspace but keeps all data.`))
      return;
    await supabase.from("apps").update({ is_archived: true }).eq("id", app.id);
    router.push(wsHref);
    router.refresh();
  }

  async function deleteApp() {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("delete_app", {
      p_app: app.id,
      p_confirm_name: deleteConfirm,
    });
    if (rpcError) return setError(rpcError.message);
    router.push(wsHref);
    router.refresh();
  }

  const newLabel = `New ${itemName || "Item"}`;

  return (
    <div>
      {/* Builder header bar: grey "New <ItemName>" link + active teal
          "Modify Template" chip + centered breadcrumb + Publish. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-podio-border bg-white px-4 pt-2">
        <Link
          href={newHref}
          className="mb-2 rounded-sm bg-podio-row-hover px-3 py-1.5 text-sm font-semibold text-podio-ink hover:bg-podio-border"
        >
          {newLabel}
        </Link>
        <span className="self-end rounded-t bg-podio-teal px-4 py-2.5 text-sm font-semibold text-white">
          Modify Template
        </span>

        {/* Center: breadcrumb */}
        <nav className="mx-auto mb-2 hidden items-center gap-1.5 text-sm lg:flex">
          <Link href={wsHref} className="text-podio-teal hover:underline">
            {wsName}
          </Link>
          <span className="text-podio-meta">›</span>
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-podio-teal hover:underline"
          >
            <PodioIcon icon={icon} name={name} className="h-5 w-5" />
            {name}
          </Link>
          <span className="text-podio-meta">›</span>
          <span className="text-podio-ink">{newLabel}</span>
        </nav>

        {/* Right: back to app + publish */}
        <div className="mb-2 ml-auto flex items-center gap-3 lg:ml-0">
          <Link href={backHref} className="text-sm text-podio-secondary hover:text-podio-ink">
            Back to app
          </Link>
          <button
            onClick={saveSchema}
            disabled={saving}
            className="rounded-sm bg-podio-teal px-4 py-2 text-sm font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50"
          >
            {saving ? "Publishing…" : "Publish changes"}
          </button>
        </div>
      </div>

      {/* Two-column body: fields palette + canvas */}
      <div className="flex items-start gap-4 p-4 lg:gap-6 lg:p-6">
        <FieldsPalette
          onAdd={addField}
          onDone={done}
          onDragStateChange={(d) => {
            setDragging(d);
            if (!d) setOverSlot(null);
          }}
        />

        <section className="min-w-0 flex-1 space-y-3">
          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {saved && (
            <p className="rounded border border-podio-border bg-white px-3 py-2 text-sm text-podio-teal">
              {saved}
            </p>
          )}

          {/* Quiet collapsible app-settings block */}
          <div className="rounded border border-podio-border bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              <PodioIcon icon="gear" className="h-5 w-5 text-podio-secondary" />
              <span className="text-sm font-semibold text-podio-ink">App settings</span>
              <span className="ml-auto text-podio-meta">{settingsOpen ? "⌃" : "⌄"}</span>
            </button>
            {settingsOpen && (
              <div className="space-y-3 border-t border-podio-border px-4 py-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIconOpen(!iconOpen)}
                    title="App icon"
                    className="flex h-10 w-12 shrink-0 items-center justify-center rounded-sm border border-podio-border hover:bg-podio-row-hover"
                  >
                    <PodioIcon icon={icon} name={name} className="h-6 w-6 text-podio-secondary" />
                  </button>
                  <input
                    value={name}
                    aria-label="App name"
                    onChange={(e) => { setName(e.target.value); setSettingsDirty(true); }}
                    className="min-w-0 flex-1 rounded-sm border border-podio-border px-3 py-2 text-sm text-podio-ink focus:border-podio-teal focus:outline-none"
                  />
                  <input
                    value={itemName}
                    aria-label="Item name"
                    title="What one record is called (Task, Lead, …)"
                    onChange={(e) => { setItemName(e.target.value); setSettingsDirty(true); }}
                    className="w-32 rounded-sm border border-podio-border px-3 py-2 text-sm text-podio-ink focus:border-podio-teal focus:outline-none"
                  />
                </div>
                {iconOpen && (
                  <IconPicker
                    value={icon}
                    onChange={(k) => { setIcon(k); setSettingsDirty(true); }}
                  />
                )}
                <textarea
                  placeholder="Description (optional)"
                  rows={2}
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setSettingsDirty(true); }}
                  className="w-full rounded-sm border border-podio-border px-3 py-2 text-sm text-podio-ink placeholder:text-podio-meta focus:border-podio-teal focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveSettings}
                    className="rounded-sm bg-podio-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-podio-teal-dark"
                  >
                    Save settings
                  </button>
                  <button
                    onClick={archiveApp}
                    className="rounded-sm border border-amber-200 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50"
                  >
                    Archive app
                  </button>
                  <button
                    onClick={() => setDeleteOpen(!deleteOpen)}
                    className="rounded-sm border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete permanently
                  </button>
                </div>

                {deleteOpen && (
                  <div className="mt-3 rounded border border-red-300 bg-red-50 p-3">
                    <p className="text-xs text-red-800">
                      This permanently deletes the app and <strong>all its items,
                      values, comments, tasks, views, and automations</strong>. This
                      cannot be undone. Type the app name <strong>{app.name}</strong> to
                      confirm:
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder={app.name}
                        className="flex-1 rounded-sm border border-red-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none"
                      />
                      <button
                        onClick={deleteApp}
                        disabled={deleteConfirm !== app.name}
                        className="rounded-sm bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                      >
                        Delete forever
                      </button>
                      <button onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); }}
                        className="rounded-sm border border-podio-border px-3 py-1.5 text-sm hover:bg-podio-row-hover">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Layout picker (beyond-Podio): single / dual / three columns */}
          <div className="rounded border border-podio-border bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-sm font-semibold text-podio-ink">Layout</span>
              <div className="inline-flex overflow-hidden rounded border border-podio-border">
                {(
                  [
                    [1, "Single column"],
                    [2, "Two columns"],
                    [3, "Three columns"],
                  ] as [LayoutColumns, string][]
                ).map(([n, label], bi) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={columns === n}
                    onClick={async () => {
                      if (columns === n) return;
                      setColumns(n);
                      // Persist immediately — the column count is app chrome,
                      // not field schema, so it must not be lost when the user
                      // leaves without publishing.
                      const { error: layoutError } = await supabase
                        .from("apps")
                        .update({
                          layout_settings: {
                            ...(app.layout_settings ?? {}),
                            columns: n,
                          },
                        })
                        .eq("id", app.id);
                      if (layoutError) {
                        // Fall back to publish-time persistence.
                        setLayoutDirty(true);
                        setError(layoutError.message);
                      } else {
                        setLayoutDirty(false);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${
                      bi > 0 ? "border-l border-podio-border" : ""
                    } ${
                      columns === n
                        ? "bg-podio-teal text-white"
                        : "bg-white text-podio-secondary hover:bg-podio-row-hover"
                    }`}
                  >
                    <ColumnsGlyph n={n} />
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-podio-meta">
                Drag fields into any column. Separators always span the full width.
              </span>
            </div>
          </div>

          <p className="px-1 text-xs text-podio-meta">
            Schema v{app.schema_version} — changes apply when you publish. Removed
            fields keep their data and can be restored by support.
          </p>

          {/* Canvas: sections split at every separator; each section renders
              its own N-column grid and every column is a full-height drop
              target with pointer-midpoint insertion. While dragging over an
              empty canvas, a single empty section still offers drop zones. */}
          {(fields.length === 0 && dragging
            ? ([
                {
                  separator: null,
                  columns: Array.from({ length: columns }, () => []),
                },
              ] as LayoutSection<EditField>[])
            : sections
          ).map((sec, si) => (
            <div key={si} className="space-y-3">
              {sec.separator && renderSeparatorRow(sec.separator, si)}
              <div className={`grid gap-4 ${EDITOR_GRID_COLS[columns]}`}>
                {sec.columns.map((colFields, ci) => (
                  <div
                    key={ci}
                    className="min-w-0 space-y-3"
                    onDragOver={(e) => {
                      if (!isFieldDrag(e)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(
                        "application/x-field-reorder"
                      )
                        ? "move"
                        : "copy";
                      const pos = posFromPointer(colFields, e.clientY);
                      if (
                        overSlot?.sec !== si ||
                        overSlot?.col !== ci ||
                        overSlot?.pos !== pos
                      )
                        setOverSlot({ sec: si, col: ci, pos });
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                        setOverSlot((v) =>
                          v && v.sec === si && v.col === ci ? null : v
                        );
                    }}
                    onDrop={(e) =>
                      handleColumnDrop(
                        e,
                        sec,
                        colFields,
                        ci,
                        posFromPointer(colFields, e.clientY)
                      )
                    }
                  >
          {colFields.map((f, p) => {
            const i = globalIndex.get(f.key)!;
            const cnt = f.id ? countByField[f.id] ?? 0 : 0;
            const over =
              overSlot !== null &&
              overSlot.sec === si &&
              overSlot.col === ci &&
              overSlot.pos === p;
            return (
              <div
                key={f.key}
                id={`field-block-${f.key}`}
                className={`rounded border bg-white shadow-sm ${
                  dragIndex === i ? "border-podio-teal opacity-60" : "border-podio-border"
                } ${
                  over && dragIndex !== i
                    ? "border-t-2 border-t-podio-teal"
                    : ""
                } ${justAdded === f.key ? "ring-2 ring-podio-teal" : ""}`}
              >
                <div className="flex items-start gap-3 p-4">
                  {renderGrip(f)}
                  {/* Type indicator: icon + ⌄ with an invisible select on top
                      so changing the type keeps working. */}
                  <div
                    className="relative flex shrink-0 items-center gap-1 rounded-sm border border-transparent px-1.5 py-1.5 text-podio-secondary hover:border-podio-border"
                    title={shortTypeLabel(FIELD_TYPES.find((t) => t.value === f.type)?.label ?? f.type)}
                  >
                    <PodioIcon icon={FIELD_TYPE_ICONS[f.type]} className="h-6 w-6" />
                    <span className="text-xs leading-none text-podio-meta">⌄</span>
                    <select
                      value={f.type}
                      aria-label="Field type"
                      onChange={(e) => upd(f.key, { type: e.target.value as FieldType })}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Large underlined label input */}
                    <input
                      id={`field-label-${f.key}`}
                      value={f.label}
                      placeholder="Field label"
                      onChange={(e) => upd(f.key, { label: e.target.value })}
                      className="w-full border-b border-podio-border bg-transparent pb-1 text-xl font-semibold text-podio-ink placeholder:font-normal placeholder:text-podio-meta focus:border-podio-teal focus:outline-none"
                    />

                    {/* Subtle settings row: help text + toggles */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-podio-secondary">
                      <input placeholder="Help text shown under the field"
                        value={f.help_text}
                        onChange={(e) => upd(f.key, { help_text: e.target.value })}
                        className="min-w-40 flex-1 rounded-sm border border-podio-border px-2 py-1 text-xs placeholder:text-podio-meta focus:border-podio-teal focus:outline-none" />
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={f.is_required}
                          onChange={(e) => upd(f.key, { is_required: e.target.checked })} />
                        required
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={f.is_hidden}
                          onChange={(e) => upd(f.key, { is_hidden: e.target.checked })} />
                        hidden
                      </label>
                      <label className="flex items-center gap-1" title="Value becomes the item title">
                        <input type="radio" name="primary" checked={f.is_primary}
                          onChange={() => {
                            setSchemaDirty(true);
                            setFields(fields.map((x) => ({ ...x, is_primary: x.key === f.key })));
                          }} />
                        title field
                      </label>
                    </div>

                    {["text", "number"].includes(f.type) && (
                      <div className="mt-3">
                        <input
                          placeholder={`Default value (optional)`}
                          value={f.defaultValue}
                          type={f.type === "number" ? "number" : "text"}
                          onChange={(e) => upd(f.key, { defaultValue: e.target.value })}
                          className="w-64 rounded-sm border border-podio-border px-2 py-1 text-xs placeholder:text-podio-meta focus:border-podio-teal focus:outline-none"
                        />
                      </div>
                    )}

                    {f.type === "date" && (
                      <label className="mt-3 flex items-center gap-1.5 text-xs text-podio-secondary">
                        <input type="checkbox" checked={f.endDate}
                          onChange={(e) => upd(f.key, { endDate: e.target.checked })} />
                        Allow an end date (date range)
                      </label>
                    )}

                    {f.type === "calculation" && (
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <select value={f.calcMode}
                            onChange={(e) => upd(f.key, { calcMode: e.target.value as any })}
                            className="rounded-sm border border-podio-border px-1.5 py-1 text-xs">
                            <option value="formula">Formula (this item)</option>
                            <option value="rollup">Rollup (related items)</option>
                          </select>
                          {f.calcMode === "rollup" && (
                            <>
                              <select value={f.rollupAgg}
                                onChange={(e) => upd(f.key, { rollupAgg: e.target.value })}
                                className="rounded-sm border border-podio-border px-1.5 py-1 text-xs">
                                <option value="sum">Sum of</option>
                                <option value="avg">Average of</option>
                                <option value="count">Count of</option>
                              </select>
                              {f.rollupAgg !== "count" && (
                                <select value={f.rollupValueField}
                                  onChange={(e) => upd(f.key, { rollupValueField: e.target.value })}
                                  className="rounded-sm border border-podio-border px-1.5 py-1 text-xs">
                                  <option value="">— number field —</option>
                                  {srcNumFields
                                    .filter((nf) =>
                                      nf.app_id ===
                                      rollupSources.find((s) => s.id === f.rollupSource)?.app_id)
                                    .map((nf) => (
                                      <option key={nf.id} value={nf.id}>{nf.label}</option>
                                    ))}
                                </select>
                              )}
                              <span className="text-podio-meta">from</span>
                              <select value={f.rollupSource}
                                onChange={(e) => upd(f.key, { rollupSource: e.target.value, rollupValueField: "" })}
                                className="rounded-sm border border-podio-border px-1.5 py-1 text-xs">
                                <option value="">— relationship —</option>
                                {rollupSources.map((s) => (
                                  <option key={s.id} value={s.id}>{s.label}</option>
                                ))}
                              </select>
                            </>
                          )}
                        </div>
                        {f.calcMode === "rollup" && rollupSources.length === 0 && (
                          <p className="text-[11px] text-amber-600">
                            No other app in this workspace has a relationship field pointing here yet.
                          </p>
                        )}
                        {f.calcMode === "formula" && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            placeholder="Formula, e.g. {deal-value-1} * 0.2"
                            value={f.formula}
                            onChange={(e) => upd(f.key, { formula: e.target.value })}
                            className="min-w-0 flex-1 rounded-sm border border-podio-border px-2 py-1 font-mono text-xs focus:border-podio-teal focus:outline-none"
                          />
                          <AiFormulaAssist
                            aiFields={fields
                              .filter((x) => ["number", "money", "progress"].includes(x.type) && x.external_id)
                              .map((x) => ({ external_id: x.external_id as string, label: x.label, type: x.type }))}
                            onFormula={(v) => upd(f.key, { formula: v })}
                          />
                        </div>
                        )}
                        <p className="text-[11px] text-podio-meta">
                          Tokens:{" "}
                          {numberTokens.length > 0
                            ? numberTokens.map((t) => (
                                <button key={t.token} type="button"
                                  onClick={() => upd(f.key, { formula: f.formula + t.token })}
                                  className="mr-1 rounded bg-podio-row-alt px-1 font-mono hover:bg-podio-row-hover"
                                  title={t.label}>
                                  {t.token}
                                </button>
                              ))
                            : "add number/money/progress fields first"}
                          {" "}Operators: + − × ÷ and parentheses. Recomputes on every save.
                        </p>
                      </div>
                    )}

                    {f.type === "category" && (
                      <div className="mt-3 space-y-2">
                        <label className="flex items-center gap-1.5 text-xs text-podio-secondary">
                          <input type="checkbox" checked={f.multiple}
                            onChange={(e) => upd(f.key, { multiple: e.target.checked })} />
                          Allow multiple selections
                        </label>

                        {/* Option rows: label + chip-color swatch, Podio-style */}
                        <div className="overflow-hidden rounded border border-podio-border">
                          {f.options.map((o, oi) => (
                            <div
                              key={o.id}
                              className={`flex items-center gap-2 px-3 py-2 ${
                                oi > 0 ? "border-t border-podio-border" : ""
                              }`}
                            >
                              <input value={o.label}
                                aria-label="Option label"
                                onChange={(e) => upd(f.key, {
                                  options: f.options.map((x) => x.id === o.id ? { ...x, label: e.target.value } : x),
                                })}
                                className="min-w-0 flex-1 bg-transparent text-sm text-podio-ink focus:outline-none" />
                              <ColorSwatch
                                value={o.color}
                                onChange={(c) => upd(f.key, {
                                  options: f.options.map((x) => x.id === o.id ? { ...x, color: c } : x),
                                })}
                              />
                              <button
                                onClick={() => upd(f.key, { options: f.options.filter((x) => x.id !== o.id) })}
                                title="Remove option"
                                className="text-xs text-podio-meta hover:text-red-600">✕</button>
                            </div>
                          ))}
                          <div className={`bg-podio-row-alt px-3 py-2 ${
                            f.options.length > 0 ? "border-t border-podio-border" : ""
                          }`}>
                            <AddOptionInput
                              onAdd={(label) => upd(f.key, {
                                options: [...f.options, {
                                  id: crypto.randomUUID(),
                                  label,
                                  color: CATEGORY_COLORS[f.options.length % CATEGORY_COLORS.length],
                                }],
                              })}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right controls: badges, reorder, remove */}
                  <div className="flex shrink-0 items-center gap-2 pt-1">
                    {f.id ? (
                      <span className="rounded bg-podio-row-alt px-2 py-0.5 text-[11px] text-podio-meta"
                        title="Items holding a value for this field">
                        {cnt} value{cnt === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="rounded bg-podio-row-hover px-2 py-0.5 text-[11px] font-semibold text-podio-teal">
                        new
                      </span>
                    )}
                    <div className="flex flex-col leading-none">
                      <button onClick={() => moveInColumn(colFields, p, -1)} title="Move up"
                        className="text-xs text-podio-meta hover:text-podio-ink">▲</button>
                      <button onClick={() => moveInColumn(colFields, p, 1)} title="Move down"
                        className="text-xs text-podio-meta hover:text-podio-ink">▼</button>
                    </div>
                    <button onClick={() => remove(f)} title="Remove field"
                      className="text-sm text-podio-meta hover:text-red-600">✕</button>
                  </div>
                </div>
              </div>
            );
          })}

                    {/* Per-column drop zone — only visible mid-drag, catches
                        drops below the column's last block (and drops into an
                        empty column). */}
                    {dragging && (
                      <div
                        className={`rounded border-2 border-dashed px-4 py-6 text-center text-sm ${
                          overSlot !== null &&
                          overSlot.sec === si &&
                          overSlot.col === ci &&
                          overSlot.pos === colFields.length
                            ? "border-podio-teal bg-podio-row-alt text-podio-teal"
                            : "border-podio-border text-podio-meta"
                        }`}
                      >
                        Drop a field here
                      </div>
                    )}
                    {!dragging && colFields.length === 0 && columns > 1 && (
                      <div className="rounded border border-dashed border-podio-border px-4 py-6 text-center text-xs text-podio-meta">
                        Empty column — drag fields here
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {fields.length === 0 && !dragging && (
            <div className="rounded border border-dashed border-podio-border bg-white p-8 text-center text-sm text-podio-meta">
              Click a field type in the palette — or drag one here — to add
              your first field.
            </div>
          )}

          {/* Schema history */}
          {revisions.length > 0 && (
            <div className="rounded border border-podio-border bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-podio-ink">Schema history</p>
              <ul className="mt-2 space-y-1">
                {revisions.map((r) => (
                  <li key={r.version} className="flex justify-between text-xs text-podio-meta">
                    <span>v{r.version}</span>
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
