"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CategoryOption } from "@/lib/fields";

type Field = {
  id: string; label: string; type: string;
  config: { options?: CategoryOption[]; related_app_id?: string };
};
type Member = { user_id: string; full_name: string | null };
type Automation = {
  id: string; name: string; status: string;
  trigger: any; conditions: any[]; actions: any[];
};
type Run = {
  id: string; automation_id: string; status: string; error: string | null;
  logs: any[]; is_test: boolean; trigger_event: any;
  created_at: string; started_at: string | null; finished_at: string | null;
};
type PickItem = { id: string; title: string | null; item_number: number };

const TRIGGERS = [
  { value: "item_created", label: "Item is created" },
  { value: "item_updated", label: "Item is updated" },
  { value: "form_submitted", label: "Webform is submitted" },
  { value: "email_received", label: "Email is received" },
  { value: "comment_added", label: "A comment is added" },
  { value: "task_completed", label: "A task is completed" },
  { value: "date_reached", label: "A date is reached" },
];

const ACTION_TYPES = [
  { value: "create_task", label: "Create a task" },
  { value: "update_field", label: "Update a field" },
  { value: "notify", label: "Notify a member" },
  { value: "add_comment", label: "Add a comment" },
  { value: "send_email", label: "Send an email" },
  { value: "http_request", label: "Make an HTTP request" },
  { value: "update_related_item", label: "Update related items" },
];

function StatusBadge({ status, isTest }: { status: string; isTest?: boolean }) {
  const cls =
    status === "success" ? "bg-green-100 text-green-700" :
    status === "failed" ? "bg-red-100 text-red-700" :
    status === "cancelled" ? "bg-slate-100 text-slate-500" :
    "bg-amber-100 text-amber-700";
  return (
    <span className="flex items-center gap-1">
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{status}</span>
      {isTest && (
        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">test</span>
      )}
    </span>
  );
}

