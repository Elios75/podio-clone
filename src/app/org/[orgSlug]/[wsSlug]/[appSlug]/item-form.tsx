"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CURRENCIES,
  type CategoryOption,
  type FieldType,
} from "@/lib/fields";

type Field = {
  id: string;
  label: string;
  type: FieldType;
  is_required: boolean;
  help_text: string | null;
  config: {
    options?: CategoryOption[];
    related_app_id?: string;
    formula?: string;
    multiple?: boolean;
    end_date?: boolean;
    default?: any;
  };
};

type Member = { user_id: string; full_name: string | null };
type RelatedItem = { id: string; title: string | null; item_number: number };

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

export function ItemForm({
  appId,
  fields,
  members,
  relatedItemsByField,
  itemId,
  initialValues,
  signedUrls,
  backHref,
}: {
  appId: string;
  fields: Field[];
  members: Member[];
  relatedItemsByField: Record<string, RelatedItem[]>;
  itemId?: string;
  initialValues?: Record<string, any>;
  signedUrls?: Record<string, string>;
  backHref: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [values, setValues] = useState<Record<string, any>>(initialValues ?? {});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});

  function set(fieldId: string, v: any) {
    setValues((prev) => ({ ...prev, [fieldId]: v }));
  }

  async function uploadFile(fieldId: string, file: File) {
    setUploading(fieldId);
    setError(null);
    const path = `${appId}/${crypto.randomUUID()}-${file.name}`;
    const { error: upError } = await supabase.storage
      .from("podio-files")
      .upload(path, file);
    setUploading(null);
    if (upError) {
      setError(upError.message);
      return;
    }
    setLocalPreviews((p) => ({ ...p, [path]: URL.createObjectURL(file) }));
    set(fieldId, { path, name: file.name });
  }

  const fileHref = (path: string) =>
    localPreviews[path] ?? signedUrls?.[path] ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error: rpcError } = await supabase.rpc("save_item", {
      p_app: appId,
      p_item: itemId ?? null,
      p_values: values,
    });

    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.push(backHref);
    router.refresh();
  }

  function renderInput(f: Field) {
    switch (f.type) {
      case "text":
        return (
          <input required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value)} className={inputCls} />
        );
      case "organization":
      case "location":
        return (
          <input required={f.is_required} value={values[f.id] ?? ""}
            placeholder={f.type === "location" ? "Address" : "Company name"}
            onChange={(e) => set(f.id, e.target.value)} className={inputCls} />
        );
      case "phone":
        return (
          <input type="tel" required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value)} className={inputCls} />
        );
      case "email":
        return (
          <input type="email" required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value)} className={inputCls} />
        );
      case "link":
        return (
          <input type="url" placeholder="https://…" required={f.is_required}
            value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value)} className={inputCls} />
        );
      case "number":
        return (
          <input type="number" step="any" required={f.is_required}
            value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value === "" ? null : Number(e.target.value))}
            className={inputCls} />
        );
      case "money": {
        const v = values[f.id] ?? {};
        return (
          <div className="flex gap-2">
            <input type="number" step="0.01" required={f.is_required}
              placeholder="Amount" value={v.amount ?? ""}
              onChange={(e) =>
                set(f.id, e.target.value === "" ? null : { ...v, amount: Number(e.target.value), currency: v.currency ?? "USD" })
              }
              className={inputCls} />
            <select value={v.currency ?? "USD"}
              onChange={(e) => set(f.id, { ...v, currency: e.target.value })}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        );
      }
      case "progress":
        return (
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={100}
              value={values[f.id] ?? 0}
              onChange={(e) => set(f.id, Number(e.target.value))}
              className="flex-1" />
            <span className="w-12 text-right text-sm text-slate-600">
              {values[f.id] ?? 0}%
            </span>
          </div>
        );
      case "duration": {
        const total = values[f.id] ?? 0;
        const h = Math.floor(total / 3600);
        const m = Math.round((total % 3600) / 60);
        return (
          <div className="flex items-center gap-2">
            <input type="number" min={0} value={h || ""}
              placeholder="0"
              onChange={(e) => set(f.id, Number(e.target.value || 0) * 3600 + m * 60)}
              className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <span className="text-sm text-slate-500">h</span>
            <input type="number" min={0} max={59} value={m || ""}
              placeholder="0"
              onChange={(e) => set(f.id, h * 3600 + Number(e.target.value || 0) * 60)}
              className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <span className="text-sm text-slate-500">m</span>
          </div>
        );
      }
      case "date": {
        const v = values[f.id] ?? {};
        return (
          <div className="flex items-center gap-2">
            <input type="date" required={f.is_required}
              value={v.start ?? ""}
              onChange={(e) =>
                set(f.id, e.target.value ? { ...v, start: e.target.value } : null)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            {f.config.end_date && (
              <>
                <span className="text-xs text-slate-400">→</span>
                <input type="date" value={v.end ?? ""}
                  min={v.start ?? undefined}
                  onChange={(e) => set(f.id, { ...v, end: e.target.value || undefined })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </>
            )}
          </div>
        );
      }
      case "category": {
        if (f.config.multiple) {
          const selected: string[] = Array.isArray(values[f.id]) ? values[f.id] : [];
          return (
            <div className="flex flex-wrap gap-2">
              {(f.config.options ?? []).map((o) => {
                const on = selected.includes(o.id);
                return (
                  <button key={o.id} type="button"
                    onClick={() =>
                      set(f.id, on
                        ? selected.filter((x) => x !== o.id)
                        : [...selected, o.id])}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      on ? "text-white" : "text-slate-600 border-slate-300 hover:bg-slate-50"}`}
                    style={on ? { backgroundColor: o.color, borderColor: o.color } : {}}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          );
        }
        return (
          <select required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value || null)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— Select —</option>
            {(f.config.options ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        );
      }
      case "contact":
        return (
          <select required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value || null)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— Select member —</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name ?? m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
        );
      case "relationship":
        return (
          <select required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value || null)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— Select item —</option>
            {(relatedItemsByField[f.id] ?? []).map((it) => (
              <option key={it.id} value={it.id}>
                #{it.item_number} {it.title ?? ""}
              </option>
            ))}
          </select>
        );
      case "image":
      case "file": {
        const v = values[f.id];
        return (
          <div className="space-y-2">
            {v?.path && f.type === "image" && fileHref(v.path) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileHref(v.path)!} alt={v.name}
                className="h-24 rounded-lg border border-slate-200 object-cover" />
            )}
            {v?.path && f.type === "file" && (
              fileHref(v.path) ? (
                <a href={fileHref(v.path)!} target="_blank"
                  className="text-sm text-blue-600 hover:underline">
                  {v.name}
                </a>
              ) : (
                <span className="text-sm text-slate-500">{v.name}</span>
              )
            )}
            <input type="file"
              accept={f.type === "image" ? "image/*" : undefined}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(f.id, file);
              }}
              className="block text-sm" />
            {uploading === f.id && (
              <p className="text-xs text-slate-400">Uploading…</p>
            )}
          </div>
        );
      }
      case "calculation": {
        const v = values[f.id];
        return (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            {typeof v === "number" ? (
              <span className="font-medium">= {v.toLocaleString()}</span>
            ) : (
              <span className="text-slate-400">Computed on save</span>
            )}
            {f.config.formula && (
              <span className="ml-2 font-mono text-xs text-slate-400">
                {f.config.formula}
              </span>
            )}
          </p>
        );
      }
      default:
        return null;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((f) =>
        f.type === "separator" ? (
          <div key={f.id} className="border-t border-slate-200 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {f.label}
            </p>
          </div>
        ) : (
          <div key={f.id}>
            <label className="block text-sm font-medium text-slate-700">
              {f.label}
              {f.is_required && <span className="text-red-500"> *</span>}
            </label>
            {f.help_text && <p className="text-xs text-slate-400">{f.help_text}</p>}
            <div className="mt-1">{renderInput(f)}</div>
          </div>
        )
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || uploading !== null}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => router.push(backHref)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
