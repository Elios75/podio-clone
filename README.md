# Podio Clone

A low-code work-management platform modeled on Podio: customizable business-object apps, dynamic fields, saved views (table/kanban/calendar), collaboration (comments, mentions, activity streams, tasks), webforms, workflow automation, and a developer platform (API keys, webhooks, templates).

**Stack:** Next.js (App Router) + Tailwind + shadcn/ui + Supabase (Postgres, Auth, Storage, Realtime, Edge Functions).

**Database:** all objects live in an isolated `podio` Postgres schema (49 tables, full RLS). Hybrid EAV model: user-defined fields are rows in `app_fields`; values are rows in `item_field_values` with a jsonb source of truth plus typed, indexed shadow columns. This project is fully independent of any other schema in the Supabase instance.

## Repo layout

- `supabase/migrations/` — schema migrations (already applied to the linked Supabase project)
- `docs/DEVELOPMENT-PHASES.md` — phased build plan (Phase 0 through Enterprise)
- `docs/GITHUB-SUPABASE-SETUP.md` — CLI linking, migration workflow, CI, Vercel

## Quick start

1. Read `docs/GITHUB-SUPABASE-SETUP.md` to link the Supabase project and expose the `podio` schema.
2. Follow Phase 0 in `docs/DEVELOPMENT-PHASES.md` to scaffold the Next.js app.
