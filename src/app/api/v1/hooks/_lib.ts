import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { hashKey } from "@/lib/api-auth";

// Local twin of api-auth's apiCall, pointed at the hooks_api RPC
// (apiCall is hardwired to api_request, which the hooks slice must not touch).

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "podio" }, auth: { persistSession: false } }
  );
}

export async function hooksCall(
  req: Request,
  action: string,
  params: Record<string, unknown> = {}
) {
  const auth = req.headers.get("authorization") ?? "";
  const raw = auth.replace(/^Bearer\s+/i, "").trim();
  if (!raw) {
    return NextResponse.json(
      { error: "Missing Authorization: Bearer <api_key>" },
      { status: 401 }
    );
  }

  const sb = anonClient();
  const { data, error } = await sb.rpc("hooks_api", {
    p_key_hash: hashKey(raw),
    p_action: action,
    p_params: params,
  });

  if (error) {
    const msg = error.message ?? "request failed";
    const status = msg.includes("invalid api key") ? 401
      : msg.includes("lacks write scope") ? 403
      : msg.includes("rate limit exceeded") ? 429
      : msg.includes("not found") ? 404
      : msg.includes("invalid verification code") ? 422
      : 400;
    return NextResponse.json({ error: msg }, { status });
  }
  return NextResponse.json(data);
}
