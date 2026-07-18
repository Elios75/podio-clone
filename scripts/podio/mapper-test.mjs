// Fixture-driven acceptance test for the Podio mapping layer.
// Run: node scripts/podio/mapper-test.mjs
// Loads the real-API fixtures, maps every app and every sampled item, and
// prints field tables + note summaries. Exits non-zero on any exception or
// shape violation.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mapApp, mapItemValues, mapComment, mapTask } from "./mapper.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "..", "docs", "podio-import", "fixtures", "3281781");
const load = (name) => JSON.parse(readFileSync(join(fixtures, name), "utf8"));

const apps = load("apps.json");
const itemsByApp = load("items-sample.json");
const commentsByItem = load("comments-sample.json");
const members = load("members.json");
const tasks = load("tasks.json");

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error("  FAIL: " + msg);
};

// memberMap: podio user id -> our uuid (fake uuids for the test; the pipeline
// substitutes real auth.users ids).
const memberMap = new Map();
for (const m of members) {
  const uid = m?.profile?.user_id ?? m?.user?.user_id;
  if (uid != null) memberMap.set(uid, `00000000-0000-4000-8000-${String(uid).padStart(12, "0")}`);
}
const ctx = { memberMap };

const OUR_TYPES = new Set([
  "text", "category", "date", "relationship", "contact", "phone", "email",
  "organization", "number", "money", "progress", "calculation", "location",
  "duration", "image", "file", "link", "separator", "table",
]);
const ICONS = new Set([
  "brick", "task", "rocket", "meeting", "tray", "idea", "link", "contact",
  "event", "doc", "chart", "gear", "phone", "mail", "map", "cart",
]);

const allNotes = new Set();
const summarizeConfig = (f) => {
  const c = f.config ?? {};
  const bits = [];
  if (f.type === "category") bits.push(`${c.options?.length ?? 0} opts${c.multiple ? ", multi" : ""}`);
  if (f.type === "date") bits.push(`end_date=${c.end_date}`);
  if (f.type === "money") bits.push(`currency=${c.currency}`);
  if (f.type === "relationship") bits.push(`podio apps [${(c.podio_referenced_apps ?? []).join(",")}]`);
  if (f.type === "calculation") bits.push("podio_script preserved");
  if (f.is_primary) bits.push("PRIMARY");
  if (f.is_required) bits.push("required");
  return bits.join(" · ");
};

console.log(`Fixture: space 3281781 — ${apps.length} apps, ${members.length} member(s)\n`);

const appSummaries = [];

