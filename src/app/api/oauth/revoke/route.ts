import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "podio" }, auth: { persistSession: false } }
  );
}

// RFC 7009 style: takes `token` (form-urlencoded or JSON), or falls back to the
// bearer token in the Authorization header. Always 200 for unknown tokens.
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  let token = "";
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    token = String(body?.token ?? "");
  } else {
    const text = await req.text().catch(() => "");
    token = new URLSearchParams(text).get("token") ?? "";
  }
  if (!token) {
    const auth = req.headers.get("authorization") ?? "";
    token = auth.replace(/^Bearer\s+/i, "").trim();
  }
  if (!token) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "token is required" },
      { status: 400 }
    );
  }

  const { data, error } = await anonClient().rpc("oauth_revoke", { p_token: token });
  if (error) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return NextResponse.json(data ?? { revoked: false });
}
