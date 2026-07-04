"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Field = { id: string; label: string; type: string };

export function EmailToApp({
  appId,
  appSlug,
  fields,
  address,
}: {
  appId: string;
  appSlug: string;
  fields: Field[];
  address: any | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const textFields = fields.filter((f) => f.type === "text");
  const [bodyField, setBodyField] = useState(address?.field_mapping?.body_field_id ?? "");
  const [error, setError] = useState<string | null>(null);

  const domain = process.env.NEXT_PUBLIC_INBOUND_DOMAIN ?? "inbound.example.com";

  async function enable() {
    setError(null);
    const addr = `${appSlug}-${Math.random().toString(36).slice(2, 8)}@${domain}`;
    const { error: insError } = await supabase.from("app_email_addresses").insert({
      app_id: appId,
      address: addr,
      field_mapping: { body_field_id: bodyField || null },
    });
    if (insError) return setError(insError.message);
    router.refresh();
  }

  async function saveMapping() {
    await supabase
      .from("app_email_addresses")
      .update({ field_mapping: { body_field_id: bodyField || null } })
      .eq("id", address.id);
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium">Email to app</p>
      <p className="mt-1 text-xs text-slate-400">
        Emails sent to this address become items: subject → title, body → a text
        field of your choice. Requires an inbound email provider pointed at{" "}
        <code>/api/inbound-email</code> (see docs).
      </p>

      {address ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <code className="rounded bg-slate-50 px-2 py-1 text-xs">{address.address}</code>
            <button
              onClick={() => navigator.clipboard.writeText(address.address)}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
            >
              Copy
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs text-slate-500">Email body →</span>
            <select value={bodyField} onChange={(e) => setBodyField(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-xs">
              <option value="">(ignore body)</option>
              {textFields.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            <button onClick={saveMapping}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <select value={bodyField} onChange={(e) => setBodyField(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-xs">
            <option value="">Body → (ignore)</option>
            {textFields.map((f) => (
              <option key={f.id} value={f.id}>Body → {f.label}</option>
            ))}
          </select>
          <button onClick={enable}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            Generate address
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
