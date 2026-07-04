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
  origType: FieldType | null;
};

const NUMERIC_TYPES = ["number", "money", "progress", "duration", "calculation"];

export function AppEditor({
  app,
  initialFields,
  countByField,
  backHref,
  wsHref,
  revisions,
  rollupSources,
  srcNumFields,
}: {
  app: any;
  initialFields: any[];
  countByField: Record<string, number>;
  backHref: string;
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
      origType: f.type,
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const numberTokens = fields
    .filter((f) => NUMERIC_TYPES.includes(f.type) && f.type !== "calculation" && f.external_id)
    .map((f) => ({ token: `{${f.external_id}}`, label: f.label }));

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
            <div
              key={f.key}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex === null || dragIndex === i) return;
                const next = [...fields];
                const [moved] = next.splice(dragIndex, 1);
                next.splice(i, 0, moved);
                setFields(next);
                setDragIndex(null);
              }}
              className={`rounded-lg border bg-white p-3 ${
                dragIndex === i ? "border-blue-400 opacity-60" : "border-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="cursor-grab text-slate-300" title="Drag to reorder">⠿</span>
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

              {["text", "number"].includes(f.type) && (
                <div className="mt-2 pl-8">
                  <input
                    placeholder={`Default value (optional)`}
                    value={f.defaultValue}
                    type={f.type === "number" ? "number" : "text"}
                    onChange={(e) => upd(f.key, { defaultValue: e.target.value })}
                    className="w-64 rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                </div>
              )}

              {f.type === "date" && (
                <label className="mt-2 flex items-center gap-1.5 pl-8 text-xs text-slate-600">
                  <input type="checkbox" checked={f.endDate}
                    onChange={(e) => upd(f.key, { endDate: e.target.checked })} />
                  Allow an end date (date range)
                </label>
              )}

              {f.type === "calculation" && (
                <div className="mt-2 space-y-1 pl-8">
                  <div className="flex items-center gap-2 text-xs">
                    <select value={f.calcMode}
                      onChange={(e) => upd(f.key, { calcMode: e.target.value as any })}
                      className="rounded border border-slate-300 px-1.5 py-1 text-xs">
                      <option value="formula">Formula (this item)</option>
                      <option value="rollup">Rollup (related items)</option>
                    </select>
                    {f.calcMode === "rollup" && (
                      <>
                        <select value={f.rollupAgg}
                          onChange={(e) => upd(f.key, { rollupAgg: e.target.value })}
                          className="rounded border border-slate-300 px-1.5 py-1 text-xs">
                          <option value="sum">Sum of</option>
                          <option value="avg">Average of</option>
                          <option value="count">Count of</option>
                        </select>
                        {f.rollupAgg !== "count" && (
                          <select value={f.rollupValueField}
                            onChange={(e) => upd(f.key, { rollupValueField: e.target.value })}
                            className="rounded border border-slate-300 px-1.5 py-1 text-xs">
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
                        <span className="text-slate-400">from</span>
                        <select value={f.rollupSource}
                          onChange={(e) => upd(f.key, { rollupSource: e.target.value, rollupValueField: "" })}
                          className="rounded border border-slate-300 px-1.5 py-1 text-xs">
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
                  <input
                    placeholder="Formula, e.g. {deal-value-1} * 0.2"
                    value={f.formula}
                    onChange={(e) => upd(f.key, { formula: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                  />
                  )}
                  <p className="text-[11px] text-slate-400">
                    Tokens:{" "}
                    {numberTokens.length > 0
                      ? numberTokens.map((t) => (
                          <button key={t.token} type="button"
                            onClick={() => upd(f.key, { formula: f.formula + t.token })}
                            className="mr-1 rounded bg-slate-100 px-1 font-mono hover:bg-blue-100"
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
                <div className="mt-2 space-y-1 pl-8">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" checked={f.multiple}
                      onChange={(e) => upd(f.key, { multiple: e.target.checked })} />
                    Allow multiple selections
                  </label>
                </div>
              )}

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
