// podio-import-worker: drives queued Podio imports (podio.import_runs with
// status 'queued'/'running') as a RESUMABLE STATE MACHINE. A pg_cron tick
// (podio.register_podio_import_cron, migration 87) POSTs here every minute;
// each tick spends a small budget of Podio API calls, advances the run's
// cursor, persists it, and returns. All clone-side writes go through the
// idempotent podio.import_api dispatcher, so re-processing a partial batch
// after a crash is safe.
//
// This is a port of scripts/podio/import-space.mjs (phase order, endpoints,
// mapping) restructured to survive being cut off at any point.
//
// Auth: Authorization: Bearer <podio_import_worker_token vault secret>.
// Config (read from Vault via the direct DB connection, service level):
//   podio_import_worker_token — must equal the request's bearer token
//   podio_import_key_hash     — p_key_hash for every podio.import_api call
// SUPABASE_DB_URL is injected automatically into edge functions.
//
// Deploy with verify_jwt=false; this endpoint is machine-called only (no CORS).

import postgres from "npm:postgres@3.4.5";
import { mapApp, mapItemValues, mapComment, mapTask } from "./mapper.ts";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const PODIO_BUDGET = 40;        // max Podio API calls per tick
const PODIO_THROTTLE_MS = 800;  // pause before each Podio call
const MAX_CONSECUTIVE_ERRORS = 5;
const ITEMS_PAGE = 100;
const TASKS_PAGE = 30;
const COMMENT_FALLBACK_CAP = 50; // when Podio omits comment_count entirely

// ---------------------------------------------------------------------------
// Cursor: the run's entire resumable state. Kept deliberately small — podio
// ids, offsets, and the field metadata of the ONE app currently being paged.
//
// {
//   phase: "start" | "members" | "apps_list" | "apps" | "link_references"
//        | "items" | "link_refs" | "comments" | "tasks" | "finish" | "done",
//   error_count: number,           // consecutive failed ticks
//   run_start_done: boolean,       // run.start called exactly once
//   workspace_id: uuid,            // from run.start
//   key_user_id: uuid,             // import key's owning user (author_note)
//   member_map: { "<podio_user_id>": uuid | null },
//   app_ids: number[],             // podio app ids of the space (fixed order)
//   app_idx: number,               // progress through app_ids (apps + items)
//   items_app_id: number,          // which app cursor.app_fields belongs to
//   app_fields: mapped fields[],   // ONLY the current items-phase app
//   item_offset: number, item_total: number | null,
//   pending_ref_items: number[],   // podio item ids needing link_refs pass 2
//   comment_items: number[],       // podio item ids with comment_count > 0
//   saw_comment_count: boolean,
//   task_offset: number,
// }
// Queues (pending_ref_items / comment_items) are drained front-first so the
// cursor shrinks as work completes. Ref/file payloads are NOT stored — the
// link_refs phase re-fetches each item (1 Podio call) and files are written
// inline during the items phase (item.add_file only touches the item just
// upserted, so no second pass is needed).
// ---------------------------------------------------------------------------

