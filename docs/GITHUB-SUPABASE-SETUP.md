# Connecting the Podio Clone to GitHub + Supabase

This repo contains the migrations and docs. Here's how to keep DB changes version-controlled going forward.

## 1. Install the Supabase CLI and link the project

```bash
npm install -g supabase
supabase login                      # opens browser, uses your Supabase account
supabase link --project-ref <YOUR_PROJECT_REF>
```

Find the project ref in the Supabase dashboard URL: `https://supabase.com/dashboard/project/<ref>`.

## 2. Migration state

The seven `podio_*` migrations were already applied to the linked project via MCP, so they exist in the remote migration history. The same files live in `supabase/migrations/`. To confirm local and remote agree:

```bash
supabase migration list
```

If the local files show as "not applied" remotely under different versions, mark them as applied rather than re-running them:

```bash
supabase migration repair --status applied <version>
```

## 3. Expose the `podio` schema to the API (one-time, required)

Dashboard → Project Settings → API → **Exposed schemas** → add `podio`. Without this, PostgREST (and supabase-js) can't query the schema even though it exists.

In client code:

```ts
const supabase = createClient(url, anonKey, { db: { schema: 'podio' } })
```

## 4. Day-to-day migration workflow

Never edit the database directly in the dashboard for schema changes. Instead:

```bash
supabase migration new add_some_feature   # creates a timestamped empty SQL file
# write SQL in the new file
supabase db push                          # applies pending migrations to remote
```

Commit the migration file with the code that uses it — that's the whole trick to keeping app and schema in sync.

## 5. CI: auto-apply migrations on merge (optional but recommended)

Create `.github/workflows/migrate.yml`:

```yaml
name: Apply migrations
on:
  push:
    branches: [main]
    paths: ['supabase/migrations/**']
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      - run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
```

Add repo secrets (GitHub → Settings → Secrets → Actions): `SUPABASE_ACCESS_TOKEN` (from supabase.com/dashboard/account/tokens), `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.

## 6. Vercel (when the Next.js app lands)

Import the GitHub repo in Vercel and set env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus `SUPABASE_SERVICE_ROLE_KEY` (server-only, never `NEXT_PUBLIC_`). Every PR then gets a preview deploy automatically.

## 7. Moving to a dedicated Supabase project later

Because everything is namespaced in the `podio` schema and captured as migration files, migrating to a fresh project is just: create project → `supabase link` to it → `supabase db push`. No dependency on any other project's data exists.
