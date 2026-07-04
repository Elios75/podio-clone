import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM = `You suggest workflow automations for apps on a Podio-style work platform. Given an app's name, item name, fields, and existing automation names, output ONLY a JSON object (no markdown fences) with this shape:
{"suggestions":[{
  "name": short str,
  "trigger": {"type": "item_created"|"item_updated"|"comment_added"|"task_completed"},
  "conditions": [{"field_external_id": str, "op": "equals"|"not_equals"|"gt"|"lt", "value": str}] (optional, omit if none),
  "actions": [ {"type":"create_task","title":str,"due_days":int?} | {"type":"update_field","field_external_id":str,"value":str} | {"type":"add_comment","body":str} ],
  "rationale": one sentence
}]}
Rules: suggest 2-3 practical automations that make real workflow sense for this specific app; do NOT duplicate any of the existing automation names; every field_external_id must be one of the provided fields' external_ids; for category fields, condition values and update_field values MUST be option ids from the provided options (never labels); gt/lt only on numeric fields; keep names short and practical.`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "AI suggestions not configured (set ANTHROPIC_API_KEY)" }, { status: 501 });
  }
  const { appName, itemName, fields, existing } = await req.json().catch(() => ({}));
  if (!appName?.trim()) return NextResponse.json({ error: "appName required" }, { status: 400 });

  const fieldList = (Array.isArray(fields) ? fields : [])
    .filter((f: any) => f?.external_id)
    .map((f: any) => ({
      external_id: String(f.external_id),
      label: String(f.label ?? ""),
      type: String(f.type ?? ""),
      ...(Array.isArray(f.options) && f.options.length > 0
        ? { options: f.options.map((o: any) => ({ id: String(o.id), label: String(o.label ?? "") })) }
        : {}),
    }));

  const userMsg = JSON.stringify({
    appName: String(appName).slice(0, 200),
    itemName: String(itemName ?? "Item").slice(0, 100),
    fields: fieldList,
    existing_automation_names: (Array.isArray(existing) ? existing : []).map((n: any) => String(n)),
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg.slice(0, 8000) }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data?.error?.message ?? "AI request failed" }, { status: 502 });
  }
  const text: string = data?.content?.[0]?.text ?? "";
  const jsonText = text.replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim();
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed?.suggestions)) throw new Error("missing suggestions array");
    return NextResponse.json({ suggestions: parsed.suggestions });
  } catch (e: any) {
    return NextResponse.json({ error: `could not parse AI output: ${e.message}` }, { status: 502 });
  }
}
