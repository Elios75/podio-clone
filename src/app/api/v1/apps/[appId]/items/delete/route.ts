// POST /api/v1/apps/:appId/items/delete  { item_ids: [uuid, ...] }
// Bulk soft-delete (max 100 per call). Mirrors delete_item semantics
// (is_deleted/deleted_at + one item_deleted activity event per item).
//
// Self-contained copy of the items_api calling helper (the shared one lives
// under src/app/api/v1/items/[itemId]/items-api.ts; duplicated here to avoid
// importing across dynamic-segment route trees).
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { hashKey } from "@/lib/api-auth";

async function itemsApiCall(
  req: Request,
  action: string,
  params: Record<string, any> = {}
) {
  const auth = req.headers.get("authorization") ?? "";
  const raw = auth.replace(/^Bearer\s+/i, "").trim();
  if (!raw) {
    return NextResponse.json(
      { error: "Missing Authorization: Bearer <api_key>" },
      { status: 401 }
    );
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "podio" }, auth: { persistSession: false } }
  );
  const { data, error } = await sb.rpc("items_api", {
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
      : 400;
    return NextResponse.json({ error: msg }, { status });
  }
  return NextResponse.json(data);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const body = await req.json().catch(() => ({}));
  return itemsApiCall(req, "items.bulk_delete", {
    app_id: appId,
    item_ids: Array.isArray(body.item_ids) ? body.item_ids : [],
  });
}
