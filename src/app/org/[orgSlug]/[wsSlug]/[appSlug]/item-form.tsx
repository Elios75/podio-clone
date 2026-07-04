"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CategoryOption, FieldType } from "@/lib/fields";

type Field = {
  id: string;
  label: string;
  type: FieldType;
  is_required: boolean;
  help_text: string | null;
  config: { options?: CategoryOption[] };
};

type Member = { user_id: string; full_name: string | null };

export function ItemForm({
  appId,
  fields,
  members,
  itemId,
  initialValues,
  backHref,
}: {
  appId: string;
  fields: Field[];
  members: Member[];
  itemId?: string;
  initialValues?: Record<string, any>;
  backHref: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [values, setValues] = useState<Record<string, any>>(initialValues ?? {});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set(fieldId: string, v: any) {
    setValues((prev) => ({ ...prev, [fieldId]: v }));
  }

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((f) => (
        <div key={f.id}>
          <label className="block text-sm font-medium text-slate-700">
            {f.label}
            {f.is_required && <span className="text-red-500"> *</span>}
          </label>
          {f.help_text && (
            <p className="text-xs text-slate-400">{f.help_text}</p>
          )}
          <div className="mt-1">
            {f.type === "text" && (
              <input
                required={f.is_required}
                value={values[f.id] ?? ""}
                onChange={(e) => set(f.id, e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            )}
            {f.type === "number" && (
              <input
                type="number"
                step="any"
                required={f.is_required}
                value={values[f.id] ?? ""}
                onChange={(e) =>
                  set(f.id, e.target.value === "" ? null : Number(e.target.value))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            )}
            {f.type === "date" && (
              <input
                type="date"
                required={f.is_required}
                value={values[f.id]?.start ?? ""}
                onChange={(e) =>
                  set(f.id, e.target.value ? { start: e.target.value } : null)
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            )}
            {f.type === "category" && (
              <select
                required={f.is_required}
                value={values[f.id] ?? ""}
                onChange={(e) => set(f.id, e.target.value || null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— Select —</option>
                {(f.config.options ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            )}
            {f.type === "contact" && (
              <select
                required={f.is_required}
                value={values[f.id] ?? ""}
                onChange={(e) => set(f.id, e.target.value || null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— Select member —</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name ?? m.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