class BudgetExhausted extends Error {
  constructor() { super("tick budget exhausted"); }
}
class PodioRateLimited extends Error {
  constructor(path: string) { super(`podio rate limited on ${path}`); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// DB access: one postgres.js client over SUPABASE_DB_URL (service level —
// reaches vault.decrypted_secrets and the podio schema without PostgREST).
// ---------------------------------------------------------------------------
let _sql: any = null;
function db() {
  if (!_sql) {
    const url = Deno.env.get("SUPABASE_DB_URL");
    if (!url) throw new Error("SUPABASE_DB_URL not set");
    _sql = postgres(url, { prepare: false, max: 2, idle_timeout: 20 });
  }
  return _sql;
}

async function vaultSecrets(sql: any, names: string[]) {
  const rows = await sql`
    select name, decrypted_secret from vault.decrypted_secrets
    where name in ${sql(names)}`;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.name] = r.decrypted_secret;
  return out;
}

// ---------------------------------------------------------------------------
// Tick state
// ---------------------------------------------------------------------------
type Tick = {
  sql: any;
  keyHash: string;
  run: any;                 // our import_runs row
  spaceId: number;
  cursor: any;
  counts: Record<string, number>;
  notes: string[];          // notes gathered THIS tick (appended via run.progress)
  accessToken: string;
  budget: number;
};

// Our-side RPC (local + unmetered against the Podio budget). import_api is
// idempotent for every action, so replays are safe.
async function importApi(t: Tick, action: string, params: Record<string, unknown>) {
  const rows = await t.sql`
    select podio.import_api(${t.keyHash}, ${action}, ${JSON.stringify(params)}::jsonb) as result`;
  return rows[0]?.result;
}

// Podio call: budget-metered + throttled. Throws BEFORE consuming anything
// when the budget is gone, so the interrupted step replays cleanly next tick.
async function podioCall(t: Tick, method: string, path: string, body?: unknown) {
  if (t.budget <= 0) throw new BudgetExhausted();
  t.budget--;
  await sleep(PODIO_THROTTLE_MS);
  const res = await fetch(`https://api.podio.com${path}`, {
    method,
    headers: {
      Authorization: `OAuth2 ${t.accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429) throw new PodioRateLimited(path);
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}
const podioGet = (t: Tick, path: string) => podioCall(t, "GET", path);
const podioPost = (t: Tick, path: string, body: unknown) => podioCall(t, "POST", path, body);

const isControl = (e: unknown) => e instanceof BudgetExhausted || e instanceof PodioRateLimited;

function memberMapOf(t: Tick): Map<number, string | null> {
  const m = new Map<number, string | null>();
  for (const [k, v] of Object.entries(t.cursor.member_map ?? {})) {
    m.set(Number(k), (v as string | null) ?? null);
  }
  return m;
}

// Persist everything resumable: cursor + counts + phase directly (service
// level), plus a run.progress call when there are new notes to append.
async function persist(t: Tick) {
  await t.sql`
    update podio.import_runs
    set cursor = ${JSON.stringify(t.cursor)}::jsonb,
        counts = ${JSON.stringify(t.counts)}::jsonb,
        phase = ${t.cursor.phase ?? "start"},
        updated_at = now()
    where id = ${t.run.id}`;
  if (t.notes.length) {
    try {
      await importApi(t, "run.progress", {
        run_id: t.run.id,
        phase: t.cursor.phase ?? "start",
        counts: t.counts,
        notes_append: t.notes,
      });
      t.notes = [];
    } catch {
      // notes are best-effort; counts/cursor are already saved
    }
  }
}

async function failRun(t: Tick, message: string) {
  t.cursor.phase = "done";
  await t.sql`
    update podio.import_runs
    set status = 'failed',
        error = ${message.slice(0, 500)},
        cursor = ${JSON.stringify(t.cursor)}::jsonb,
        counts = ${JSON.stringify(t.counts)}::jsonb,
        updated_at = now()
    where id = ${t.run.id}`;
}

// ---------------------------------------------------------------------------
// State machine — one step() call handles the current phase's next chunk.
// Every step either consumes >= 1 Podio call or advances the phase, so the
// loop always terminates. Phase order mirrors import-space.mjs.
// ---------------------------------------------------------------------------
async function step(t: Tick): Promise<boolean /* run finished */> {
  const c = t.cursor;
  switch (c.phase ?? "start") {

    // -- Phase 1a: space + run.start (exactly once) --------------------------
    case "start": {
      const space = await podioGet(t, `/space/${t.spaceId}`);
      if (!c.run_start_done) {
        const started = await importApi(t, "run.start", {
          space_id: t.spaceId,
          space_name: space.name,
        });
        // run.start inserts its OWN import_runs row; our queued row is the
        // real run. Adopt the workspace it created/mapped, then delete the
        // duplicate row so the queue picker never sees it.
        await t.sql`
          update podio.import_runs
          set workspace_id = ${started.workspace_id},
              source_space_name = ${space.name ?? null},
              status = 'running',
              updated_at = now()
          where id = ${t.run.id}`;
        if (started.run_id && started.run_id !== t.run.id) {
          await t.sql`delete from podio.import_runs where id = ${started.run_id}`;
        }
        c.run_start_done = true;
        c.workspace_id = started.workspace_id;
        c.key_user_id = started.user_id;
      }
      c.phase = "members";
      return false;
    }

    // -- Phase 1b: members -> member_map (best-effort) -----------------------
    case "members": {
      try {
        const members = await podioGet(t, `/space/${t.spaceId}/member/`);
        const emails = [...new Set(members.map((m: any) => m.user?.mail).filter(Boolean))];
        const matched = emails.length
          ? await importApi(t, "members.match", { run_id: t.run.id, emails })
          : {};
        const map: Record<string, string | null> = {};
        for (const m of members) {
          const uid = m.profile?.user_id ?? m.user?.user_id;
          if (uid != null) map[String(uid)] = (matched as any)[m.user?.mail] ?? null;
        }
        c.member_map = map;
      } catch (e) {
        if (isControl(e)) throw e;
        t.notes.push(`members phase failed (continuing without user matching): ${(e as Error).message}`);
        c.member_map = {};
      }
      c.phase = "apps_list";
      return false;
    }

    // -- Phase 2a: list apps of the space ------------------------------------
    case "apps_list": {
      const appList = await podioGet(t, `/app/space/${t.spaceId}/`);
      c.app_ids = appList.map((a: any) => a.app_id);
      c.app_idx = 0;
      c.phase = "apps";
      return false;
    }

    // -- Phase 2b: app.upsert one app per step -------------------------------
    case "apps": {
      const ids: number[] = c.app_ids ?? [];
      if ((c.app_idx ?? 0) >= ids.length) {
        c.phase = "link_references";
        return false;
      }
      const appId = ids[c.app_idx];
      const full = await podioGet(t, `/app/${appId}`);
      const mapped = mapApp(full);
      await importApi(t, "app.upsert", {
        run_id: t.run.id,
        podio_app_id: appId,
        app: mapped.app,
        fields: mapped.fields,
      });
      t.counts.apps = (t.counts.apps ?? 0) + 1;
      t.counts.fields = (t.counts.fields ?? 0) + mapped.fields.length;
      for (const n of mapped.notes ?? []) t.notes.push(n);
      c.app_idx++;
      return false;
    }

    // -- Phase 3: relationship field targets (local calls only) --------------
    case "link_references": {
      for (const appId of c.app_ids ?? []) {
        try {
          await importApi(t, "app.link_references", { run_id: t.run.id, podio_app_id: appId });
        } catch (e) {
          if (isControl(e)) throw e;
          t.notes.push(`link_references failed for app ${appId}: ${(e as Error).message}`);
        }
      }
      c.app_idx = 0;
      c.item_offset = 0;
      c.item_total = null;
      c.pending_ref_items = [];
      c.comment_items = [];
      c.saw_comment_count = false;
      c.phase = "items";
      return false;
    }

    // -- Phase 4: items — one filter page (<= 100 items) per step ------------
    case "items": {
      const ids: number[] = c.app_ids ?? [];
      if ((c.app_idx ?? 0) >= ids.length) {
        c.items_app_id = undefined;
        c.app_fields = undefined;
        c.phase = "link_refs";
        return false;
      }
      const appId = ids[c.app_idx];

      // Field metadata for THIS app only (cursor stays small): re-fetch +
      // re-map when we move onto a new app. mapApp notes were already
      // reported during the apps phase, so they are not re-emitted here.
      if (c.items_app_id !== appId || !Array.isArray(c.app_fields)) {
        const full = await podioGet(t, `/app/${appId}`);
        c.app_fields = mapApp(full).fields;
        c.items_app_id = appId;
        c.item_offset = 0;
        c.item_total = null;
        return false; // separate step: the page fetch below replays cleanly
      }

      const page = await podioPost(t, `/item/app/${appId}/filter/`, {
        limit: ITEMS_PAGE,
        offset: c.item_offset ?? 0,
      });
      const total = page.filtered ?? page.total ?? (page.items?.length ?? 0);
      const items = page.items ?? [];
      const ctx = { memberMap: memberMapOf(t) };

      for (const item of items) {
        const mv = mapItemValues(item, c.app_fields, ctx);
        await importApi(t, "item.upsert", {
          run_id: t.run.id,
          podio_app_id: appId,
          podio_item_id: item.item_id,
          title: mv.title,
          values: mv.values,
          created_on: item.created_on ?? null,
        });
        t.counts.items = (t.counts.items ?? 0) + 1;
        if (mv.refs?.length) c.pending_ref_items.push(item.item_id);
        // Files inline: add_file only needs the item we JUST upserted, so no
        // second pass (and no file payloads in the cursor) is required.
        for (const f of mv.files ?? []) {
          try {
            await importApi(t, "item.add_file", {
              run_id: t.run.id,
              podio_item_id: item.item_id,
              podio_file_id: f.podio_file_id,
              name: f.name,
              link: f.link,
              mimetype: f.mimetype,
            });
            t.counts.files = (t.counts.files ?? 0) + 1;
          } catch (e) {
            if (isControl(e)) throw e;
            t.notes.push(`add_file failed for item ${item.item_id} file ${f.podio_file_id}: ${(e as Error).message}`);
          }
        }
        if (item.comment_count !== undefined) {
          c.saw_comment_count = true;
          if (item.comment_count > 0) c.comment_items.push(item.item_id);
        } else if (c.comment_items.length < COMMENT_FALLBACK_CAP) {
          // Shape unknown: keep at most the first N candidates (the script
          // capped at 50 post-hoc; capping at insert keeps the cursor small).
          c.comment_items.push(item.item_id);
        }
        for (const n of mv.notes ?? []) t.notes.push(`item ${item.item_id}: ${n}`);
      }

      c.item_offset = (c.item_offset ?? 0) + items.length;
      c.item_total = total;
      if (!items.length || c.item_offset >= total) {
        c.app_idx++;
        c.items_app_id = undefined;
        c.app_fields = undefined;
        c.item_offset = 0;
        c.item_total = null;
      }
      return false;
    }

    // -- Phase 5: second pass — relationship values between imported items ---
    // The cursor holds only podio item ids; each step re-fetches one item and
    // extracts its app-reference values (type "app" fields).
    case "link_refs": {
      const queue: number[] = c.pending_ref_items ?? [];
      if (!queue.length) {
        c.phase = "comments";
        return false;
      }
      const itemId = queue[0];
      try {
        const item = await podioGet(t, `/item/${itemId}`);
        const refs: any[] = [];
        for (const pf of item.fields ?? []) {
          if (pf.type !== "app") continue;
          const ids = (pf.values ?? [])
            .map((v: any) => v?.value?.item_id)
            .filter((id: any) => id != null);
          if (ids.length) refs.push({ external_id: pf.external_id, podio_item_ids: ids });
        }
        if (refs.length) {
          const res = await importApi(t, "item.link_refs", {
            run_id: t.run.id,
            podio_item_id: itemId,
            refs,
          });
          t.counts.refs_linked = (t.counts.refs_linked ?? 0) + (res?.linked ?? 0);
          t.counts.refs_skipped = (t.counts.refs_skipped ?? 0) + (res?.skipped ?? 0);
        }
      } catch (e) {
        if (isControl(e)) throw e;
        t.notes.push(`link_refs failed for item ${itemId}: ${(e as Error).message}`);
      }
      queue.shift();
      return false;
    }

    // -- Phase 7 (files ran inline in phase 4): comments ---------------------
    case "comments": {
      const queue: number[] = c.comment_items ?? [];
      if (!queue.length) {
        c.task_offset = 0;
        c.phase = "tasks";
        return false;
      }
      const itemId = queue[0];
      try {
        const comments = await podioGet(t, `/comment/item/${itemId}/`);
        const memberMap = memberMapOf(t);
        for (const comment of comments ?? []) {
          const mc = mapComment(comment, { memberMap });
          const authorLocal = mc.podio_user_id != null
            ? memberMap.get(mc.podio_user_id) ?? null
            : null;
          const authorName = comment.created_by?.name ?? comment.user?.name ??
            `podio user ${mc.podio_user_id ?? "?"}`;
          const author_note =
            authorLocal && authorLocal === c.key_user_id ? null : `[imported: ${authorName}] `;
          await importApi(t, "comment.upsert", {
            run_id: t.run.id,
            podio_item_id: itemId,
            podio_comment_id: comment.comment_id,
            body: mc.body,
            created_at: mc.created_at,
            author_note,
          });
          t.counts.comments = (t.counts.comments ?? 0) + 1;
          if (mc.note) t.notes.push(`comment ${comment.comment_id}: ${mc.note}`);
        }
      } catch (e) {
        if (isControl(e)) throw e;
        t.notes.push(`comments fetch failed for item ${itemId}: ${(e as Error).message}`);
      }
      queue.shift();
      return false;
    }

    // -- Phase 8: tasks — one page per step (best-effort like the script) ----
    case "tasks": {
      try {
        const page = await podioGet(
          t,
          `/task/?space=${t.spaceId}&limit=${TASKS_PAGE}&offset=${c.task_offset ?? 0}`,
        );
        const tasks = Array.isArray(page) ? page : page.tasks ?? [];
        const ctx = { memberMap: memberMapOf(t) };
        for (const task of tasks) {
          const mt = mapTask(task, ctx);
          await importApi(t, "task.upsert", {
            run_id: t.run.id,
            podio_task_id: task.task_id,
            title: mt.title,
            description: mt.description,
            due_at: mt.due_at,
            completed_at: mt.completed_at,
          });
          t.counts.tasks = (t.counts.tasks ?? 0) + 1;
          if (mt.note) t.notes.push(`task ${task.task_id}: ${mt.note}`);
        }
        if (tasks.length < TASKS_PAGE) {
          c.phase = "finish";
        } else {
          c.task_offset = (c.task_offset ?? 0) + tasks.length;
        }
      } catch (e) {
        if (isControl(e)) throw e;
        t.notes.push(`tasks phase failed: ${(e as Error).message}`);
        c.phase = "finish";
      }
      return false;
    }

    // -- Phase 9: finish ------------------------------------------------------
    case "finish": {
      await importApi(t, "run.finish", { run_id: t.run.id, status: "completed" });
      c.phase = "done";
      c.error_count = 0;
      return true;
    }

    case "done":
      return true;

    default:
      throw new Error(`unknown cursor phase "${c.phase}"`);
  }
}

// ---------------------------------------------------------------------------
// HTTP entrypoint — one tick per POST (body ignored).
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let sql: any;
  let secrets: Record<string, string>;
  try {
    sql = db();
    secrets = await vaultSecrets(sql, [
      "podio_import_worker_token",
      "podio_import_key_hash",
    ]);
  } catch (e) {
    return Response.json({ error: `config: ${(e as Error).message}` }, { status: 500 });
  }

  // 1) Bearer auth against the vault secret.
  const token = secrets["podio_import_worker_token"];
  const auth = req.headers.get("authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const keyHash = secrets["podio_import_key_hash"];
  if (!keyHash) {
    return Response.json({ error: "podio_import_key_hash vault secret not set" }, { status: 500 });
  }

  // 2) Pick ONE run: oldest queued/running. queued_by is only set by
  //    podio_queue_import, which guards against orphan rows briefly created
  //    by run.start before this worker deletes them.
  const runs = await sql`
    select id, organization_id, source_space_id, status, phase, counts, cursor
    from podio.import_runs
    where status in ('queued', 'running') and queued_by is not null
    order by started_at asc
    limit 1`;
  if (!runs.length) return Response.json({ idle: true });
  const run = runs[0];

  const t: Tick = {
    sql,
    keyHash,
    run,
    spaceId: Number(run.source_space_id),
    cursor: (run.cursor && typeof run.cursor === "object") ? run.cursor : {},
    counts: (run.counts && typeof run.counts === "object") ? run.counts : {},
    notes: [],
    accessToken: "",
    budget: PODIO_BUDGET,
  };

  try {
    // 3) Org's Podio credentials.
    const conns = await sql`
      select client_id, client_secret, refresh_token
      from podio.podio_connections
      where organization_id = ${run.organization_id}`;
    if (!conns.length) {
      await failRun(t, "Podio not connected");
      return Response.json({ run_id: run.id, failed: true, error: "Podio not connected" });
    }
    const conn = conns[0];

    // 4) Refresh the Podio access token EVERY tick (kills 8h-expiry stalls).
    const tokRes = await fetch("https://api.podio.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refresh_token,
        client_id: conn.client_id,
        client_secret: conn.client_secret,
      }),
    });
    if (tokRes.status === 429) throw new PodioRateLimited("/oauth/token");
    if (!tokRes.ok) {
      throw new Error(`podio token refresh failed: ${tokRes.status} ${(await tokRes.text()).slice(0, 300)}`);
    }
    const tok = await tokRes.json();
    t.accessToken = tok.access_token;
    if (tok.refresh_token && tok.refresh_token !== conn.refresh_token) {
      await sql`
        update podio.podio_connections
        set refresh_token = ${tok.refresh_token}, updated_at = now()
        where organization_id = ${run.organization_id}`;
    }

    // 5) Advance the state machine until the budget throws or the run ends.
    let finished = false;
    while (!finished) finished = await step(t);

    t.cursor.error_count = 0;
    await persist(t); // run.finish already set status='completed'
    return Response.json({ run_id: run.id, done: true, counts: t.counts });
  } catch (e) {
    if (e instanceof BudgetExhausted) {
      // Normal mid-run yield: save progress, next tick resumes.
      t.cursor.error_count = 0;
      await persist(t);
      return Response.json({
        run_id: run.id,
        progress: { phase: t.cursor.phase, counts: t.counts },
      });
    }
    const msg = (e as Error)?.message ?? String(e);
    if (e instanceof PodioRateLimited || /rate limit exceeded/i.test(msg)) {
      // Podio 429 or our own key's minute limit: persist and let the next
      // tick retry. Not counted as an error.
      try { await persist(t); } catch { /* keep the tick response clean */ }
      return Response.json({
        run_id: run.id,
        rate_limited: true,
        progress: { phase: t.cursor.phase, counts: t.counts },
      });
    }
    t.cursor.error_count = (t.cursor.error_count ?? 0) + 1;
    if (t.cursor.error_count >= MAX_CONSECUTIVE_ERRORS) {
      try { await failRun(t, msg); } catch { /* row update failed; cron retries */ }
      return Response.json({ run_id: run.id, failed: true, error: msg });
    }
    try { await persist(t); } catch { /* cursor unsaved; next tick replays */ }
    return Response.json({
      run_id: run.id,
      retrying: true,
      error_count: t.cursor.error_count,
      error: msg,
    });
  }
});
