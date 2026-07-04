import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Email providers (Resend, Postmark, SendGrid inbound parse) POST here.
// Secure with INBOUND_EMAIL_SECRET: POST /api/inbound-email?secret=...
export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret || url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  // Normalize common provider payload shapes
  const to =
    body.to?.[0]?.address ?? body.To ?? body.to ?? body.recipient ?? "";
  const from =
    body.from?.address ?? body.From ?? body.from ?? body.sender ?? "";
  const subject = body.subject ?? body.Subject ?? "";
  const text = body.text ?? body.TextBody ?? body["body-plain"] ?? "";
  const html = body.html ?? body.HtmlBody ?? body["body-html"] ?? null;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "podio" }, auth: { persistSession: false } }
  );
  const { data, error } = await sb.rpc("process_inbound_email", {
    p_to: String(to),
    p_from: String(from),
    p_subject: String(subject),
    p_body_text: String(text),
    p_body_html: html ? String(html) : null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
