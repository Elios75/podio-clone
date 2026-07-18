// Podio workspace importer — pulls one Podio space (apps, items, refs, files,
// comments, tasks) into the clone through the idempotent podio.import_api RPC.
//
//   node scripts/podio/import-space.mjs <space_id>
//
// Env (.env.local): PODIO_CLIENT_ID / PODIO_CLIENT_SECRET / PODIO_REFRESH_TOKEN
// (existing), NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY, and
// CLONE_API_KEY (a write-scoped api key; we send its sha256 hash, exactly like
// src/lib/api-auth.ts does). Everything is idempotent server-side via
// podio.import_map, so on a crash just re-run: it fast-forwards through hits.
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, podioAuth, makeApi } from "./podio-client.mjs";
import { mapApp, mapItemValues, mapComment, mapTask } from "./mapper.mjs";

const spaceId = process.argv[2];
if (!spaceId) {
  console.error("usage: node scripts/podio/import-space.mjs <space_id>");
  process.exit(1);
}

const env = loadEnv();
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "CLONE_API_KEY"]) {
  if (!env[k]) throw new Error(`missing ${k} in .env.local`);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  db: { schema: "podio" },
  auth: { persistSession: false },
});
const keyHash = createHash("sha256").update(env.CLONE_API_KEY).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Our-side RPC with retry on the per-key minute rate limit.
async function call(action, params = {}) {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await sb.rpc("import_api", {
      p_key_hash: keyHash,
      p_action: action,
      p_params: params,
    });
    if (!error) return data;
    if (/rate limit exceeded/i.test(error.message ?? "") && attempt < 20) {
      process.stdout.write("  (clone rate limit — waiting 20s)\n");
      await sleep(20_000);
      continue;
    }
    throw new Error(`${action}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// State shared across phases
// ---------------------------------------------------------------------------
const counts = {
  apps: 0, fields: 0, items: 0, refs_linked: 0, refs_skipped: 0,
  files: 0, comments: 0, tasks: 0,
};
const allNotes = []; // every mapper + runner note, printed in the final report
let runId = null;

async function progress(phase, notesAppend = []) {
  for (const n of notesAppend) allNotes.push(n);
  try {
    await call("run.progress", {
      run_id: runId, phase, counts, notes_append: notesAppend,
    });
  } catch (e) {
    console.warn(`  progress update failed: ${e.message}`);
  }
}

const { accessToken } = await podioAuth();
const podio = makeApi(accessToken); // keep the client's throttle (heavy endpoints)

let failed = false;
try {
  // -------------------------------------------------------------------------
  // Phase 1: space + run.start
  // -------------------------------------------------------------------------
  const space = await podio.get(`/space/${spaceId}`);
  const started = await call("run.start", { space_id: Number(spaceId), space_name: space.name });
  runId = started.run_id;
  const keyUserId = started.user_id;
  console.log(`run ${runId} → workspace ${started.workspace_id} ("${space.name} (Podio import)")`);

  // memberMap: podio user_id -> local uuid|null (matched by email)
  const memberMap = new Map();
  try {
    const members = await podio.get(`/space/${spaceId}/member/`);
    const emails = [...new Set(members.map((m) => m.user?.mail).filter(Boolean))];
    const matched = emails.length ? await call("members.match", { run_id: runId, emails }) : {};
    for (const m of members) {
      const uid = m.profile?.user_id ?? m.user?.user_id;
      if (uid != null) memberMap.set(uid, matched[m.user?.mail] ?? null);
    }
    const hits = [...memberMap.values()].filter(Boolean).length;
    console.log(`members: ${memberMap.size} podio users, ${hits} matched by email`);
  } catch (e) {
    allNotes.push(`members phase failed (continuing without user matching): ${e.message}`);
  }
  const ctx = { memberMap };

  // -------------------------------------------------------------------------
  // Phase 2: apps
  // -------------------------------------------------------------------------
  await progress("apps");
  const appList = await podio.get(`/app/space/${spaceId}/`);
  const appMeta = new Map(); // podio_app_id -> { mappedFields, name }
  for (const a of appList) {
    const full = await podio.get(`/app/${a.app_id}`);
    const mapped = mapApp(full);
    const res = await call("app.upsert", {
      run_id: runId, podio_app_id: a.app_id, app: mapped.app, fields: mapped.fields,
    });
    appMeta.set(a.app_id, { mappedFields: mapped.fields, name: mapped.app.name });
    counts.apps += 1;
    counts.fields += mapped.fields.length;
    console.log(`app "${mapped.app.name}" → ${res.app_id} (${mapped.fields.length} fields)`);
    await progress("apps", mapped.notes ?? []);
  }

  // -------------------------------------------------------------------------
  // Phase 3: relationship field targets
  // -------------------------------------------------------------------------
  await progress("link_references");
  for (const a of appList) {
    try {
      const res = await call("app.link_references", { run_id: runId, podio_app_id: a.app_id });
      if (res.updated) console.log(`app ${a.app_id}: linked ${res.updated} relationship field(s)`);
    } catch (e) {
      allNotes.push(`link_references failed for app ${a.app_id}: ${e.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Phase 4: items (heavy filter endpoint, 100/page)
  // -------------------------------------------------------------------------
  await progress("items");
  const pendingRefs = [];      // {podio_item_id, refs}
  const pendingFiles = [];     // {podio_item_id, file}
  const commentCandidates = []; // podio item ids with comment_count > 0
  let sawCommentCount = false;

  for (const a of appList) {
    const meta = appMeta.get(a.app_id);
    let offset = 0, total = null;
    while (total === null || offset < total) {
      const page = await podio.post(`/item/app/${a.app_id}/filter/`, { limit: 100, offset });
      total = page.filtered ?? page.total ?? (page.items?.length ?? 0);
      const items = page.items ?? [];
      if (!items.length) break;

      for (const item of items) {
        const mv = mapItemValues(item, meta.mappedFields, ctx);
        await call("item.upsert", {
          run_id: runId,
          podio_app_id: a.app_id,
          podio_item_id: item.item_id,
          title: mv.title,
          values: mv.values,
          created_on: item.created_on ?? null,
        });
        counts.items += 1;
        if (mv.refs?.length) pendingRefs.push({ podio_item_id: item.item_id, refs: mv.refs });
        for (const f of mv.files ?? []) pendingFiles.push({ podio_item_id: item.item_id, file: f });
        if (item.comment_count !== undefined) {
          sawCommentCount = true;
          if (item.comment_count > 0) commentCandidates.push(item.item_id);
        } else {
          commentCandidates.push(item.item_id); // shape unknown; capped later
        }
        for (const n of mv.notes ?? []) allNotes.push(`item ${item.item_id}: ${n}`);
      }
      offset += items.length;
      console.log(`app "${meta.name}": ${Math.min(offset, total)}/${total} items`);
      await progress("items");
    }
  }

  // -------------------------------------------------------------------------
  // Phase 5: second pass — relationship values between imported items
  // -------------------------------------------------------------------------
  await progress("link_refs");
  for (const { podio_item_id, refs } of pendingRefs) {
    try {
      const res = await call("item.link_refs", { run_id: runId, podio_item_id, refs });
      counts.refs_linked += res.linked ?? 0;
      counts.refs_skipped += res.skipped ?? 0;
    } catch (e) {
      allNotes.push(`link_refs failed for item ${podio_item_id}: ${e.message}`);
    }
  }
  console.log(`refs: ${counts.refs_linked} linked, ${counts.refs_skipped} skipped (unresolvable)`);
  await progress("link_refs");

  // -------------------------------------------------------------------------
  // Phase 6: files (external links only — no storage upload)
  // -------------------------------------------------------------------------
  await progress("files");
  for (const { podio_item_id, file } of pendingFiles) {
    try {
      await call("item.add_file", {
        run_id: runId,
        podio_item_id,
        podio_file_id: file.podio_file_id,
        name: file.name,
        link: file.link,
        mimetype: file.mimetype,
      });
      counts.files += 1;
    } catch (e) {
      allNotes.push(`add_file failed for item ${podio_item_id} file ${file.podio_file_id}: ${e.message}`);
    }
  }
  await progress("files");

  // -------------------------------------------------------------------------
  // Phase 7: comments (only for items that showed comment_count > 0)
  // -------------------------------------------------------------------------
  await progress("comments");
  let commentTargets = commentCandidates;
  if (!sawCommentCount && commentTargets.length > 50) {
    commentTargets = commentTargets.slice(0, 50);
    allNotes.push(`comment_count absent from item payloads — fetched comments for first 50 items only (${commentCandidates.length} total)`);
  }
  for (const podioItemId of commentTargets) {
    try {
      const comments = await podio.get(`/comment/item/${podioItemId}/`);
      for (const c of comments ?? []) {
        const mc = mapComment(c, ctx);
        const authorLocal = mc.podio_user_id != null ? memberMap.get(mc.podio_user_id) ?? null : null;
        const authorName = c.created_by?.name ?? c.user?.name ?? `podio user ${mc.podio_user_id ?? "?"}`;
        const author_note =
          authorLocal && authorLocal === keyUserId ? null : `[imported: ${authorName}] `;
        await call("comment.upsert", {
          run_id: runId,
          podio_item_id: podioItemId,
          podio_comment_id: c.comment_id,
          body: mc.body,
          created_at: mc.created_at,
          author_note,
        });
        counts.comments += 1;
        if (mc.note) allNotes.push(`comment ${c.comment_id}: ${mc.note}`);
      }
    } catch (e) {
      allNotes.push(`comments fetch failed for item ${podioItemId}: ${e.message}`);
    }
  }
  await progress("comments");

  // -------------------------------------------------------------------------
  // Phase 8: tasks (same param shape that worked in fetch-fixtures.mjs)
  // -------------------------------------------------------------------------
  await progress("tasks");
  try {
    let offset = 0;
    for (;;) {
      const page = await podio.get(`/task/?space=${spaceId}&limit=30&offset=${offset}`);
      const tasks = Array.isArray(page) ? page : page.tasks ?? [];
      for (const t of tasks) {
        const mt = mapTask(t, ctx);
        await call("task.upsert", {
          run_id: runId,
          podio_task_id: t.task_id,
          title: mt.title,
          description: mt.description,
          due_at: mt.due_at,
          completed_at: mt.completed_at,
        });
        counts.tasks += 1;
        if (mt.note) allNotes.push(`task ${t.task_id}: ${mt.note}`);
      }
      if (tasks.length < 30) break;
      offset += tasks.length;
    }
  } catch (e) {
    allNotes.push(`tasks phase failed: ${e.message}`);
  }
  await progress("tasks");

  // -------------------------------------------------------------------------
  // Phase 9: finish + report
  // -------------------------------------------------------------------------
  await call("run.finish", { run_id: runId, status: "completed" });
  console.log("\n=== IMPORT COMPLETE ===");
} catch (e) {
  failed = true;
  console.error(`\nFATAL: ${e.message}`);
  if (runId) {
    try {
      await call("run.finish", { run_id: runId, status: "failed", error: e.message });
    } catch (e2) {
      console.error(`could not mark run failed: ${e2.message}`);
    }
  }
}

console.log("\nCounts:");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
if (allNotes.length) {
  console.log(`\nNotes (${allNotes.length}):`);
  for (const n of allNotes) console.log(`  - ${n}`);
} else {
  console.log("\nNotes: none");
}
if (failed) {
  console.log("\nRun failed — safe to re-run; the importer is idempotent and will fast-forward.");
  process.exit(1);
}
