-- Podio Clone: Migration 87 - In-app Podio importer queue
-- Per-org Podio API credentials (podio.podio_connections), queued import runs
-- (import_runs gains 'queued' status + cursor + queued_by), definer RPCs for
-- connect/status/disconnect/queue, and a pg_cron tick that pings the
-- podio-import-worker edge function (which drives podio.import_api).
--
-- Cron setup (orchestrator inserts these, then calls the register helper):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/podio-import-worker', 'podio_import_worker_url');
--   select vault.create_secret('<random-long-token>', 'podio_import_worker_token');
--   select podio.register_podio_import_cron();

-- ============================================================
-- 1) podio_connections: per-org Podio API credentials
-- ============================================================
create table if not exists podio.podio_connections (
  organization_id uuid primary key references podio.organizations(id) on delete cascade,
  client_id text not null,
  client_secret text not null,
  refresh_token text not null,
  connected_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table podio.podio_connections enable row level security;
-- Secrets: no direct access for app roles. Definer RPCs below expose only
-- non-secret fields; the worker reads via service_role.
revoke all on podio.podio_connections from anon, authenticated;
grant all on podio.podio_connections to service_role;

-- ============================================================
-- 2) import_runs: queued status, resume cursor, queued_by
-- ============================================================
alter table podio.import_runs
  add column if not exists cursor jsonb not null default '{}'::jsonb,
  add column if not exists queued_by uuid references auth.users(id);

-- Widen the status check (migration 85 used an unnamed inline check on the
-- column, so Postgres auto-named it import_runs_status_check).
alter table podio.import_runs drop constraint if exists import_runs_status_check;
alter table podio.import_runs
  add constraint import_runs_status_check
  check (status in ('queued','running','completed','failed'));

-- ============================================================
-- 3) Connection + queue RPCs
-- ============================================================
create or replace function podio.podio_connect(
  p_org uuid, p_client_id text, p_client_secret text, p_refresh_token text
)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
begin
  if p_org is null or not podio.is_org_admin(p_org) then
    raise exception 'only organization admins can connect Podio';
  end if;
  if nullif(trim(p_client_id), '') is null
     or nullif(trim(p_client_secret), '') is null
     or nullif(trim(p_refresh_token), '') is null then
    raise exception 'client_id, client_secret and refresh_token are required';
  end if;

  insert into podio.podio_connections
    (organization_id, client_id, client_secret, refresh_token, connected_by, updated_at)
  values
    (p_org, trim(p_client_id), trim(p_client_secret), trim(p_refresh_token), auth.uid(), now())
  on conflict (organization_id) do update
    set client_id = excluded.client_id,
        client_secret = excluded.client_secret,
        refresh_token = excluded.refresh_token,
        connected_by = excluded.connected_by,
        updated_at = now();

  return jsonb_build_object('connected', true);
end $$;
grant execute on function podio.podio_connect(uuid, text, text, text) to authenticated;

create or replace function podio.podio_connection_status(p_org uuid)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_conn podio.podio_connections;
begin
  if p_org is null or not podio.is_org_member(p_org) then
    raise exception 'not a member of this organization';
  end if;

  select * into v_conn from podio.podio_connections where organization_id = p_org;
  if v_conn.organization_id is null then
    return jsonb_build_object('connected', false, 'client_id', null, 'updated_at', null);
  end if;
  -- Never expose client_secret / refresh_token.
  return jsonb_build_object(
    'connected', true,
    'client_id', v_conn.client_id,
    'updated_at', v_conn.updated_at);
end $$;
grant execute on function podio.podio_connection_status(uuid) to authenticated;

create or replace function podio.podio_disconnect(p_org uuid)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
begin
  if p_org is null or not podio.is_org_admin(p_org) then
    raise exception 'only organization admins can disconnect Podio';
  end if;
  delete from podio.podio_connections where organization_id = p_org;
  return jsonb_build_object('connected', false);
end $$;
grant execute on function podio.podio_disconnect(uuid) to authenticated;

create or replace function podio.podio_queue_import(p_org uuid, p_space_id bigint)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_run_id uuid;
begin
  if p_org is null or not podio.is_org_member(p_org) then
    raise exception 'not a member of this organization';
  end if;
  if p_space_id is null then
    raise exception 'space_id is required';
  end if;
  if not exists (select 1 from podio.podio_connections where organization_id = p_org) then
    raise exception 'connect Podio first';
  end if;
  if exists (
    select 1 from podio.import_runs
    where organization_id = p_org and status in ('queued','running')
  ) then
    raise exception 'an import is already in progress';
  end if;

  insert into podio.import_runs
    (organization_id, source_space_id, status, phase, queued_by)
  values
    (p_org, p_space_id, 'queued', 'queued', auth.uid())
  returning id into v_run_id;

  return jsonb_build_object('run_id', v_run_id);
end $$;
grant execute on function podio.podio_queue_import(uuid, bigint) to authenticated;

-- ============================================================
-- 4) Cron wiring: every-minute tick -> podio-import-worker edge function
--    Mirrors migration 40's vault-secret pattern; no-ops until the
--    orchestrator has inserted the vault secrets.
-- ============================================================
create or replace function podio.register_podio_import_cron()
returns boolean
language plpgsql security definer set search_path = podio, public as $$
declare
  v_url text;
  v_token text;
begin
  begin
    select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'podio_import_worker_url' limit 1;
    select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'podio_import_worker_token' limit 1;
  exception when others then
    v_url := null;
    v_token := null;
  end;

  if v_url is null or v_token is null then
    raise notice 'podio import worker secrets not configured; skipping cron registration';
    return false;
  end if;

  begin
    perform cron.unschedule('podio-import-worker-tick');
  exception when others then null; -- job did not exist yet
  end;

  perform cron.schedule(
    'podio-import-worker-tick',
    '* * * * *',
    format(
      $sql$select net.http_post(url := %L, body := '{}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','Authorization', %L))$sql$,
      v_url, 'Bearer ' || v_token));
  return true;
end $$;
-- Orchestrator-only: called via SQL as postgres after inserting the secrets.
revoke execute on function podio.register_podio_import_cron() from public, anon, authenticated;

do $$
begin
  perform podio.register_podio_import_cron();
exception when others then
  raise notice 'podio import cron registration skipped: %', sqlerrm;
end $$;
