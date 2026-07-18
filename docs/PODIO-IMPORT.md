# Importing a Podio space into the clone

Operator guide for `scripts/podio/`. Imports run **locally from your machine**
(no server-side jobs): the importer reads a Podio space via the Podio API and
writes it into the clone via the clone's own API. Live progress for every run
shows on **/org/:orgSlug/import**.

## Prerequisites

### 1. A Podio API key

Create one at **podio.com/settings/api** (any name/domain works). This gives
you a client id and client secret.

### 2. A Podio refresh token

The importer authenticates with the OAuth2 password flow **once** to obtain a
refresh token; after that it only ever uses the refresh token. Run this
yourself (it involves your Podio password — never share it or paste it into
chat/scripts you didn't read):

```
curl -s -X POST https://api.podio.com/oauth/token \
  -d grant_type=password \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET \
  -d username=YOUR_PODIO_EMAIL \
  -d password=YOUR_PODIO_PASSWORD
```

Copy the `refresh_token` from the JSON response.

### 3. `.env.local` entries

Add to `.env.local` at the repo root (the scripts read it directly; it is
gitignored):

```
PODIO_CLIENT_ID=...
PODIO_CLIENT_SECRET=...
PODIO_REFRESH_TOKEN=...
CLONE_API_KEY=...
```

`CLONE_API_KEY` is an API key for the **target organization** in the clone
with **write scope** — create one under Org → Administration → API keys. The
key determines which org the import lands in.

## Finding the space to import

List every org and space your Podio user can see:

```
node scripts/podio/list-spaces.mjs
```

Output is `SPACE: <name> [space_id <id>]` lines — you need the numeric
`space_id`.

## Pilot fixtures (optional but recommended)

Before a full import, snapshot a space's structure and sample data to local
fixture files — read-only against Podio:

```
node scripts/podio/fetch-fixtures.mjs <space_id>
```

Writes `docs/podio-import/fixtures/<space_id>/*.json` (space, apps, sample
items/comments) and prints a field-type census, so you can see exactly which
field types the space uses before importing.

## Running an import

```
node scripts/podio/import-space.mjs <space_id>
```

The script registers a run in `podio.import_runs` and updates it as it works
through its phases; watch progress live at **/org/:orgSlug/import** (space
name, status chip, current phase, running counts, and per-run notes).

## Resumability

The importer is **idempotent** — every imported object carries its Podio
source id, so re-running the same space skips what already landed and picks
up where it left off. If a run fails mid-way (rate limit, network, crash),
just run the same command again.

## Safety: imports never touch existing workspaces

An import always targets a **newly created workspace** in the clone. It never
writes into, merges with, or modifies an existing workspace — worst case, a
bad import is a workspace you archive and delete.

## Fidelity notes (what maps, what doesn't)

- **Calculations** — imported **inactive**, with the original Podio
  calculation script attached to the field for manual porting. They do not
  execute until you review and enable them.
- **Files** — imported as **external links back to Podio** (no binary
  download). Links keep working as long as the Podio space exists.
- **Contacts** — matched to clone users **by email**. Unmatched contacts are
  **dropped**, with a note recorded on the run listing each drop.
- **Multi-app reference fields** — only the **first** referenced app is wired
  up; additional referenced apps are noted on the run.
- **Revisions and ratings** — not imported.
- **Comments** — imported with original author (when matched by email) and
  timestamps.

Anything skipped or approximated is recorded in the run's notes — expand
"Notes" on the import page to review them after each run.
