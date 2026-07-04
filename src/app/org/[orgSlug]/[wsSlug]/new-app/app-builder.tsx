"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/slug";
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
  options: CategoryOption[]; // category only
};

export function AppBuilder({
  wsId,
  orgSlug,
  wsSlug,
}: {
  wsId: string;
  orgSlug: string;
  wsSlug: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📋");
  const [itemName, setItemName] = useState("Item");
  const [fields, setFields] = useState<DraftField[]>([
    { key: crypto.randomUUID(), label: "Title", type: "text", required: true, options: [] },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addField() {
    setFields([
      ...fields,
      { key: crypto.randomUUID(), label: "", type: "text", required: false, options: [] },
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
      config: f.type === "category" ? { options: f.options } : {},
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
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          className="w-16 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm"
          title="Icon (emoji)"
        />
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

      <div className="space-y-2">
        {fields.map((f, i) => (
          <div
            key={f.key}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => moveField(i, -1)} className="text-xs text-slate-400 hover:text-slate-700">▲</button>
                <button type="button" onClick={() => moveField(i, 1)} className="text-xs text-slate-400 hover:text-slate-700">▼</button>
              </div>
              <input
                placeholder="Field label"
                value={f.label}
                onChange={(e) => updateField(f.key, { label: e.target.value })}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <select
                value={f.type}
                onChange={(e) =>
                  updateField(f.key, { type: e.target.value as FieldType })
                }
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(f.key, { required: e.target.checked })}
                />
                required
              </label>
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
        The first Text field becomes the item title. Drag-and-drop ordering,
        more field types, and validation rules come later in Phase 2.
      </p>
    </div>
  );
}
