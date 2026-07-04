import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { NextResponse } from "next/server";

export function hashKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "podio" }, auth: { persistSession: false } }
  );
}

export async function apiCall(req: Request, action: string, params: Record<string, any> = {}) {
  const auth = req.headers.get("authorization") ?? "";
  const raw = auth.replace(/^Bearer\s+/i, "").trim();
  if (!raw) {
    return NextResponse.json(
      { error: "Missing Authorization: Bearer <api_key>" },
      { status: 401 }
    );
  }

  const sb = anonClient();
  const { data, error } = await sb.rpc("api_request", {
    p_key_hash: hashKey(raw),
    p_action: action,
    p_params: params,
  });

  if (error) {
    const msg = error.message ?? "request failed";
    const status = msg.includes("invalid api key") ? 401
      : msg.includes("lacks write scope") ? 403
      : msg.includes("not found") ? 404
      : 400;
    return NextResponse.json({ error: msg }, { status });
  }
  return NextResponse.json(data);
}
