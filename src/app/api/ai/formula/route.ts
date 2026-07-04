import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM = `You write formulas for a simple calculation engine on a Podio-style work platform.
The engine evaluates plain arithmetic over numeric fields of the same item. A formula may contain ONLY:
- field tokens of the form {external_id}, taken from the numeric fields the user provides
- the characters + - * / ( ) . digits and spaces
No functions, no conditionals, no comparisons, no min/max, no rounding, no text — the engine does not support them.
Output ONLY a JSON object (no markdown fences): {"formula": "...", "explanation": "one sentence"}
Example: {"formula": "({deal-value} * 0.2) + {fee}", "explanation": "20% of the deal value plus the fixed fee."}
If the request cannot be expressed in this arithmetic (needs IF, MIN/MAX, rounding, dates, text, fields that don't exist), output {"error": "short reason"} instead.`;

type AiField = { external_id: string; label: string; type: string };

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "AI formula builder not configured (set ANTHROPIC_API_KEY)" }, { status: 501 });
  }
  const { prompt, fields } = await req.json().catch(() => ({}));
  if (!prompt?.trim()) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  const fieldList: AiField[] = (Array.isArray(fields) ? fields : [])
    .filter((f: any) => typeof f?.external_id === "string" && f.external_id)
    .map((f: any) => ({ external_id: f.external_id, label: String(f.label ?? ""), type: String(f.type ?? "") }));

  const userMsg =
    "Available numeric fields (token — label — type):\n" +
    (fieldList.length > 0
      ? fieldList.map((f) => `{${f.external_id}} — ${f.label} — ${f.type}`).join("\n")
      : "(none)") +
    `\n\nRequest: ${String(prompt).slice(0, 1000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data?.error?.message ?? "AI request failed" }, { status: 502 });
  }
  const text: string = data?.content?.[0]?.text ?? "";
  const jsonText = text.replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e: any) {
    return NextResponse.json({ error: `could not parse AI output: ${e.message}` }, { status: 502 });
  }
  if (parsed?.error) {
    return NextResponse.json({ error: String(parsed.error) }, { status: 422 });
  }
  const formula = String(parsed?.formula ?? "").trim();
  if (!formula) {
    return NextResponse.json({ error: "AI returned no formula" }, { status: 502 });
  }
  // Validate exactly like the engine: substitute every known token with "1",
  // then require only digits, + - * / ( ) . and spaces to remain.
  let substituted = formula;
  for (const f of fieldList) {
    substituted = substituted.split(`{${f.external_id}}`).join("1");
  }
  if (!/^[0-9+\-*/(). ]+$/.test(substituted)) {
    return NextResponse.json(
      { error: "AI produced a formula the engine can't evaluate (unknown field tokens or unsupported syntax) — try rephrasing" },
      { status: 422 });
  }
  return NextResponse.json({ formula, explanation: String(parsed?.explanation ?? "") });
}
