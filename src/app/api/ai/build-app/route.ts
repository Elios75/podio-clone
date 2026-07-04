import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM = `You design business apps for a Podio-style work platform. Given a user's description, output ONLY a JSON object (no markdown fences) with this shape:
{
  "app": { "name": str, "icon": one emoji, "item_name": singular noun, "description": str },
  "category": one of crm|project_management|help_desk|recruiting|real_estate|accounting|field_service|asset_tracking|client_onboarding|event_management,
  "fields": [ { "external_id": kebab-case str, "label": str, "type": one of text|category|date|number|money|progress|phone|email|link|location|duration, "help_text": str?, "is_required": bool, "is_primary": bool (exactly one text field true), "position": int, "config": { "options": [{"id": kebab-str, "label": str, "color": hex}] (category only) } } ],
  "views": [ { "name": str, "layout": one of table|card|kanban|calendar, "is_default": bool (one true), "position": int, "settings": {} } ],
  "automations": [ { "name": str, "trigger": {"type": "item_created"|"item_updated"|"comment_added"|"task_completed"}, "conditions": [{"field_external_id": str, "op": "equals"|"not_equals"|"gt"|"lt", "value": str}]?, "actions": [ {"type":"create_task","title":str,"due_days":int?} | {"type":"update_field","field_external_id":str,"value":str} | {"type":"add_comment","body":str} ] } ]
}
Rules: 4-10 fields; category fields need 3-6 options with distinct colors; kanban views suit category-heavy apps, calendar suits date-heavy; 0-3 automations that make real workflow sense; keep names short and practical.`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "AI builder not configured (set ANTHROPIC_API_KEY)" }, { status: 501 });
  }
  const { prompt } = await req.json().catch(() => ({}));
  if (!prompt?.trim()) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt.slice(0, 4000) }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data?.error?.message ?? "AI request failed" }, { status: 502 });
  }
  const text: string = data?.content?.[0]?.text ?? "";
  const jsonText = text.replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim();
  try {
    const definition = JSON.parse(jsonText);
    if (!definition?.app?.name || !Array.isArray(definition.fields)) {
      throw new Error("missing app.name or fields");
    }
    return NextResponse.json({ definition });
  } catch (e: any) {
    return NextResponse.json({ error: `could not parse AI output: ${e.message}` }, { status: 502 });
  }
}
