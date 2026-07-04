"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CategoryOption } from "@/lib/fields";

type Field = { id: string; label: string; type: string; config: { options?: CategoryOption[] } };
type Member = { user_id: string; full_name: string | null };
type Automation = {
  id: string; name: string; status: string;
  trigger: any; conditions: any[]; actions: any[];
};
type Run = { id: string; automation_id: string; status: string; error: string | null; created_at: string };

const TRIGGERS = [
  { value: "item_created", label: "Item is created" },
  { value: "item_updated", label: "Item is updated" },
  { value: "form_submitted", label: "Webform is submitted" },
  { value: "email_received", label: "Email is received" },
];

const ACTION_TYPES = [
  { value: "create_task", label: "Create a task" },
  { value: "update_field", label: "Update a field" },
  { value: "notify", label: "Notify a member" },
  { value: "add_comment", label: "Add a comment" },
  { value: "send_email", label: "Send an email" },
];

export function AutomationsBuilder({
  appId, wsId, fields, members, automations, runs,
}: {
  appId: string; wsId: string; fields: Field[]; members: Member[];
  automations: Automation[]; runs: Run[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("item_created");
  const [condField, setCondField] = useState("");
  const [condOp, setCondOp] = useState("equals");
  const [condValue, setCondValue] = useState("");
  const [actions, setActions] = useState<any[]>([{ type: "create_task", title: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const condFieldObj = fields.find((f) => f.id === condField);

  function setAction(i: number, patch: any) {
    setActions(actions.map((a, ai) => (ai === i ? { ...a, ...patch } : a)));
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name required.");
    if (actions.some((a) => a.type === "create_task" && !a.title))
      return setError("Task actions need a title.");
    setSaving(true);
    const conditions =
      condField && condValue !== ""
        ? [{ field_id: condField, op: condOp, value: condValue }]
        : [];
    const { error: insError } = await supabase.from("automations").insert({
      workspace_id: wsId,
      app_id: appId,
      name,
      kind: "simple",
      status: "active",
      trigger: { type: trigger },
      conditions,
      actions,
    });
    setSaving(false);
    if (insError) return setError(insError.message);
    setOpen(false);
    setName("");
    setActions([{ type: "create_task", title: "" }]);
    setCondField(""); setCondValue("");
    router.refresh();
  }

  async function toggleStatus(a: Automation) {
    await supabase
      .from("automations")
      .update({ status: a.status === "active" ? "paused" : "active" })
      .eq("id", a.id);
    router.refresh();
  }

  async function remove(id: string) {
    await supabase.from("automations").delete().eq("id", id);
    router.refresh();
  }

  const triggerLabel = (t: string) => TRIGGERS.find((x) => x.value === t)?.label ?? t;

  return (
    <div className="space-y-4">
      {/* Existing automations */}
      {automations.map((a) => {
        const aRuns = runs.filter((r) => r.automation_id === a.id).slice(0, 3);
        return (
          <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${a.status === "active" ? "bg-green-500" : "bg-slate-300"}`} />
              <span className="font-medium">{a.name}</span>
              <span className="ml-auto flex gap-3 text-xs">
                <button onClick={() => toggleStatus(a)} className="text-slate-500 hover:text-blue-600">
                  {a.status === "active" ? "pause" : "activate"}
                </button>
                <button onClick={() => remove(a.id)} className="text-slate-400 hover:text-red-600">
                  delete
                </button>
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              When <span className="font-medium">{triggerLabel(a.trigger?.type)}</span>
              {(a.conditions ?? []).length > 0 && " (with condition)"} →{" "}
              {(a.actions ?? []).map((x: any) =>
                ACTION_TYPES.find((t) => t.value === x.type)?.label ?? x.type
              ).join(", ")}
            </p>
            {aRuns.length > 0 && (
              <div className="mt-2 flex gap-2 text-xs text-slate-400">
                Recent runs:
                {aRuns.map((r) => (
                  <span key={r.id} title={r.error ?? ""}
                    className={r.status === "success" ? "text-green-600" : "text-red-500"}>
                    {r.status === "success" ? "✓" : "✕"}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {automations.length === 0 && !open && (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          No automations yet.
        </p>
      )}

      {/* Builder */}
      {open ? (
        <div className="rounded-lg border border-blue-200 bg-white p-4 space-y-3">
          <input placeholder="Automation name (e.g. Assign follow-up on new lead)"
            value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">When</span>
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">If</span>
            <select value={condField} onChange={(e) => setCondField(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">(no condition)</option>
              {fields.filter((f) => ["text","category","number","money","progress"].includes(f.type))
                .map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            {condField && (
              <>
                <select value={condOp} onChange={(e) => setCondOp(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="equals">equals</option>
                  <option value="not_equals">doesn't equal</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                </select>
                {condFieldObj?.type === "category" ? (
                  <select value={condValue} onChange={(e) => setCondValue(e.target.value)}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">— option —</option>
                    {(condFieldObj.config.options ?? []).map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input value={condValue} onChange={(e) => setCondValue(e.target.value)}
                    placeholder="value" className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Then</span>
            {actions.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2 text-sm">
                <select value={a.type}
                  onChange={(e) => setActions(actions.map((x, xi) => xi === i ? { type: e.target.value } : x))}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                  {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {a.type === "create_task" && (
                  <>
                    <input placeholder="Task title" value={a.title ?? ""}
                      onChange={(e) => setAction(i, { title: e.target.value })}
                      className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    <select value={a.assignee_id ?? ""}
                      onChange={(e) => setAction(i, { assignee_id: e.target.value })}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>{m.full_name ?? m.user_id.slice(0, 8)}</option>
                      ))}
                    </select>
                    <input type="number" min={0} placeholder="due in days" value={a.due_days ?? ""}
                      onChange={(e) => setAction(i, { due_days: e.target.value })}
                      className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </>
                )}
                {a.type === "update_field" && (
                  <>
                    <select value={a.field_id ?? ""}
                      onChange={(e) => setAction(i, { field_id: e.target.value })}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="">— field —</option>
                      {fields.filter((f) => ["text","category","number","progress"].includes(f.type))
                        .map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    {fields.find((f) => f.id === a.field_id)?.type === "category" ? (
                      <select value={a.value ?? ""} onChange={(e) => setAction(i, { value: e.target.value })}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                        <option value="">— option —</option>
                        {(fields.find((f) => f.id === a.field_id)?.config.options ?? []).map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input placeholder="new value" value={a.value ?? ""}
                        onChange={(e) => setAction(i, { value: e.target.value })}
                        className="w-32 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    )}
                  </>
                )}
                {a.type === "notify" && (
                  <>
                    <select value={a.user_id ?? ""}
                      onChange={(e) => setAction(i, { user_id: e.target.value })}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="">— member —</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>{m.full_name ?? m.user_id.slice(0, 8)}</option>
                      ))}
                    </select>
                    <input placeholder="Message" value={a.message ?? ""}
                      onChange={(e) => setAction(i, { message: e.target.value })}
                      className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </>
                )}
                {a.type === "add_comment" && (
                  <input placeholder="Comment body" value={a.body ?? ""}
                    onChange={(e) => setAction(i, { body: e.target.value })}
                    className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                )}
                {a.type === "send_email" && (
                  <>
                    <input type="email" placeholder="to@example.com" value={a.to ?? ""}
                      onChange={(e) => setAction(i, { to: e.target.value })}
                      className="w-44 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    <input placeholder="Subject" value={a.subject ?? ""}
                      onChange={(e) => setAction(i, { subject: e.target.value })}
                      className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </>
                )}
                <button onClick={() => setActions(actions.filter((_, xi) => xi !== i))}
                  className="text-xs text-slate-400 hover:text-red-600">✕</button>
              </div>
            ))}
            <button onClick={() => setActions([...actions, { type: "create_task", title: "" }])}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
              + Add action
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Create automation"}
            </button>
            <button onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
              Cancel
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + New automation
        </button>
      )}
    </div>
  );
}
