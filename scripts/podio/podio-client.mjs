// Minimal Podio API client for the workspace importer (Phase 0 spike).
// Reads PODIO_CLIENT_ID / PODIO_CLIENT_SECRET / PODIO_REFRESH_TOKEN from
// .env.local, refreshes an access token, and exposes a throttled GET/POST.
// Podio auth header scheme is `Authorization: OAuth2 <token>`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

export async function podioAuth() {
  const env = loadEnv();
  for (const k of ["PODIO_CLIENT_ID", "PODIO_CLIENT_SECRET", "PODIO_REFRESH_TOKEN"]) {
    if (!env[k]) throw new Error(`missing ${k} in .env.local`);
  }
  const res = await fetch("https://api.podio.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.PODIO_REFRESH_TOKEN,
      client_id: env.PODIO_CLIENT_ID,
      client_secret: env.PODIO_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  const tok = await res.json();
  return { accessToken: tok.access_token, raw: tok };
}

// Gentle throttle: Podio allows 1,000 req/h (250/h for heavy endpoints like
// item filter). ~1 req/1.5s keeps a long import safely under both.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeApi(accessToken, { delayMs = 1500 } = {}) {
  async function call(method, path, body) {
    await sleep(delayMs);
    const res = await fetch(`https://api.podio.com${path}`, {
      method,
      headers: {
        Authorization: `OAuth2 ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) throw new Error(`podio rate limited on ${path}`);
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
  };
}
