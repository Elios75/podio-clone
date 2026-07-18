// Phase 0 step 1: enumerate orgs + spaces visible to the Podio user.
import { podioAuth, makeApi } from "./podio-client.mjs";

const { accessToken } = await podioAuth();
const api = makeApi(accessToken, { delayMs: 400 });
const orgs = await api.get("/org/");
for (const org of orgs) {
  console.log(`ORG: ${org.name} [org_id ${org.org_id}]`);
  for (const s of org.spaces ?? []) {
    console.log(`  SPACE: ${s.name} [space_id ${s.space_id}]`);
  }
}
