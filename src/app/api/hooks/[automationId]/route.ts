import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "podio" }, auth: { persistSession: false } }
  );
}

// POST /api/hooks/:automationId?token=…
// Body: { values?: { "<field-external-id>": value }, title?, item_id? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ automationId: string }> }
) {
  const { automationId } = await params;
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const token = url.searchParams.get("token") ?? body._token ?? null;
  if (!token) {
    return NextResponse.json({ error: "missing token (?token=… or _token in body)" }, { status: 401 });
  }

  const { data, error } = await anonClient().rpc("trigger_inbound_webhook", {
    p_automation: automationId,
    p_token: token,
    p_payload: body,
  });
  if (error) {
    const status = error.message.includes("invalid webhook token") ? 401
      : error.message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
