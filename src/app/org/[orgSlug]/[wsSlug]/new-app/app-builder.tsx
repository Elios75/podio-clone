"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/slug";
import { PodioIcon } from "@/components/podio-icon";
import { IconPicker } from "@/components/icon-picker";
import {
  FIELD_TYPES,
  CATEGORY_COLORS,
  type FieldType,
  type CategoryOption,
} from "@/lib/fields";

type DraftField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: CategoryOption[]; // category
  relatedAppId: string;      // relationship
  formula: string;           // calculation
};

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
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
        ✨ AI
      </button>
      {open && (
        <div className="flex w-full items-center gap-1.5">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void generate(); } }}
            placeholder="e.g. 20% commission on deal value"
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
          <button type="button" onClick={generate} disabled={busy || !prompt.trim()}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? "…" : "Generate"}
          </button>
        </div>
      )}
      {explanation && <p className="w-full text-xs text-slate-400">{explanation}</p>}
      {aiError && <p className="w-full text-xs text-red-600">{aiError}</p>}
    </>
  );
}

function draftField(label: string, type: FieldType, required = false): DraftField {
  return {
    key: crypto.randomUUID(),
    label,
    type,
    required,
    options: [],
    relatedAppId: "",
    formula: "",
  };
}

export function AppBuilder({
  wsId,
  orgSlug,
  wsSlug,
  workspaceApps,
  initialName = "",
  initialItemName = "Item",
  initialIcon = "📋",
  initialType = "standard",
}: {
  wsId: string;
  orgSlug: string;
  wsSlug: string;
  workspaceApps: { id: string; name: string }[];
  initialName?: string;
  initialItemName?: string;
  initialIcon?: string;
  initialType?: "standard" | "event" | "contact";
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(initialIcon);
  const [iconOpen, setIconOpen] = useState(false);
  const [itemName, setItemName] = useState(initialItemName);
  const [fields, setFields] = useState<DraftField[]>(() => {
    // Default fields, plus type-specific seeds from the Create New App modal.
    const seeded = [draftField("Title", "text", true)];
    if (initialType === "event") {
      seeded.push(draftField("Date", "date"));
    } else if (initialType === "contact") {
      seeded.push(draftField("Phone", "phone"), draftField("Email", "email"));
    }
    return seeded;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addField() {
    setFields([
      ...fields,
      { key: crypto.randomUUID(), label: "", type: "text", required: false, options: [], relatedAppId: "", formula: "" },
    ]);
  }

  function updateField(key: string, patch: Partial<DraftField>) {
    setFields(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function removeField(key: string) {
    setFields(fields.filter((f) => f.key !== key));
  }

  function moveField(index: number, dir: -1 | 1) {
    const next = [...fields];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) return setError("App name is required.");
    if (fields.some((f) => !f.label.trim()))
      return setError("Every field needs a label.");
    const badRel = fields.find((f) => f.type === "relationship" && !f.relatedAppId);
    if (badRel)
      return setError(`Pick a related app for "${badRel.label}".`);
    setSaving(true);

    const { data: app, error: appError } = await supabase
      .from("apps")
      .insert({
        workspace_id: wsId,
        name,
        slug: slugify(name),
        icon,
        item_name: itemName || "Item",
      })
      .select()
      .single();

    if (appError) {
      setSaving(false);
      setError(
        appError.message.includes("duplicate key")
          ? "An app with that name already exists in this workspace."
          : appError.message
      );
      return;
    }

    const firstTextIndex = fields.findIndex((f) => f.type === "text");
    const rows = fields.map((f, i) => ({
      app_id: app.id,
      external_id: `${slugify(f.label)}-${i}`,
      label: f.label,
      type: f.type,
      is_required: f.required,
      is_primary: i === firstTextIndex,
      position: i,
      config:
        f.type === "category"
          ? { options: f.options }
          : f.type === "relationship"
          ? { related_app_id: f.relatedAppId }
          : f.type === "calculation"
          ? { formula: f.formula }
          : {},
    }));

    const { error: fieldsError } = await supabase.from("app_fields").insert(rows);
    setSaving(false);
    if (fieldsError) {
      setError(fieldsError.message);
      return;
    }

    router.push(`/org/${orgSlug}/${wsSlug}/${app.slug}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {/* Square icon button + ⌄ toggles the inline picker below. A legacy
            emoji / unknown key still renders via PodioIcon's fallback; picking
            replaces it with a proper line-icon key. */}
        <button
          type="button"
          onClick={() => setIconOpen(!iconOpen)}
          title="App icon"
          className="flex shrink-0 items-stretch rounded-lg border border-slate-300 bg-white hover:border-podio-teal"
        >
          <span className="flex w-10 items-center justify-center">
            <PodioIcon
              icon={icon}
              name={name}
              className="h-5 w-5 text-podio-secondary"
            />
          </span>
          <span className="flex w-6 items-center justify-center rounded-r-lg border-l border-slate-300 bg-podio-row-alt text-podio-secondary">
            ⌄
          </span>
        </button>
        <input
          required
          placeholder="App name (e.g. Leads, Projects, Tickets)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          placeholder="Item name (e.g. Lead)"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {iconOpen && <IconPicker value={icon} onChange={setIcon} />}

      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={f.key} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => moveField(i, -1)} className="text-xs text-slate-400 hover:text-slate-700">▲</button>
                <button type="button" onClick={() => moveField(i, 1)} className="text-xs text-slate-400 hover:text-slate-700">▼</button>
              </div>
              <input
                placeholder={f.type === "separator" ? "Section title" : "Field label"}
                value={f.label}
                onChange={(e) => updateField(f.key, { label: e.target.value })}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <select
                value={f.type}
                onChange={(e) => updateField(f.key, { type: e.target.value as FieldType })}
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
              >
                {/* Table fields need the template editor's columns builder,
                    so this quick builder doesn't offer them. */}
                {FIELD_TYPES.filter((t) => t.value !== "table").map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {f.type !== "separator" && f.type !== "calculation" && (
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => updateField(f.key, { required: e.target.checked })}
                  />
                  required
                </label>
              )}
              <button
                type="button"
                onClick={() => removeField(f.key)}
                className="text-sm text-slate-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>

            {f.type === "category" && (
              <div className="mt-2 space-y-1 pl-8">
                {f.options.map((o, oi) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={o.color}
                      onChange={(e) =>
                        updateField(f.key, {
                          options: f.options.map((x) =>
                            x.id === o.id ? { ...x, color: e.target.value } : x
                          ),
                        })
                      }
                      className="h-6 w-8"
                    />
                    <input
                      placeholder={`Option ${oi + 1}`}
                      value={o.label}
                      onChange={(e) =>
                        updateField(f.key, {
                          options: f.options.map((x) =>
                            x.id === o.id ? { ...x, label: e.target.value } : x
                          ),
                        })
                      }
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateField(f.key, {
                          options: f.options.filter((x) => x.id !== o.id),
                        })
                      }
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateField(f.key, {
                      options: [
                        ...f.options,
                        {
                          id: crypto.randomUUID(),
                          label: "",
                          color: CATEGORY_COLORS[f.options.length % CATEGORY_COLORS.length],
                        },
                      ],
                    })
                  }
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Add option
                </button>
              </div>
            )}

            {f.type === "relationship" && (
              <div className="mt-2 pl-8">
                <select
                  value={f.relatedAppId}
                  onChange={(e) => updateField(f.key, { relatedAppId: e.target.value })}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— Link to which app? —</option>
                  {workspaceApps.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {workspaceApps.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    No other apps in this workspace yet — create the related app first.
                  </p>
                )}
              </div>
            )}

            {f.type === "calculation" && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
                <input
                  placeholder="Formula (stored now, evaluated when the calc engine ships)"
                  value={f.formula}
                  onChange={(e) => updateField(f.key, { formula: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <AiFormulaAssist
                  aiFields={fields
                    .map((x, xi) => ({
                      external_id: `${slugify(x.label)}-${xi}`,
                      label: x.label,
                      type: x.type as string,
                    }))
                    .filter((x) =>
                      ["number", "money", "progress"].includes(x.type) &&
                      x.label.trim() !== "")}
                  onFormula={(v) => updateField(f.key, { formula: v })}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addField}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
        >
          + Add field
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create app"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-400">
        The first Text field becomes the item title.
      </p>
    </div>
  );
}
