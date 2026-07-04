import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "podio" }, auth: { persistSession: false } }
  );
}

async function verify(token: string | null) {
  if (!token) {
    return NextResponse.json({ error: "missing verify token" }, { status: 400 });
  }
  const { data, error } = await anonClient().rpc("verify_webhook", { p_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// GET /api/v1/webhooks/verify?token=…  (simple endpoints)
export async function GET(req: Request) {
  return verify(new URL(req.url).searchParams.get("token"));
}

// POST /api/v1/webhooks/verify  { "token": "…" } or { "verify_token": "…" }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return verify(body.token ?? body.verify_token ?? null);
}