function RunDetail({ run }: { run: Run }) {
  const dur =
    run.started_at && run.finished_at
      ? `${Math.max(0, new Date(run.finished_at).getTime() - new Date(run.started_at).getTime())} ms`
      : null;
  return (
    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-slate-500">
        <StatusBadge status={run.status} isTest={run.is_test} />
        <span>trigger: {run.trigger_event?.type ?? "—"}</span>
        <span>{new Date(run.created_at).toLocaleString()}</span>
        {dur && <span>{dur}</span>}
      </div>
      {run.error && <p className="mt-2 font-mono text-red-600">{run.error}</p>}
      <ol className="mt-2 space-y-1">
        {(run.logs ?? []).map((l: any, i: number) => (
          <li key={i} className="flex flex-wrap items-center gap-2 font-mono">
            <span className={l.ok ? "text-green-600" : "text-red-500"}>{l.ok ? "✓" : "✕"}</span>
            <span className="font-medium">{l.action}</span>
            {l.dry_run && <span className="text-violet-600">(dry run — not executed)</span>}
            {l.reason && <span className="text-slate-500">{l.reason}</span>}
            {l.updated != null && <span className="text-slate-500">updated {l.updated}</span>}
            {l.request_id != null && <span className="text-slate-500">req #{l.request_id}</span>}
            {l.took && <span className="text-slate-500">took {l.took}</span>}
          </li>
        ))}
        {(run.logs ?? []).length === 0 && <li className="text-slate-400">no log steps recorded</li>}
      </ol>
    </div>
  );
}

function RunNowPanel({
  automation, appId, onDone,
}: { automation: Automation; appId: string; onDone: () => void }) {
  const supabase = createClient();
  const [items, setItems] = useState<PickItem[] | null>(null);
  const [itemId, setItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadItems() {
    const { data } = await supabase
      .from("items")
      .select("id, title, item_number")
      .eq("app_id", appId).eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(25);
    setItems((data ?? []) as PickItem[]);
  }
  if (items === null) void loadItems();

  async function run(test: boolean) {
    if (!itemId) return setErr("Pick an item first.");
    setErr(null); setBusy(true); setResult(null);
    const { data, error } = await supabase.rpc("run_automation_now", {
      p_automation: automation.id, p_item: itemId, p_test: test,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setResult(data);
    onDone();
  }

  return (
    <div className="mt-2 rounded border border-blue-200 bg-blue-50/50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <select value={itemId} onChange={(e) => setItemId(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">— pick an item —</option>
          {(items ?? []).map((it) => (
            <option key={it.id} value={it.id}>
              #{it.item_number} {it.title ?? "(untitled)"}
            </option>
          ))}
        </select>
        <button onClick={() => run(true)} disabled={busy}
          className="rounded border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50">
          {busy ? "…" : "Dry run"}
        </button>
        <button onClick={() => run(false)} disabled={busy}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? "…" : "Run now"}
        </button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
      {result && (
        <div className="mt-2 text-xs">
          <StatusBadge status={result.status} isTest={result.is_test} />
          {result.error && <p className="mt-1 font-mono text-red-600">{result.error}</p>}
          <ol className="mt-1 space-y-0.5 font-mono">
            {(result.logs ?? []).map((l: any, i: number) => (
              <li key={i}>
                <span className={l.ok ? "text-green-600" : "text-red-500"}>{l.ok ? "✓" : "✕"}</span>{" "}
                {l.action}{l.dry_run ? " (dry run)" : ""}{l.reason ? ` — ${l.reason}` : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

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
  const [dateField, setDateField] = useState("");
  const [dateOffset, setDateOffset] = useState("0");
  const [condField, setCondField] = useState("");
  const [condOp, setCondOp] = useState("equals");
  const [condValue, setCondValue] = useState("");
  const [actions, setActions] = useState<any[]>([{ type: "create_task", title: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runPanel, setRunPanel] = useState<string | null>(null);
  const [relAppFields, setRelAppFields] = useState<Record<string, Field[]>>({});

  async function loadRelAppFields(appIdToLoad: string) {
    if (relAppFields[appIdToLoad]) return;
    const { data } = await supabase
      .from("app_fields")
      .select("id, label, type, config")
      .eq("app_id", appIdToLoad).eq("status", "active")
      .order("position");
    setRelAppFields((prev) => ({ ...prev, [appIdToLoad]: (data ?? []) as Field[] }));
  }

  const condFieldObj = fields.find((f) => f.id === condField);
  const dateFields = fields.filter((f) => f.type === "date");
  const relFields = fields.filter((f) => f.type === "relationship");

  function setAction(i: number, patch: any) {
    setActions(actions.map((a, ai) => (ai === i ? { ...a, ...patch } : a)));
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name required.");
    if (actions.some((a) => a.type === "create_task" && !a.title))
      return setError("Task actions need a title.");
    if (trigger === "date_reached" && !dateField)
      return setError("Date triggers need a date field.");
    if (actions.some((a) => a.type === "http_request" && !/^https?:\/\//i.test(a.url ?? "")))
      return setError("HTTP request actions need a valid http(s) URL.");
    if (actions.some((a) => a.type === "update_related_item" && (!a.relationship_field_id || !a.field_id)))
      return setError("Update-related-item actions need a relationship and a target field.");
    setSaving(true);
    const conditions =
      condField && condValue !== ""
        ? [{ field_id: condField, op: condOp, value: condValue }]
        : [];
    const trig: any = { type: trigger };
    if (trigger === "date_reached") {
      trig.field_id = dateField;
      trig.offset_days = Number(dateOffset || 0);
    }
    const cleanActions = actions.map((a) => {
      if (a.type !== "http_request") return a;
      let body: any = undefined;
      if ((a.body_raw ?? "").trim()) {
        try { body = JSON.parse(a.body_raw); } catch { body = a.body_raw; }
      }
      const { body_raw, ...rest } = a;
      return body === undefined ? rest : { ...rest, body };
    });
    const { error: insError } = await supabase.from("automations").insert({
      workspace_id: wsId,
      app_id: appId,
      name,
      kind: "simple",
      status: "active",
      trigger: trig,
      conditions,
      actions: cleanActions,
    });
    setSaving(false);
    if (insError) return setError(insError.message);
    setOpen(false);
    setName("");
    setActions([{ type: "create_task", title: "" }]);
    setCondField(""); setCondValue("");
    setDateField(""); setDateOffset("0");
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

  const triggerLabel = (t: any) => {
    const base = TRIGGERS.find((x) => x.value === t?.type)?.label ?? t?.type;
    if (t?.type === "date_reached") {
      const f = fields.find((x) => x.id === t.field_id);
      const off = Number(t.offset_days ?? 0);
      const offTxt = off === 0 ? "on the day" : off < 0 ? `${-off}d before` : `${off}d after`;
      return `${base} (${f?.label ?? "?"}, ${offTxt})`;
    }
    return base;
  };

  return (
    <div className="space-y-4">
      {/* Existing automations */}
      {automations.map((a) => {
        const aRuns = runs.filter((r) => r.automation_id === a.id).slice(0, 5);
        return (
          <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${a.status === "active" ? "bg-green-500" : "bg-slate-300"}`} />
              <span className="font-medium">{a.name}</span>
              <span className="ml-auto flex gap-3 text-xs">
                <button onClick={() => setRunPanel(runPanel === a.id ? null : a.id)}
                  className="text-slate-500 hover:text-blue-600">
                  {runPanel === a.id ? "close" : "run / test"}
                </button>
                <button onClick={() => toggleStatus(a)} className="text-slate-500 hover:text-blue-600">
                  {a.status === "active" ? "pause" : "activate"}
                </button>
                <button onClick={() => remove(a.id)} className="text-slate-400 hover:text-red-600">
                  delete
                </button>
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              When <span className="font-medium">{triggerLabel(a.trigger)}</span>
              {(a.conditions ?? []).length > 0 && " (with condition)"} →{" "}
              {(a.actions ?? []).map((x: any) =>
                ACTION_TYPES.find((t) => t.value === x.type)?.label ?? x.type
              ).join(", ")}
            </p>
            {runPanel === a.id && (
              <RunNowPanel automation={a} appId={appId} onDone={() => router.refresh()} />
            )}
            {aRuns.length > 0 && (
              <div className="mt-2 text-xs text-slate-400">
                <div className="flex flex-wrap items-center gap-2">
                  Recent runs:
                  {aRuns.map((r) => (
                    <button key={r.id}
                      onClick={() => setExpandedRun(expandedRun === r.id ? null : r.id)}
                      title={r.error ?? "click for details"}
                      className={`underline decoration-dotted underline-offset-2 ${
                        r.status === "success" ? "text-green-600" :
                        r.status === "cancelled" ? "text-slate-400" : "text-red-500"
                      } ${expandedRun === r.id ? "font-semibold" : ""}`}>
                      {r.status === "success" ? "✓" : r.status === "cancelled" ? "○" : "✕"}
                      {r.is_test ? "ᵗ" : ""}
                    </button>
                  ))}
                </div>
                {aRuns.filter((r) => r.id === expandedRun).map((r) => (
                  <RunDetail key={r.id} run={r} />
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
            {trigger === "date_reached" && (
              <>
                <select value={dateField} onChange={(e) => setDateField(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">— date field —</option>
                  {dateFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <input type="number" value={dateOffset}
                  onChange={(e) => setDateOffset(e.target.value)}
                  className="w-20 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <span className="text-xs text-slate-500">
                  days offset (0 = on the day, -1 = day before) · checked every 15 min, UTC dates
                </span>
                {dateFields.length === 0 && (
                  <span className="text-xs text-amber-600">This app has no date fields yet.</span>
                )}
              </>
            )}
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
                {a.type === "http_request" && (
                  <>
                    <select value={a.method ?? "post"}
                      onChange={(e) => setAction(i, { method: e.target.value })}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="post">POST</option>
                      <option value="get">GET</option>
                    </select>
                    <input placeholder="https://example.com/hook" value={a.url ?? ""}
                      onChange={(e) => setAction(i, { url: e.target.value })}
                      className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm font-mono" />
                    {(a.method ?? "post") === "post" && (
                      <input placeholder='JSON body (optional; default: {"item_id": …})'
                        value={a.body_raw ?? ""}
                        onChange={(e) => setAction(i, { body_raw: e.target.value })}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono" />
                    )}
                  </>
                )}
                {a.type === "update_related_item" && (() => {
                  const relField = relFields.find((f) => f.id === a.relationship_field_id);
                  const targetAppId = relField?.config.related_app_id;
                  const targetFields = targetAppId ? relAppFields[targetAppId] : undefined;
                  const targetField = (targetFields ?? []).find((f) => f.id === a.field_id);
                  return (
                    <>
                      <select value={a.relationship_field_id ?? ""}
                        onChange={(e) => {
                          const rf = relFields.find((f) => f.id === e.target.value);
                          setAction(i, { relationship_field_id: e.target.value, field_id: "", value: "" });
                          if (rf?.config.related_app_id) void loadRelAppFields(rf.config.related_app_id);
                        }}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                        <option value="">— relationship —</option>
                        {relFields.map((f) => <option key={f.id} value={f.id}>via {f.label}</option>)}
                      </select>
                      {relFields.length === 0 && (
                        <span className="text-xs text-amber-600">This app has no relationship fields.</span>
                      )}
                      {targetAppId && (
                        <>
                          <span className="text-xs text-slate-500">set</span>
                          <select value={a.field_id ?? ""}
                            onChange={(e) => setAction(i, { field_id: e.target.value })}
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                            <option value="">— field on related item —</option>
                            {(targetFields ?? [])
                              .filter((f) => ["text","category","number","progress"].includes(f.type))
                              .map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                          </select>
                          {targetField?.type === "category" ? (
                            <select value={a.value ?? ""}
                              onChange={(e) => setAction(i, { value: e.target.value })}
                              className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                              <option value="">— option —</option>
                              {(targetField.config.options ?? []).map((o) => (
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
                    </>
                  );
                })()}
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
