-- Podio Clone: Migration 84 - Rate-limit status for response headers.
-- Read-only companion to the api_key_usage windows (migration 36): returns
-- the caller's current limit + remaining quota so API routes can attach
-- X-Rate-Limit-Limit / X-Rate-Limit-Remaining headers on every response.
create or replace function podio.api_rate_status(p_key_hash text)
returns jsonb
language plpgsql stable security definer set search_path = podio, public as $$
declare
  v_key podio.api_keys;
  v_used int;
begin
  select * into v_key from podio.api_keys where key_hash = p_key_hash;
  if v_key.id is null then
    return jsonb_build_object('limit', 0, 'remaining', 0);
  end if;
  select coalesce(count, 0) into v_used
  from podio.api_key_usage
  where key_id = v_key.id and window_start = date_trunc('minute', now());
  return jsonb_build_object(
    'limit', v_key.rate_limit_per_minute,
    'remaining', greatest(0, v_key.rate_limit_per_minute - coalesce(v_used, 0))
  );
end $$;
grant execute on function podio.api_rate_status(text) to anon, authenticated;
