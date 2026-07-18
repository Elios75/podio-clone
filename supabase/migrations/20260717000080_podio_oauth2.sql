-- Podio Clone: Migration 80 - OAuth2 server (clients, codes, tokens) layered on the api_keys dispatcher
--
-- Integration strategy: podio.api_request (migration 17) is NOT touched. Every access
-- token issued here is mirrored into podio.api_keys (key_hash = sha256 of the raw
-- token), so all existing /api/v1 endpoints accept OAuth bearer tokens unchanged.
-- api_request only filters `revoked_at is null`, so expiry is enforced by revoking
-- (deleting) the mirrored api_keys row whenever a token is refreshed or revoked.
-- Access tokens are therefore long-lived until refreshed/revoked (documented v1
-- tradeoff); oauth_tokens.expires_at + api_keys.expires_at record the nominal expiry.

-- digest() lives in pgcrypto. On Supabase it is preinstalled in the `extensions`
-- schema; this is a no-op if the extension already exists anywhere.
create extension if not exists pgcrypto with schema extensions;

-- api_keys gains a nominal expiry column (informational; api_request does not read it).
alter table podio.api_keys add column if not exists expires_at timestamptz null;

-- ============ Tables ============

create table podio.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  name text not null,
  client_id text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  client_secret_hash text not null,
  redirect_uris text[] not null default '{}',
  app_id uuid null references podio.apps(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_oauth_clients_org on podio.oauth_clients (organization_id);

create table podio.oauth_codes (
  code_hash text primary key,
  client_id uuid not null references podio.oauth_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scopes text[] not null default '{}',
  redirect_uri text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

create table podio.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references podio.oauth_clients(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete cascade,
  app_id uuid null references podio.apps(id) on delete cascade,
  access_token_hash text not null unique,
  refresh_token_hash text not null unique,
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);
create index idx_oauth_tokens_client on podio.oauth_tokens (client_id);

-- ============ RLS ============

alter table podio.oauth_clients enable row level security;
alter table podio.oauth_codes enable row level security;
alter table podio.oauth_tokens enable row level security;

-- Org members manage their org's clients (reuses migration 6 helpers).
create policy p_oauth_clients_select on podio.oauth_clients for select to authenticated
  using (podio.is_org_member(organization_id));
create policy p_oauth_clients_insert on podio.oauth_clients for insert to authenticated
  with check (podio.is_org_member(organization_id));
create policy p_oauth_clients_update on podio.oauth_clients for update to authenticated
  using (podio.is_org_admin(organization_id));
create policy p_oauth_clients_delete on podio.oauth_clients for delete to authenticated
  using (podio.is_org_admin(organization_id));
grant select, insert, update, delete on podio.oauth_clients to authenticated;

-- Codes/tokens: no direct client access — SECURITY DEFINER RPCs only.
revoke all on podio.oauth_codes from public, anon, authenticated;
revoke all on podio.oauth_tokens from public, anon, authenticated;

-- ============ Helpers ============

create or replace function podio.oauth_hash(p_raw text) returns text
language sql immutable
set search_path = podio, public, extensions as $$
  select encode(digest(p_raw, 'sha256'), 'hex');
$$;
revoke execute on function podio.oauth_hash(text) from public, anon, authenticated;

-- Internal issuer: creates the oauth_tokens row + mirrored api_keys row, returns
-- the OAuth token response. Never granted; called only by definer RPCs below.
create or replace function podio.oauth_issue_token(
  p_client podio.oauth_clients, p_user uuid, p_app uuid, p_scopes text[]
) returns jsonb
language plpgsql security definer set search_path = podio, public, extensions as $$
declare
  v_access text := 'oat_' || encode(gen_random_bytes(32), 'hex');
  v_refresh text := 'ort_' || encode(gen_random_bytes(32), 'hex');
  v_ttl int := 28800; -- 8 hours (nominal; see header note on enforcement)
  v_scopes text[] := coalesce(nullif(p_scopes, '{}'::text[]), array['read']);
  v_expires timestamptz := now() + make_interval(secs => v_ttl);
begin
  insert into podio.oauth_tokens
    (client_id, user_id, app_id, access_token_hash, refresh_token_hash, scopes, expires_at)
  values
    (p_client.id, p_user, p_app, podio.oauth_hash(v_access), podio.oauth_hash(v_refresh),
     v_scopes, v_expires);

  -- Mirror into api_keys so every /api/v1 endpoint accepts this token unchanged.
  insert into podio.api_keys
    (organization_id, name, key_hash, prefix, scopes, created_by, expires_at)
  values
    (p_client.organization_id, 'oauth:' || p_client.name, podio.oauth_hash(v_access),
     'oat', v_scopes, p_user, v_expires);

  return jsonb_build_object(
    'access_token', v_access,
    'refresh_token', v_refresh,
    'token_type', 'bearer',
    'expires_in', v_ttl,
    'scope', array_to_string(v_scopes, ' '),
    'ref', coalesce(p_user::text, p_app::text)
  );
end $$;
revoke execute on function podio.oauth_issue_token(podio.oauth_clients, uuid, uuid, text[]) from public, anon, authenticated;

-- ============ RPCs ============

-- Consent page helper: lets any signed-in user see a client's display name and
-- whether the redirect_uri is registered (oauth_clients RLS is org-scoped, but
-- the authorizing user is usually NOT a member of the client's org).
create or replace function podio.oauth_client_info(p_client_id text, p_redirect_uri text)
returns jsonb
language plpgsql stable security definer set search_path = podio, public as $$
declare
  v_client podio.oauth_clients;
begin
  if auth.uid() is null then raise exception 'invalid_request'; end if;
  select * into v_client from podio.oauth_clients where client_id = p_client_id;
  if v_client.id is null then raise exception 'invalid_client'; end if;
  return jsonb_build_object(
    'name', v_client.name,
    'redirect_ok', p_redirect_uri = any(v_client.redirect_uris)
  );
end $$;
revoke execute on function podio.oauth_client_info(text, text) from public, anon;
grant execute on function podio.oauth_client_info(text, text) to authenticated;

-- Consent grant: caller = signed-in user; returns the RAW one-time code (sha256 stored).
create or replace function podio.oauth_authorize(
  p_client_id text, p_redirect_uri text, p_scopes text[]
) returns jsonb
language plpgsql security definer set search_path = podio, public, extensions as $$
declare
  v_client podio.oauth_clients;
  v_code text := encode(gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then raise exception 'invalid_request'; end if;
  select * into v_client from podio.oauth_clients where client_id = p_client_id;
  if v_client.id is null then raise exception 'invalid_client'; end if;
  if not (p_redirect_uri = any(v_client.redirect_uris)) then
    raise exception 'invalid_redirect_uri';
  end if;

  insert into podio.oauth_codes (code_hash, client_id, user_id, scopes, redirect_uri)
  values (podio.oauth_hash(v_code), v_client.id, auth.uid(),
          coalesce(p_scopes, '{}'::text[]), p_redirect_uri);

  return jsonb_build_object('code', v_code);
end $$;
revoke execute on function podio.oauth_authorize(text, text, text[]) from public, anon;
grant execute on function podio.oauth_authorize(text, text, text[]) to authenticated;

-- Token endpoint backend. Grants: authorization_code, refresh_token, app.
-- (The password grant is handled in the Next route via signInWithPassword +
-- oauth_issue_for_user — passwords cannot be verified against gotrue in SQL.)
create or replace function podio.oauth_token_exchange(
  p_grant_type text, p_client_id text, p_client_secret text,
  p_code text default null, p_refresh_token text default null,
  p_username text default null, p_password text default null,
  p_app_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = podio, public, extensions as $$
declare
  v_client podio.oauth_clients;
  v_code podio.oauth_codes;
  v_token podio.oauth_tokens;
begin
  select * into v_client from podio.oauth_clients
  where client_id = p_client_id
    and client_secret_hash = podio.oauth_hash(coalesce(p_client_secret, ''));
  if v_client.id is null then raise exception 'invalid_client'; end if;

  if p_grant_type = 'authorization_code' then
    delete from podio.oauth_codes
    where code_hash = podio.oauth_hash(coalesce(p_code, ''))
      and client_id = v_client.id
    returning * into v_code;                       -- single-use: consumed even if expired
    if v_code.code_hash is null or v_code.expires_at < now() then
      raise exception 'invalid_grant';
    end if;
    return podio.oauth_issue_token(v_client, v_code.user_id, null, v_code.scopes);

  elsif p_grant_type = 'refresh_token' then
    select * into v_token from podio.oauth_tokens
    where refresh_token_hash = podio.oauth_hash(coalesce(p_refresh_token, ''))
      and client_id = v_client.id and revoked_at is null;
    if v_token.id is null then raise exception 'invalid_grant'; end if;

    update podio.oauth_tokens set revoked_at = now() where id = v_token.id;
    delete from podio.api_keys where key_hash = v_token.access_token_hash; -- kill old access token everywhere
    return podio.oauth_issue_token(v_client, v_token.user_id, v_token.app_id, v_token.scopes);

  elsif p_grant_type = 'app' then
    if p_app_id is null or v_client.app_id is distinct from p_app_id then
      raise exception 'invalid_grant';             -- app must be the one tied to the client
    end if;
    return podio.oauth_issue_token(v_client, null, p_app_id, array['read','write']);

  elsif p_grant_type = 'password' then
    raise exception 'unsupported_grant_type';      -- handled in the route layer

  else
    raise exception 'unsupported_grant_type';
  end if;
end $$;
revoke execute on function podio.oauth_token_exchange(text, text, text, text, text, text, text, uuid) from public, authenticated;
grant execute on function podio.oauth_token_exchange(text, text, text, text, text, text, text, uuid) to anon; -- called by the token route via the anon client

-- Password-grant issuer: the route verifies credentials via gotrue
-- (signInWithPassword) and passes the verified user id; client_secret is
-- re-validated here. Trusts callers holding a valid client secret (v1 tradeoff).
create or replace function podio.oauth_issue_for_user(
  p_client_id text, p_client_secret text, p_user uuid, p_scopes text[]
) returns jsonb
language plpgsql security definer set search_path = podio, public, extensions as $$
declare
  v_client podio.oauth_clients;
begin
  select * into v_client from podio.oauth_clients
  where client_id = p_client_id
    and client_secret_hash = podio.oauth_hash(coalesce(p_client_secret, ''));
  if v_client.id is null then raise exception 'invalid_client'; end if;
  if p_user is null then raise exception 'invalid_grant'; end if;
  return podio.oauth_issue_token(v_client, p_user, null, coalesce(p_scopes, '{}'::text[]));
end $$;
revoke execute on function podio.oauth_issue_for_user(text, text, uuid, text[]) from public, authenticated;
grant execute on function podio.oauth_issue_for_user(text, text, uuid, text[]) to anon;

-- Revocation (RFC 7009 flavored): accepts an access OR refresh token; revokes the
-- token pair and deletes the mirrored api_keys row.
create or replace function podio.oauth_revoke(p_token text)
returns jsonb
language plpgsql security definer set search_path = podio, public, extensions as $$
declare
  v_hash text := podio.oauth_hash(coalesce(p_token, ''));
  v_token podio.oauth_tokens;
begin
  select * into v_token from podio.oauth_tokens
  where (access_token_hash = v_hash or refresh_token_hash = v_hash)
    and revoked_at is null;
  if v_token.id is null then
    return jsonb_build_object('revoked', false);   -- per RFC 7009 the caller still gets 200
  end if;
  update podio.oauth_tokens set revoked_at = now() where id = v_token.id;
  delete from podio.api_keys where key_hash = v_token.access_token_hash;
  return jsonb_build_object('revoked', true);
end $$;
revoke execute on function podio.oauth_revoke(text) from public, authenticated;
grant execute on function podio.oauth_revoke(text) to anon;

-- Convenience: create a client and return the raw secret exactly once.
create or replace function podio.oauth_create_client(
  p_org uuid, p_name text, p_redirect_uris text[], p_app_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = podio, public, extensions as $$
declare
  v_secret text := 'ocs_' || encode(gen_random_bytes(24), 'hex');
  v_row podio.oauth_clients;
begin
  if not podio.is_org_admin(p_org) then raise exception 'forbidden'; end if;
  insert into podio.oauth_clients
    (organization_id, name, client_secret_hash, redirect_uris, app_id, created_by)
  values
    (p_org, p_name, podio.oauth_hash(v_secret), coalesce(p_redirect_uris, '{}'::text[]),
     p_app_id, auth.uid())
  returning * into v_row;
  return jsonb_build_object(
    'id', v_row.id, 'client_id', v_row.client_id, 'client_secret', v_secret,
    'name', v_row.name, 'redirect_uris', v_row.redirect_uris
  );
end $$;
revoke execute on function podio.oauth_create_client(uuid, text, text[], uuid) from public, anon;
grant execute on function podio.oauth_create_client(uuid, text, text[], uuid) to authenticated;
