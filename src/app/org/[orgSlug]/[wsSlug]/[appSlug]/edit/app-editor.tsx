"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  FIELD_TYPES,
  CATEGORY_COLORS,
  type FieldType,
  type CategoryOption,
} from "@/lib/fields";

type EditField = {
  id: string | null; // null = new field
  key: string;
  label: string;
  type: FieldType;
  help_text: string;
  is_required: boolean;
  is_hidden: boolean;
  is_primary: boolean;
  options: CategoryOption[];
  origType: FieldType | null;
};

export function AppEditor({
  app,
  initialFields,
  countByField,
  backHref,
  wsHref,
  revisions,
}: {
  app: any;
  initialFields: any[];
  countByField: Record<string, number>;
  backHref: string;
  wsHref: string;
  revisions: { version: number; created_at: string }[];
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
      label: f.label,
      type: f.type,
      help_text: f.help_text ?? "",
      is_required: f.is_required,
      is_hidden: f.is_hidden,
      is_primary: f.is_primary,
      options: f.config?.options ?? [],
      origType: f.type,
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function upd(key: string, patch: Partial<EditField>) {
    setFields(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function move(i: number, dir: -1 | 1) {
    const next = [...fields];
    const t = i + dir;
    if (t < 0 || t >= next.length) return;
    [next[i], next[t]] = [next[t], next[i]];
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
    setFields(fields.filter((x) => x.key !== f.key));
  }

  async function saveSettings() {
    setError(null);
    setSaved(null);
    const { error: upError } = await supabase
      .from("apps")
      .update({ name, icon, item_name: itemName || "Item", description: description || null })
      .eq("id", app.id);
    if (upError) return setError(upError.message);
    setSaved("Settings saved.");
    router.refresh();
  }

  async function saveSchema() {
    setError(null);
    setSaved(null);
    if (fields.some((f) => !f.label.trim()))
      return setError("Every field needs a label.");

    // Warn on type changes for fields with data
    for (const f of fields) {
      if (f.id && f.origType && f.type !== f.origType && (countByField[f.id] ?? 0) > 0) {
        const ok = window.confirm(
          `"${f.label}" changes type ${f.origType} → ${f.type} and holds data on ` +
          `${countByField[f.id]} item(s). Existing values may display incorrectly. Continue?`
        );
        if (!ok) return;
      }
    }

    setSaving(true);
    const payload = fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      help_text: f.help_text,
      is_required: f.is_required,
      is_hidden: f.is_hidden,
      is_primary: f.is_primary,
      config: f.type === "category" ? { options: f.options } : {},
    }));
    const { data, error: rpcError } = await supabase.rpc("update_app_schema", {
      p_app: app.id,
      p_fields: payload,
    });
    setSaving(false);
    if (rpcError) return setError(rpcError.message);
    setSaved(`Published schema v${data.version}.`);
    router.refresh();
  }

  async function archiveApp() {
    if (!window.confirm(`Archive "${app.name}"? It disappears from the workspace but keeps all data.`))
      return;
    await supabase.from("apps").update({ is_archived: true }).eq("id", app.id);
    router.push(wsHref);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* App settings */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
        <p className="text-sm font-medium">App settings</p>
        <div className="flex gap-2">
          <input value={icon} onChange={(e) => setIcon(e.target.value)}
            className="w-16 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm" />
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={itemName} onChange={(e) => setItemName(e.target.value)}
            className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <textarea placeholder="Description (optional)" rows={2}
          value={description} onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <div className="flex items-center gap-2">
          <button onClick={saveSettings}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
            Save settings
          </button>
          <button onClick={archiveApp}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
            Archive app
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Fields</p>
        {fields.map((f, i) => {
          const cnt = f.id ? countByField[f.id] ?? 0 : 0;
          return (
            <div key={f.key} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} className="text-xs text-slate-400 hover:text-slate-700">▲</button>
                  <button onClick={() => move(i, 1)} className="text-xs text-slate-400 hover:text-slate-700">▼</button>
                </div>
                <input value={f.label}
                  onChange={(e) => upd(f.key, { label: e.target.value })}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                <select value={f.type}
                  onChange={(e) => upd(f.key, { type: e.target.value as FieldType })}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {f.id && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"
                    title="Items holding a value for this field">
                    {cnt} value{cnt === 1 ? "" : "s"}
                  </span>
                )}
                {!f.id && (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-[11px] text-green-700">new</span>
                )}
                <button onClick={() => remove(f)}
                  className="text-sm text-slate-400 hover:text-red-600">✕</button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 pl-8 text-xs text-slate-600">
                <input placeholder="Help text shown under the field"
                  value={f.help_text}
                  onChange={(e) => upd(f.key, { help_text: e.target.value })}
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
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
                    onChange={() =>
                      setFields(fields.map((x) => ({ ...x, is_primary: x.key === f.key })))
                    } />
                  title field
                </label>
              </div>

              {f.type === "category" && (
                <div className="mt-2 space-y-1 pl-8">
                  {f.options.map((o) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <input type="color" value={o.color}
                        onChange={(e) => upd(f.key, {
                          options: f.options.map((x) => x.id === o.id ? { ...x, color: e.target.value } : x),
                        })}
                        className="h-6 w-8" />
                      <input value={o.label}
                        onChange={(e) => upd(f.key, {
                          options: f.options.map((x) => x.id === o.id ? { ...x, label: e.target.value } : x),
                        })}
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
                      <button
                        onClick={() => upd(f.key, { options: f.options.filter((x) => x.id !== o.id) })}
                        className="text-xs text-slate-400 hover:text-red-600">✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => upd(f.key, {
                      options: [...f.options, {
                        id: crypto.randomUUID(),
                        label: "",
                        color: CATEGORY_COLORS[f.options.length % CATEGORY_COLORS.length],
                      }],
                    })}
                    className="text-xs text-blue-600 hover:underline">
                    + Add option
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFields([...fields, {
              id: null, key: crypto.randomUUID(), label: "", type: "text",
              help_text: "", is_required: false, is_hidden: false,
              is_primary: false, options: [], origType: null,
            }])}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100">
            + Add field
          </button>
          <button onClick={saveSchema} disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Publishing…" : "Publish changes"}
          </button>
          <button onClick={() => router.push(backHref)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
            Back to app
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">{saved}</p>}
      </div>

      {/* Schema history */}
      {revisions.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium">Schema history</p>
          <ul className="mt-2 space-y-1">
            {revisions.map((r) => (
              <li key={r.version} className="flex justify-between text-xs text-slate-500">
                <span>v{r.version}</span>
                <span>{new Date(r.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
