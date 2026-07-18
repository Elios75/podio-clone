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

// Accepts application/x-www-form-urlencoded (OAuth2 standard) and JSON bodies.
async function readParams(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body ?? {})) {
      if (v != null) out[k] = String(v);
    }
    return out;
  }
  const text = await req.text().catch(() => "");
  return Object.fromEntries(new URLSearchParams(text).entries());
}

function oauthError(error: string, status: number, description?: string) {
  return NextResponse.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status }
  );
}

// Maps RPC exception messages (raised as OAuth error codes) to HTTP responses.
function mapRpcError(message: string) {
  if (message.includes("invalid_client")) return oauthError("invalid_client", 401);
  if (message.includes("invalid_grant")) return oauthError("invalid_grant", 400);
  if (message.includes("unsupported_grant_type"))
    return oauthError("unsupported_grant_type", 400);
  if (message.includes("invalid_redirect_uri"))
    return oauthError("invalid_grant", 400, "redirect_uri is not registered");
  return oauthError("invalid_request", 400, message);
}

export async function POST(req: Request) {
  const p = await readParams(req);
  const grantType = p.grant_type ?? "";
  const clientId = p.client_id ?? "";
  const clientSecret = p.client_secret ?? "";

  if (!grantType) return oauthError("invalid_request", 400, "grant_type is required");
  if (!clientId || !clientSecret)
    return oauthError("invalid_client", 401, "client_id and client_secret are required");

  const sb = anonClient();

  // Password grant: verify credentials against gotrue here (cannot be done in
  // SQL), then have a definer RPC issue the token for the verified user id.
  if (grantType === "password") {
    const username = p.username ?? "";
    const password = p.password ?? "";
    if (!username || !password)
      return oauthError("invalid_request", 400, "username and password are required");

    const { data: auth, error: authError } = await sb.auth.signInWithPassword({
      email: username,
      password,
    });
    if (authError || !auth.user)
      return oauthError("invalid_grant", 400, "invalid username or password");
    await sb.auth.signOut().catch(() => {});

    const scopes = (p.scope ?? "").split(/\s+/).filter(Boolean);
    const { data, error } = await anonClient().rpc("oauth_issue_for_user", {
      p_client_id: clientId,
      p_client_secret: clientSecret,
      p_user: auth.user.id,
      p_scopes: scopes,
    });
    if (error) return mapRpcError(error.message ?? "request failed");
    return NextResponse.json(data);
  }

  // authorization_code | refresh_token | app (client_credentials alias) → single RPC.
  const { data, error } = await sb.rpc("oauth_token_exchange", {
    p_grant_type: grantType === "client_credentials" ? "app" : grantType,
    p_client_id: clientId,
    p_client_secret: clientSecret,
    p_code: p.code ?? null,
    p_refresh_token: p.refresh_token ?? null,
    p_username: null,
    p_password: null,
    p_app_id: p.app_id ?? null,
  });
  if (error) return mapRpcError(error.message ?? "request failed");
  return NextResponse.json(data);
}
