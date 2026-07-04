import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PRICE_ENV: Record<string, string | undefined> = {
  team: process.env.STRIPE_PRICE_TEAM,
  business: process.env.STRIPE_PRICE_BUSINESS,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

// POST /api/billing/checkout { org_id, plan } → { url } (Stripe Checkout)
export async function POST(req: Request) {
  const { org_id, plan } = await req.json().catch(() => ({}));
  if (!org_id || !["team", "business", "enterprise"].includes(plan)) {
    return NextResponse.json({ error: "org_id and a paid plan are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { data: member } = await supabase
    .from("organization_members")
    .select("role").eq("organization_id", org_id).eq("user_id", user.id)
    .maybeSingle();
  if (member?.role !== "owner") {
    return NextResponse.json({ error: "only the org owner can upgrade" }, { status: 403 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const price = PRICE_ENV[plan];
  if (!secretKey || !price) {
    return NextResponse.json(
      { error: "Stripe is not configured (set STRIPE_SECRET_KEY and STRIPE_PRICE_* env vars)" },
      { status: 501 }
    );
  }

  const origin = new URL(req.url).origin;
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/org?billing=success`,
    cancel_url: `${origin}/org?billing=cancelled`,
    "metadata[org_id]": org_id,
    "metadata[plan]": plan,
    "subscription_data[metadata][org_id]": org_id,
    "subscription_data[metadata][plan]": plan,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const session = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: session?.error?.message ?? "stripe error" }, { status: 502 });
  }
  return NextResponse.json({ url: session.url });
}
