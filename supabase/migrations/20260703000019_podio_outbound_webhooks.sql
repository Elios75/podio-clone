-- Podio Clone: Migration 19 - Outbound webhooks: event capture via activity_events trigger,
-- pg_net delivery with HMAC signatures, exponential-backoff retries via cron

alter table podio.webhook_deliveries
  add column if not exists request_id bigint;

-- Every activity event fans out to matching active+verified webhooks
create or replace function podio.tg_emit_webhooks() returns trigger
language plpgsql security definer set search_path = podio, public as $$
begin
  insert into podio.webhook_deliveries (webhook_id, event_type, payload, status)
  select w.id, new.event_type,
    jsonb_build_object(
      'event', new.event_type,
      'organization_id', new.organization_id,
      'workspace_id', new.workspace_id,
      'app_id', new.app_id,
      'item_id', new.item_id,
      'target_type', new.target_type,
      'target_id', new.target_id,
      'data', new.payload,
      'occurred_at', new.created_at
    ),
    'pending'
  from podio.webhooks w
  where w.organization_id = new.organization_id
    and w.is_active and w.is_verified
    and (w.app_id is null or w.app_id = new.app_id)
    and new.event_type = any(w.events);
  return new;
end $$;

drop trigger if exists trg_emit_webhooks on podio.activity_events;
create trigger trg_emit_webhooks after insert on podio.activity_events
for each row execute function podio.tg_emit_webhooks();

-- Test ping (bypasses the verified requirement so endpoints can be tested first)
create or replace function podio.ping_webhook(p_hook uuid)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare
  v_hook podio.webhooks;
begin
  select * into v_hook from podio.webhooks where id = p_hook;
  if v_hook.id is null or not podio.is_org_admin(v_hook.organization_id) then
    raise exception 'no access';
  end if;
  insert into podio.webhook_deliveries (webhook_id, event_type, payload, status)
  values (p_hook, 'hook.ping',
    jsonb_build_object('event', 'hook.ping', 'verify_token', v_hook.verify_token,
      'occurred_at', now()),
    'pending');
end $$;
grant execute on function podio.ping_webhook(uuid) to authenticated;

-- Dispatcher: reconcile responses, retry failures with backoff, send due deliveries
create or replace function podio.process_webhook_deliveries()
returns int
language plpgsql security definer set search_path = podio, public as $$
declare
  v_d record;
  v_req bigint;
  v_count int := 0;
begin
  update podio.webhook_deliveries d
  set status = case
        when r.status_code between 200 and 299 then 'success'::podio.run_status
        when d.attempts >= 5 then 'failed'::podio.run_status
        else 'pending'::podio.run_status
      end,
      response_status = r.status_code,
      response_body = left(coalesce(r.content, ''), 500),
      delivered_at = case when r.status_code between 200 and 299 then now() end,
      next_retry_at = case
        when r.status_code between 200 and 299 or d.attempts >= 5 then null
        else now() + ((power(2, d.attempts))::int || ' minutes')::interval
      end
  from net._http_response r
  where d.status = 'running' and d.request_id = r.id;

  update podio.webhook_deliveries
  set status = case when attempts >= 5 then 'failed'::podio.run_status else 'pending'::podio.run_status end,
      response_body = 'timeout / no response',
      next_retry_at = case when attempts >= 5 then null
        else now() + ((power(2, attempts))::int || ' minutes')::interval end
  where status = 'running' and created_at < now() - interval '2 minutes'
    and request_id is not null
    and not exists (select 1 from net._http_response r where r.id = request_id);

  for v_d in
    select d.id, d.payload, w.url, w.secret
    from podio.webhook_deliveries d
    join podio.webhooks w on w.id = d.webhook_id
    where d.status = 'pending'
      and coalesce(d.next_retry_at, now()) <= now()
      and w.is_active
    order by d.created_at
    limit 25
  loop
    select net.http_post(
      url := v_d.url,
      body := v_d.payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Webhook-Signature',
          encode(extensions.hmac(v_d.payload::text, v_d.secret, 'sha256'), 'hex'))
    ) into v_req;
    update podio.webhook_deliveries
    set status = 'running', attempts = attempts + 1, request_id = v_req
    where id = v_d.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

do $$
begin
  perform cron.schedule('podio_process_webhooks', '* * * * *',
    'select podio.process_webhook_deliveries()');
exception when others then null;
end $$;