for (const podioApp of apps) {
  const { app, fields, notes } = mapApp(podioApp);
  notes.forEach((n) => allNotes.add(n));

  // --- shape checks -------------------------------------------------------
  if (!app.name) fail(`app ${podioApp.app_id}: empty name`);
  if (!/^[a-z0-9-]+$/.test(app.slug)) fail(`${app.name}: bad slug "${app.slug}"`);
  if (!ICONS.has(app.icon)) fail(`${app.name}: unknown icon "${app.icon}"`);
  if (!app.item_name) fail(`${app.name}: empty item_name`);
  const extIds = new Set();
  for (const f of fields) {
    if (!OUR_TYPES.has(f.type)) fail(`${app.name}.${f.external_id}: unknown type "${f.type}"`);
    if (extIds.has(f.external_id)) fail(`${app.name}: duplicate external_id "${f.external_id}"`);
    extIds.add(f.external_id);
    if (typeof f.position !== "number") fail(`${app.name}.${f.external_id}: missing position`);
    if (f.type === "category") {
      for (const o of f.config.options ?? []) {
        if (typeof o.id !== "string") fail(`${app.name}.${f.external_id}: option id not a string`);
        if (!/^#[0-9A-F]{6}$/i.test(o.color)) fail(`${app.name}.${f.external_id}: bad color "${o.color}"`);
      }
    }
  }
  if (fields.filter((f) => f.is_primary).length > 1) fail(`${app.name}: multiple primary fields`);

  // --- field table --------------------------------------------------------
  console.log(`=== ${app.name}  (slug=${app.slug}, icon=${app.icon}, item_name="${app.item_name}")`);
  const podioTypeById = new Map(podioApp.fields.map((f) => [f.field_id, f.type]));
  for (const f of fields) {
    const podioType = podioTypeById.get(f.podio_field_id) ?? "?";
    const cfg = summarizeConfig(f);
    console.log(
      `  ${String(f.position).padStart(2)}  ${f.external_id.padEnd(22)} ${podioType.padEnd(10)} -> ${f.type.padEnd(13)}${cfg ? " " + cfg : ""}`
    );
  }

  // --- items --------------------------------------------------------------
  const sample = itemsByApp[String(podioApp.app_id)]?.items ?? [];
  let clean = 0, noted = 0, valueCount = 0, refCount = 0, fileCount = 0;
  for (const item of sample) {
    const r = mapItemValues(item, fields, ctx);

    // shape checks on write_values payloads
    for (const [ext, val] of Object.entries(r.values)) {
      const f = fields.find((x) => x.external_id === ext);
      if (!f) { fail(`item ${item.item_id}: value for unknown external_id "${ext}"`); continue; }
      const t = f.type;
      const ok =
        (t === "text" || t === "phone" || t === "email" || t === "link" || t === "location") ? typeof val === "string" :
        (t === "number" || t === "progress" || t === "duration") ? typeof val === "number" :
        t === "money" ? (typeof val === "object" && typeof val.amount === "number" && typeof val.currency === "string") :
        t === "date" ? (typeof val === "object" && typeof val.start === "string") :
        t === "category" ? (f.config.multiple ? Array.isArray(val) && val.every((x) => typeof x === "string") : typeof val === "string") :
        t === "contact" ? typeof val === "string" :
        t === "relationship" ? false /* must ride refs[], never values */ :
        true;
      if (!ok) fail(`item ${item.item_id}.${ext} (${t}): bad value shape ${JSON.stringify(val).slice(0, 80)}`);
    }
    for (const ref of r.refs) {
      if (!Array.isArray(ref.podio_item_ids) || ref.podio_item_ids.some((x) => typeof x !== "number")) {
        fail(`item ${item.item_id}.${ref.external_id}: bad refs shape`);
      }
    }
    valueCount += Object.keys(r.values).length;
    refCount += r.refs.length;
    fileCount += r.files.length;
    if (r.notes.length === 0) clean++;
    else { noted++; r.notes.forEach((n) => allNotes.add(n)); }
  }
  console.log(`  items: ${sample.length} sampled -> ${clean} clean, ${noted} with notes  (${valueCount} values, ${refCount} ref sets, ${fileCount} files)\n`);
  appSummaries.push({ app: app.name, fields: fields.length, items: sample.length, clean, noted });
}

// --- comments -------------------------------------------------------------
let commentCount = 0;
for (const list of Object.values(commentsByItem)) {
  for (const c of list) {
    const r = mapComment(c, ctx);
    if (typeof r.body !== "string") fail(`comment ${c.comment_id}: bad body`);
    if (r.note) allNotes.add(r.note);
    commentCount++;
  }
}
// Fixture has zero comments; smoke-test the mapper with a real-shaped sample.
const smokeComment = mapComment(
  {
    comment_id: 1, value: "Looks good", rich_value: "<p>Looks good</p>",
    created_on: "2015-03-12 03:32:15",
    created_by: { type: "user", id: 2582214, name: "Fernan Delgado" },
  },
  ctx
);
if (smokeComment.body !== "Looks good" || smokeComment.created_at !== "2015-03-12T03:32:15Z" || smokeComment.podio_user_id !== 2582214) {
  fail(`mapComment smoke test: ${JSON.stringify(smokeComment)}`);
}

// --- tasks ----------------------------------------------------------------
let taskCount = 0;
for (const t of tasks) {
  const r = mapTask(t, ctx);
  if (typeof r.title !== "string") fail(`task ${t.task_id}: bad title`);
  if (r.note) allNotes.add(r.note);
  taskCount++;
}
const smokeTask = mapTask(
  {
    task_id: 1, text: "Follow up", description: "", status: "active",
    due_on: "2026-08-01 12:00:00", due_date: "2026-08-01",
    responsible: { user_id: 2582214 }, completed_on: null,
  },
  ctx
);
if (smokeTask.title !== "Follow up" || smokeTask.due_at !== "2026-08-01T12:00:00Z" || smokeTask.podio_responsible_user_id !== 2582214 || smokeTask.completed_at !== null) {
  fail(`mapTask smoke test: ${JSON.stringify(smokeTask)}`);
}

console.log(`comments mapped: ${commentCount} (fixture) + smoke test`);
console.log(`tasks mapped: ${taskCount} (fixture) + smoke test`);

// --- distinct notes -------------------------------------------------------
console.log(`\nDistinct notes (${allNotes.size}):`);
for (const n of [...allNotes].sort()) console.log("  - " + n);

console.log("\nPer-app summary:");
for (const s of appSummaries) {
  console.log(`  ${s.app.padEnd(18)} fields=${s.fields}  items=${s.items} (${s.clean} clean / ${s.noted} noted)`);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nOK — all fixtures mapped with zero exceptions.");
