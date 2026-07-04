import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "podio" }, auth: { persistSession: false } }
  );
}

// POST /api/forms/submit — webform submission with optional Turnstile verification.
// Body: { slug, values, email?, captcha_token? }
// Captcha is verified when TURNSTILE_SECRET_KEY is configured; forms with
// captcha_enabled render the widget when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { slug, values, email, captcha_token } = body ?? {};
  if (!slug || typeof values !== "object") {
    return NextResponse.json({ error: "slug and values are required" }, { status: 400 });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (secret) {
    if (!captcha_token) {
      return NextResponse.json({ error: "captcha token missing" }, { status: 400 });
    }
    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: captcha_token }),
    }).then((r) => r.json()).catch(() => ({ success: false }));
    if (!verify.success) {
      return NextResponse.json({ error: "captcha verification failed" }, { status: 400 });
    }
  }

  const { data, error } = await anonClient().rpc("submit_webform", {
    p_slug: slug,
    p_values: values,
    p_submitter_email: email || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item_id: data });
}
