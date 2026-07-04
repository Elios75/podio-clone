"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CategoryOption } from "@/lib/fields";

type Field = { id: string; label: string; type: string; config: { options?: CategoryOption[] } };
type Member = { user_id: string; full_name: string | null };

type Step =
  | { type: "action"; config: any }
  | { type: "delay"; hours: number }
  | { type: "branch"; condition: any; then: Step[]; else: Step[] };

const TRIGGERS = [
  { value: "item_created", label: "Item is created" },
  { value: "item_updated", label: "Item is updated" },
  { value: "form_submitted", label: "Webform is submitted" },
  { value: "email_received", label: "Email is received" },
];

export function AdvancedBuilder({
  appId, wsId, fields, members,
}: {
  appId: string; wsId: string; fields: Field[]; members: Member[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("item_created");
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);

  const condFields = fields.filter((f) =>
    ["text", "category", "number", "money", "progress"].includes(f.type));

  function ActionEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <select value={value.type ?? "create_task"}
          onChange={(e) => onChange({ type: e.target.value })}
          className="rounded border border-slate-300 px-1.5 py-1 text-xs">
          <option value="create_task">Create task</option>
          <option value="update_field">Update field</option>
          <option value="notify">Notify</option>
          <option value="add_comment">Comment</option>
          <option value="send_email">Send email</option>
        </select>
        {value.type === "create_task" && (
          <>
            <input placeholder="Task title" value={value.title ?? ""}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
              className="w-36 rounded border border-slate-300 px-1.5 py-1 text-xs" />
            <select value={value.assignee_id ?? ""}
              onChange={(e) => onChange({ ...value, assignee_id: e.target.value })}
              className="rounded border border-slate-300 px-1 py-1 text-xs">
              <option value="">unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.full_name ?? "member"}</option>
              ))}
            </select>
          </>
        )}
        {value.type === "update_field" && (
          <>
            <select value={value.field_id ?? ""}
              onChange={(e) => onChange({ ...value, field_id: e.target.value })}
              className="rounded border border-slate-300 px-1 py-1 text-xs">
              <option value="">field…</option>
              {condFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            {fields.find((f) => f.id === value.field_id)?.type === "category" ? (
              <select value={value.value ?? ""}
                onChange={(e) => onChange({ ...value, value: e.target.value })}
                className="rounded border border-slate-300 px-1 py-1 text-xs">
                <option value="">option…</option>
                {(fields.find((f) => f.id === value.field_id)?.config.options ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input placeholder="value" value={value.value ?? ""}
                onChange={(e) => onChange({ ...value, value: e.target.value })}
                className="w-24 rounded border border-slate-300 px-1.5 py-1 text-xs" />
            )}
          </>
        )}
        {value.type === "notify" && (
          <>
            <select value={value.user_id ?? ""}
              onChange={(e) => onChange({ ...value, user_id: e.target.value })}
              className="rounded border border-slate-300 px-1 py-1 text-xs">
              <option value="">member…</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.full_name ?? "member"}</option>
              ))}
            </select>
            <input placeholder="Message" value={value.message ?? ""}
              onChange={(e) => onChange({ ...value, message: e.target.value })}
              className="w-40 rounded border border-slate-300 px-1.5 py-1 text-xs" />
          </>
        )}
        {value.type === "add_comment" && (
          <input placeholder="Comment" value={value.body ?? ""}
            onChange={(e) => onChange({ ...value, body: e.target.value })}
            className="w-48 rounded border border-slate-300 px-1.5 py-1 text-xs" />
        )}
        {value.type === "send_email" && (
          <>
            <input placeholder="to@example.com" value={value.to ?? ""}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="w-36 rounded border border-slate-300 px-1.5 py-1 text-xs" />
            <input placeholder="Subject" value={value.subject ?? ""}
              onChange={(e) => onChange({ ...value, subject: e.target.value })}
              className="w-32 rounded border border-slate-300 px-1.5 py-1 text-xs" />
          </>
        )}
      </span>
    );
  }

  function ConditionEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    const f = fields.find((x) => x.id === value.field_id);
    return (
      <span className="flex items-center gap-1.5">
        <select value={value.field_id ?? ""}
          onChange={(e) => onChange({ ...value, field_id: e.target.value })}
          className="rounded border border-slate-300 px-1 py-1 text-xs">
          <option value="">field…</option>
          {condFields.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select value={value.op ?? "equals"}
          onChange={(e) => onChange({ ...value, op: e.target.value })}
          className="rounded border border-slate-300 px-1 py-1 text-xs">
          <option value="equals">=</option>
          <option value="not_equals">≠</option>
          <option value="gt">&gt;</option>
          <option value="lt">&lt;</option>
        </select>
        {f?.type === "category" ? (
          <select value={value.value ?? ""}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
            className="rounded border border-slate-300 px-1 py-1 text-xs">
            <option value="">option…</option>
            {(f.config.options ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input placeholder="value" value={value.value ?? ""}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
            className="w-20 rounded border border-slate-300 px-1.5 py-1 text-xs" />
        )}
      </span>
    );
  }

  function setStep(i: number, s: Step) {
    setSteps(steps.map((x, xi) => (xi === i ? s : x)));
  }

  function addStep(type: string) {
    if (type === "action") setSteps([...steps, { type: "action", config: { type: "create_task" } }]);
    if (type === "delay") setSteps([...steps, { type: "delay", hours: 24 }]);
    if (type === "branch")
      setSteps([...steps, {
        type: "branch", condition: { op: "equals" },
        then: [{ type: "action", config: { type: "create_task" } }],
        else: [],
      }]);
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name required.");
    if (steps.length === 0) return setError("Add at least one step.");
    const { error: insError } = await supabase.from("automations").insert({
      workspace_id: wsId,
      app_id: appId,
      name,
      kind: "advanced",
      status: "active",
      trigger: { type: trigger },
      conditions: [],
      actions: [],
      definition: { steps },
    });
    if (insError) return setError(insError.message);
    setOpen(false);
    setName("");
    setSteps([]);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
        + New advanced flow (delays &amp; branches)
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-purple-200 bg-white p-4 space-y-3">
      <input placeholder="Flow name (e.g. Lead nurture sequence)"
        value={name} onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none" />
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">When</span>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-2 rounded border border-slate-200 p-2 text-xs">
            <span className="mt-1 w-5 text-center font-mono text-slate-400">{i + 1}</span>
            {s.type === "action" && (
              <ActionEditor value={s.config}
                onChange={(config) => setStep(i, { type: "action", config })} />
            )}
            {s.type === "delay" && (
              <span className="flex items-center gap-1.5">
                <span className="font-medium text-purple-600">Wait</span>
                <input type="number" min={0.1} step="any" value={s.hours}
                  onChange={(e) => setStep(i, { type: "delay", hours: Number(e.target.value) })}
                  className="w-20 rounded border border-slate-300 px-1.5 py-1 text-xs" />
                <span>hours</span>
              </span>
            )}
            {s.type === "branch" && (
              <div className="flex-1 space-y-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="font-medium text-purple-600">If</span>
                  <ConditionEditor value={s.condition}
                    onChange={(condition) => setStep(i, { ...s, condition })} />
                </span>
                <div className="flex items-center gap-1.5 pl-4">
                  <span className="text-green-600">then</span>
                  <ActionEditor value={s.then[0]?.type === "action" ? (s.then[0] as any).config : {}}
                    onChange={(config) => setStep(i, { ...s, then: [{ type: "action", config }] })} />
                </div>
                <div className="flex items-center gap-1.5 pl-4">
                  <span className="text-slate-500">else</span>
                  {s.else.length > 0 ? (
                    <>
                      <ActionEditor value={(s.else[0] as any).config}
                        onChange={(config) => setStep(i, { ...s, else: [{ type: "action", config }] })} />
                      <button onClick={() => setStep(i, { ...s, else: [] })}
                        className="text-slate-400 hover:text-red-600">✕</button>
                    </>
                  ) : (
                    <button
                      onClick={() => setStep(i, { ...s, else: [{ type: "action", config: { type: "create_task" } }] })}
                      className="text-purple-600 hover:underline">
                      + add else action
                    </button>
                  )}
                </div>
              </div>
            )}
            <button onClick={() => setSteps(steps.filter((_, xi) => xi !== i))}
              className="ml-auto text-slate-400 hover:text-red-600">✕</button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => addStep("action")}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">+ Action</button>
        <button onClick={() => addStep("delay")}
          className="rounded border border-purple-300 px-2 py-1 text-xs text-purple-700 hover:bg-purple-50">+ Delay</button>
        <button onClick={() => addStep("branch")}
          className="rounded border border-purple-300 px-2 py-1 text-xs text-purple-700 hover:bg-purple-50">+ Branch</button>
        <button onClick={save}
          className="ml-auto rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
          Create flow
        </button>
        <button onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">Cancel</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-400">
        Flows run in the background (checked every minute), so delays are real — a
        24-hour wait survives server restarts because the queue lives in the database.
      </p>
    </div>
  );
}
