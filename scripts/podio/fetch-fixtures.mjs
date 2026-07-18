// Phase 0 step 2: pull one space's structure + sample data into local fixture
// files (docs/podio-import/fixtures/<space_id>/) and print a field-type census
// — the ground truth the importer's mapping layer is built and tested against.
// READ-ONLY against Podio. Usage: node scripts/podio/fetch-fixtures.mjs <space_id>
import { mkdirSync, writeFileSync } from "node:fs";
import { podioAuth, makeApi } from "./podio-client.mjs";

const spaceId = process.argv[2];
if (!spaceId) throw new Error("usage: node fetch-fixtures.mjs <space_id>");

const { accessToken } = await podioAuth();
const api = makeApi(accessToken, { delayMs: 1200 });
const dir = `docs/podio-import/fixtures/${spaceId}`;
mkdirSync(dir, { recursive: true });
const save = (name, data) =>
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(data, null, 2));

const space = await api.get(`/space/${spaceId}`);
save("space", space);
console.log(`SPACE: ${space.name} (org ${space.org_id})`);

const apps = await api.get(`/app/space/${spaceId}/`);
console.log(`APPS: ${apps.length}`);

const fieldCensus = new Map(); // type -> Set of settings keys seen
const fullApps = [];
const sampleItems = {};
const sampleComments = {};

for (const a of apps) {
  const app = await api.get(`/app/${a.app_id}`); // full config incl. fields
  fullApps.push(app);
  for (const f of app.fields ?? []) {
    if (!fieldCensus.has(f.type)) fieldCensus.set(f.type, new Set());
    for (const k of Object.keys(f.config?.settings ?? {})) fieldCensus.get(f.type).add(k);
  }
  // First page of items (filter endpoint is the "heavy" one — small page)
  try {
    const items = await api.post(`/item/app/${a.app_id}/filter/`, { limit: 20 });
    sampleItems[a.app_id] = items;
    console.log(`  app ${app.config?.name} [${a.app_id}]: ${app.fields?.length ?? 0} fields, ${items.total} items (sampled ${items.items?.length ?? 0})`);
    // Comments for the first item, if any
    const first = items.items?.[0];
    if (first) {
      try {
        sampleComments[first.item_id] = await api.get(`/comment/item/${first.item_id}/`);
      } catch { /* comments may 403/404 — fine for the census */ }
    }
  } catch (e) {
    console.log(`  app ${app.config?.name} [${a.app_id}]: items fetch failed — ${e.message}`);
  }
}

save("apps", fullApps);
save("items-sample", sampleItems);
save("comments-sample", sampleComments);

// Space-level extras: members + tasks (best effort)
try { save("members", await api.get(`/space/${spaceId}/member/`)); } catch (e) { console.log("members: " + e.message); }
try { save("tasks", await api.get(`/task/?space=${spaceId}&limit=30`)); } catch (e) { console.log("tasks: " + e.message); }

console.log("\nFIELD TYPE CENSUS (type: settings keys seen):");
for (const [type, keys] of fieldCensus) {
  console.log(`  ${type}: ${[...keys].join(", ") || "(no settings)"}`);
}
console.log(`\nFixtures written to ${dir}/`);
