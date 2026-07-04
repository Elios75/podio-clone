-- Podio Clone: Migration 30 - Email delivery worker, reply threading, private storage
-- Outbound: cron drains outbound_emails through Resend via pg_net. The API key
-- lives in Supabase Vault (never in code):
--   select vault.create_secret('re_your_key', 'resend_api_key');
--   select vault.create_secret('Your Name <you@yourdomain.com>', 'email_from'); -- optional
-- Without the secret, the worker no-ops and rows stay queued.

alter table podio.outbound_emails add column if not exists request_id bigint;

create or replace function podio.process_outbound_emails()
returns int
language plpgsql security definer set search_path = podio, public as $$
declare
  v_key text;
  v_from text;
  v_e record;
  v_req bigint;
  v_count int := 0;
begin
  begin
    select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  exception when others then
    v_key := null;
  end;
  if v_key is null then
    return 0;
  end if;
  begin
    select decrypted_secret into v_from
    from vault.decrypted_secrets where name = 'email_from' limit 1;
  exception when others then
    v_from := null;
  end;
  v_from := coalesce(v_from, 'Podio Clone <onboarding@resend.dev>');

  update podio.outbound_emails e
  set status = case when r.status_code between 200 and 299
        then 'success' else 'failed' end::podio.job_status,
      error = case when r.status_code between 200 and 299
        then null else left(coalesce(r.content, ''), 300) end,
      sent_at = case when r.status_code between 200 and 299 then now() end
  from net._http_response r
  where e.status = 'running' and e.request_id = r.id;

  for v_e in
    select * from podio.outbound_emails
    where status = 'queued' order by created_at limit 10
  loop
    select net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_build_object(
        'from', v_from,
        'to', jsonb_build_array(v_e.to_address),
        'subject', v_e.subject,
        'text', coalesce(v_e.body_text, '')),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json')
    ) into v_req;
    update podio.outbound_emails
    set status = 'running', request_id = v_req where id = v_e.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

do $$
begin
  perform cron.schedule('podio_send_emails', '* * * * *',
    'select podio.process_outbound_emails()');
exception when others then null;
end $$;

-- Inbound v2: plus-addressing threads replies onto existing items.
create or replace function podio.process_inbound_email(
  p_to text, p_from text, p_subject text, p_body_text text, p_body_html text default null
)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_local text;
  v_domain text;
  v_base text;
  v_tag text;
  v_addr podio.app_email_addresses;
  v_item podio.items;
  v_values jsonb := '{}'::jsonb;
  v_subject_field uuid;
  v_body_field uuid;
  v_org uuid; v_ws uuid;
begin
  v_local := split_part(lower(trim(p_to)), '@', 1);
  v_domain := split_part(lower(trim(p_to)), '@', 2);
  v_base := split_part(v_local, '+', 1);
  v_tag := split_part(v_local, '+', 2);

  select * into v_addr from podio.app_email_addresses
  where lower(address) = v_base || '@' || v_domain and is_active;
  if v_addr.id is null then
    return jsonb_build_object('processed', false, 'reason', 'unknown or inactive address');
  end if;

  select a.workspace_id, w.organization_id into v_ws, v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = v_addr.app_id;

  if v_tag ~ '^i[0-9]+$' then
    select * into v_item from podio.items
    where app_id = v_addr.app_id
      and item_number = substr(v_tag, 2)::bigint and not is_deleted;
    if v_item.id is not null then
      insert into podio.inbound_emails
        (app_email_id, item_id, from_address, subject, body_text, body_html, processed_at)
      values (v_addr.id, v_item.id, p_from, p_subject, p_body_text, p_body_html, now());
      insert into podio.activity_events
        (organization_id, workspace_id, app_id, item_id, event_type, target_type, target_id, payload)
      values (v_org, v_ws, v_addr.app_id, v_item.id, 'email_received', 'item', v_item.id,
        jsonb_build_object('from', p_from, 'subject', p_subject, 'reply', true));
      insert into podio.notifications (user_id, event_type, target_type, target_id, payload)
      select f.user_id, 'email_received', 'item', v_item.id,
        jsonb_build_object('item_title', v_item.title, 'from', p_from,
          'preview', left(coalesce(p_body_text,''), 140))
      from podio.item_followers f where f.item_id = v_item.id;
      return jsonb_build_object('processed', true, 'threaded_to_item', v_item.id);
    end if;
  end if;

  v_subject_field := nullif(v_addr.field_mapping->>'subject_field_id','')::uuid;
  v_body_field := nullif(v_addr.field_mapping->>'body_field_id','')::uuid;
  if v_subject_field is null then
    select id into v_subject_field from podio.app_fields
    where app_id = v_addr.app_id and is_primary and status = 'active' limit 1;
  end if;

  insert into podio.items (app_id) values (v_addr.app_id) returning * into v_item;

  if v_subject_field is not null and p_subject is not null then
    v_values := v_values || jsonb_build_object(v_subject_field::text, to_jsonb(p_subject));
  end if;
  if v_body_field is not null and p_body_text is not null then
    v_values := v_values || jsonb_build_object(v_body_field::text, to_jsonb(p_body_text));
  end if;
  perform podio.write_values(v_addr.app_id, v_item.id, v_values, null);

  insert into podio.inbound_emails
    (app_email_id, item_id, from_address, subject, body_text, body_html, processed_at)
  values (v_addr.id, v_item.id, p_from, p_subject, p_body_text, p_body_html, now());

  insert into podio.activity_events
    (organization_id, workspace_id, app_id, item_id, event_type, target_type, target_id, payload)
  values (v_org, v_ws, v_addr.app_id, v_item.id, 'email_received', 'item', v_item.id,
    jsonb_build_object('from', p_from, 'subject', p_subject));

  perform podio.run_simple_automations(v_addr.app_id, v_item.id, 'email_received', null);

  return jsonb_build_object('processed', true, 'item_id', v_item.id);
end $$;

-- Storage hardening: bucket goes private; the app now uses signed URLs
update storage.buckets set public = false where id = 'podio-files';
