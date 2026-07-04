import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "podio" }, auth: { persistSession: false } }
  );
}

function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  // header: t=timestamp,v1=signature[,v1=…]
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string])
  );
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac("sha256", secret)
    .update(`${parts.t}.${payload}`)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}

// POST /api/billing/webhook — Stripe events (checkout.session.completed,
// customer.subscription.deleted). Requires STRIPE_WEBHOOK_SECRET and
// STRIPE_RPC_PROOF (matching the 'stripe_rpc_proof' Vault secret).
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const proof = process.env.STRIPE_RPC_PROOF;
  if (!secret || !proof) {
    return NextResponse.json({ error: "billing webhook not configured" }, { status: 501 });
  }
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  if (!verifyStripeSignature(payload, sig, secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const event = JSON.parse(payload);
  let orgId: string | undefined;
  let plan: string | undefined;

  if (event.type === "checkout.session.completed") {
    orgId = event.data?.object?.metadata?.org_id;
    plan = event.data?.object?.metadata?.plan;
  } else if (event.type === "customer.subscription.deleted") {
    orgId = event.data?.object?.metadata?.org_id;
    plan = "free"; // subscription ended → downgrade
  } else {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  if (!orgId || !plan) return NextResponse.json({ received: true, ignored: "no metadata" });

  const { error } = await anonClient().rpc("apply_stripe_plan", {
    p_org: orgId, p_plan: plan, p_proof: proof,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ received: true, applied: plan });
}
