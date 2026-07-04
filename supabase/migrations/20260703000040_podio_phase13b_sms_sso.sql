-- Podio Clone: Migration 40 - Phase 13b: Twilio SMS worker queue, hard SSO
-- enforcement (Auth Hooks), IdP group -> role mapping.
--
-- SMS delivery: exec_action queues rows in podio.outbound_sms; a pg_cron job
-- pings the `sms-worker` edge function (Twilio's API is form-encoded, which
-- pg_net can't produce). Setup, all optional — without it rows stay queued:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/sms-worker', 'sms_worker_url');
--   select vault.create_secret('<random-long-token>', 'sms_worker_token');
--   supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1... SMS_WORKER_TOKEN=<same-token>
--
-- Hard SSO: enable both hooks in Dashboard -> Authentication -> Hooks:
--   "Password verification attempt" -> podio.hook_password_verification
--   "Before user created"           -> podio.hook_before_user_created

-- ============================================================
-- 1) Outbound SMS queue
-- ============================================================
create table if not exists podio.outbound_sms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references podio.organizations(id) on delete cascade,
  to_number text not null,
  body text not null,
  item_id uuid references podio.items(id) on delete set null,
  status podio.job_status not null default 'queued',
  error text,
  provider_sid text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table podio.outbound_sms enable row level security;
create policy p_outbound_sms_select on podio.outbound_sms for select to authenticated
  using (organization_id is not null and podio.is_org_member(organization_id));
grant select on podio.outbound_sms to authenticated;
grant all on podio.outbound_sms to service_role;
create index if not exists idx_outbound_sms_queued
  on podio.outbound_sms (created_at) where status = 'queued';

-- ============================================================
-- 2) exec_action: full replacement, adding the send_sms case
-- ============================================================
create or replace function podio.exec_action(
  p_action jsonb, p_org uuid, p_ws uuid, p_item uuid, p_actor uuid, p_auto_name text
)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_req bigint;
  v_url text;
  v_method text;
  v_cnt int;
  v_rel record;
  v_to text;
begin
  case p_action->>'type'
    when 'create_task' then
      if p_actor is not null then
        insert into podio.tasks
          (organization_id, workspace_id, target_type, target_id, title, assignee_id, created_by, due_at)
        values
          (p_org, p_ws, 'item', p_item, p_action->>'title',
           nullif(p_action->>'assignee_id','')::uuid, p_actor,
           case when nullif(p_action->>'due_days','') is not null
             then now() + ((p_action->>'due_days')::int || ' days')::interval end);
        if nullif(p_action->>'assignee_id','') is not null
           and (p_action->>'assignee_id')::uuid <> p_actor then
          insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
          values ((p_action->>'assignee_id')::uuid, 'task_assigned', 'item', p_item, p_actor,
            jsonb_build_object('task_title', p_action->>'title', 'automation', p_auto_name));
        end if;
      end if;
    when 'update_field' then
      insert into podio.item_field_values (item_id, field_id, position, value, value_text, value_number)
      values (p_item, (p_action->>'field_id')::uuid, 0, p_action->'value',
        case when jsonb_typeof(p_action->'value') = 'string' then p_action->'value' #>> '{}' end,
        case when jsonb_typeof(p_action->'value') = 'number' then (p_action->'value' #>> '{}')::numeric end)
      on conflict (item_id, field_id, position) do update
        set value = excluded.value, value_text = excluded.value_text,
            value_number = excluded.value_number, updated_at = now();
    when 'notify' then
      if nullif(p_action->>'user_id','') is not null then
        insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
        values ((p_action->>'user_id')::uuid, 'automation', 'item', p_item, p_actor,
          jsonb_build_object('message', p_action->>'message', 'automation', p_auto_name));
      end if;
    when 'add_comment' then
      if p_actor is not null then
        insert into podio.comments (workspace_id, target_type, target_id, created_by, body)
        values (p_ws, 'item', p_item, p_actor, coalesce(p_action->>'body','(automation comment)'));
      end if;
    when 'send_email' then
      if nullif(p_action->>'to','') is not null then
        insert into podio.outbound_emails (organization_id, to_address, subject, body_text, item_id)
        values (p_org, p_action->>'to',
          coalesce(p_action->>'subject', 'Notification from ' || coalesce(p_auto_name,'automation')),
          p_action->>'body', p_item);
      end if;
    when 'http_request' then
      v_url := nullif(p_action->>'url','');
      if v_url is null or v_url !~* '^https?://' then
        return jsonb_build_object('action','http_request','ok',false,'reason','invalid url');
      end if;
      v_method := lower(coalesce(nullif(p_action->>'method',''), 'post'));
      if v_method = 'get' then
        select net.http_get(
          url := v_url,
          headers := coalesce(p_action->'headers','{}'::jsonb)
        ) into v_req;
      else
        select net.http_post(
          url := v_url,
          body := coalesce(p_action->'body',
            jsonb_build_object('item_id', p_item::text, 'automation', coalesce(p_auto_name,''))),
          headers := jsonb_build_object('Content-Type','application/json')
            || coalesce(p_action->'headers','{}'::jsonb)
        ) into v_req;
      end if;
      return jsonb_build_object('action','http_request','ok',true,
        'method', v_method, 'request_id', v_req);
    when 'update_related_item' then
      if nullif(p_action->>'field_id','') is null then
        return jsonb_build_object('action','update_related_item','ok',false,'reason','missing field_id');
      end if;
      v_cnt := 0;
      for v_rel in
        select distinct case when r.from_item_id = p_item then r.to_item_id else r.from_item_id end as rid
        from podio.item_relationships r
        where (r.from_item_id = p_item or r.to_item_id = p_item)
          and (nullif(p_action->>'relationship_field_id','') is null
               or r.field_id = (p_action->>'relationship_field_id')::uuid)
        limit 50
      loop
        insert into podio.item_field_values (item_id, field_id, position, value, value_text, value_number)
        values (v_rel.rid, (p_action->>'field_id')::uuid, 0, p_action->'value',
          case when jsonb_typeof(p_action->'value') = 'string' then p_action->'value' #>> '{}' end,
          case when jsonb_typeof(p_action->'value') = 'number' then (p_action->'value' #>> '{}')::numeric end)
        on conflict (item_id, field_id, position) do update
          set value = excluded.value, value_text = excluded.value_text,
              value_number = excluded.value_number, updated_at = now();
        v_cnt := v_cnt + 1;
      end loop;
      return jsonb_build_object('action','update_related_item','ok',true,'updated', v_cnt);
    when 'generate_pdf' then
      if p_actor is not null then
        insert into podio.comments (workspace_id, target_type, target_id, created_by, body)
        values (p_ws, 'item', p_item, p_actor,
          coalesce(nullif(p_action->>'note',''), '📄 PDF generated by ' || coalesce(p_auto_name, 'automation'))
          || ' — download: /api/pdf/' || p_item::text);
      end if;
      return jsonb_build_object('action','generate_pdf','ok',true,
        'url', '/api/pdf/' || p_item::text);
    when 'chat_message' then
      v_url := nullif(p_action->>'url','');
      if v_url is null or v_url !~* '^https://' then
        return jsonb_build_object('action','chat_message','ok',false,'reason','invalid webhook url');
      end if;
      select net.http_post(
        url := v_url,
        body := jsonb_build_object('text',
          coalesce(nullif(p_action->>'text',''), 'Notification from ' || coalesce(p_auto_name,'automation'))
          || ' (item ' || p_item::text || ')'),
        headers := '{"Content-Type":"application/json"}'::jsonb
      ) into v_req;
      return jsonb_build_object('action','chat_message','ok',true,'request_id', v_req);
    when 'send_sms' then
      v_to := regexp_replace(coalesce(p_action->>'to',''), '[^0-9+]', '', 'g');
      if v_to !~ '^\+?[0-9]{7,15}$' then
        return jsonb_build_object('action','send_sms','ok',false,'reason','invalid phone number');
      end if;
      insert into podio.outbound_sms (organization_id, to_number, body, item_id)
      values (p_org, v_to,
        left(coalesce(nullif(p_action->>'body',''),
          'Notification from ' || coalesce(p_auto_name,'automation')), 1600),
        p_item);
      return jsonb_build_object('action','send_sms','ok',true,'queued',true);
    else
      return jsonb_build_object('action', p_action->>'type', 'ok', false, 'reason', 'unknown action');
  end case;
  return jsonb_build_object('action', p_action->>'type', 'ok', true);
end $$;

-- ============================================================
-- 3) Worker ping: cron nudges the edge function only when work exists.
--    The edge function does the actual Twilio calls (form-encoded + basic auth).
-- ============================================================
create or replace function podio.process_outbound_sms()
returns int
language plpgsql security definer set search_path = podio, public as $$
declare
  v_url text;
  v_token text;
  v_n int;
begin
  select count(*) into v_n from podio.outbound_sms where status = 'queued';
  if v_n = 0 then
    return 0;
  end if;
  begin
    select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'sms_worker_url' limit 1;
    select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'sms_worker_token' limit 1;
  exception when others then
    v_url := null;
  end;
  if v_url is null or v_token is null then
    return 0; -- not configured yet; rows stay queued
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-worker-token', v_token));
  return v_n;
end $$;

-- cron runs as the function owner; nobody else needs to call this.
revoke execute on function podio.process_outbound_sms() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('podio_send_sms', '* * * * *',
    'select podio.process_outbound_sms()');
exception when others then null;
end $$;

-- ============================================================
-- 4) Hard SSO enforcement — Auth Hook functions
--    (created here; must be *enabled* in Dashboard -> Auth -> Hooks)
-- ============================================================

-- Rejects password sign-in for any email domain with enforce_sso = true.
create or replace function podio.hook_password_verification(event jsonb)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_domain text;
begin
  select lower(split_part(u.email, '@', 2)) into v_domain
  from auth.users u where u.id = (event->>'user_id')::uuid;

  if v_domain is not null and exists (
    select 1 from podio.organizations o
    where lower(o.security_settings->>'sso_domain') = v_domain
      and coalesce((o.security_settings->>'enforce_sso')::boolean, false)
  ) then
    return jsonb_build_object(
      'decision', 'reject',
      'message', 'Your organization requires single sign-on (SSO). Password login is disabled.');
  end if;
  return jsonb_build_object('decision', 'continue');
end $$;

-- Rejects password *sign-ups* for enforced domains (SSO provisioning still works).
create or replace function podio.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_domain text;
  v_provider text;
begin
  v_provider := coalesce(event#>>'{user,app_metadata,provider}', '');
  v_domain := lower(split_part(coalesce(event#>>'{user,email}', ''), '@', 2));

  if v_provider = 'email' and v_domain <> '' and exists (
    select 1 from podio.organizations o
    where lower(o.security_settings->>'sso_domain') = v_domain
      and coalesce((o.security_settings->>'enforce_sso')::boolean, false)
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Your organization requires single sign-on (SSO). Use "Continue with SSO" to sign up.'));
  end if;
  return '{}'::jsonb;
end $$;

grant usage on schema podio to supabase_auth_admin;
grant execute on function podio.hook_password_verification(jsonb) to supabase_auth_admin;
grant execute on function podio.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function podio.hook_password_verification(jsonb) from authenticated, anon, public;
revoke execute on function podio.hook_before_user_created(jsonb) from authenticated, anon, public;

-- ============================================================
-- 5) IdP group -> role mapping (authoritative on every SSO login)
--    Convention: organizations.security_settings.sso_group_roles =
--      { "Engineering Admins": "admin", "Staff": "employee", "Contractors": "light" }
--    Groups are read from raw_user_meta_data.groups or .custom_claims.groups
--    (configure your IdP attribute mapping to emit them; see docs/SSO.md).
-- ============================================================
create or replace function podio.claim_sso_membership()
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_email text;
  v_domain text;
  v_meta jsonb;
  v_groups jsonb;
  v_org record;
  v_role podio.org_role;
  v_orgs int := 0;
  v_shares int := 0;
  v_synced int := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('claimed_orgs', 0, 'claimed_shares', 0, 'roles_synced', 0);
  end if;
  select lower(email), raw_user_meta_data into v_email, v_meta
  from auth.users where id = auth.uid();
  if v_email is null then
    return jsonb_build_object('claimed_orgs', 0, 'claimed_shares', 0, 'roles_synced', 0);
  end if;
  v_domain := split_part(v_email, '@', 2);

  v_groups := coalesce(v_meta->'groups', v_meta->'custom_claims'->'groups');
  if jsonb_typeof(v_groups) = 'string' then
    v_groups := jsonb_build_array(v_groups #>> '{}');
  end if;
  if v_groups is null or jsonb_typeof(v_groups) <> 'array' then
    v_groups := '[]'::jsonb;
  end if;

  for v_org in
    select o.id, o.security_settings->'sso_group_roles' as role_map
    from podio.organizations o
    where lower(o.security_settings->>'sso_domain') = v_domain
  loop
    -- Resolve the highest-ranked role the user's groups map to (if any)
    v_role := null;
    if jsonb_typeof(v_org.role_map) = 'object' then
      select r::podio.org_role into v_role from (
        select v_org.role_map->>g as r,
          case v_org.role_map->>g
            when 'admin' then 1 when 'employee' then 2
            when 'light' then 3 when 'guest' then 4 end as rnk
        from jsonb_array_elements_text(v_groups) g
        where v_org.role_map ? g
          and v_org.role_map->>g in ('admin','employee','light','guest')
      ) m where rnk is not null order by rnk limit 1;
    end if;

    insert into podio.organization_members (organization_id, user_id, role)
    values (v_org.id, auth.uid(), coalesce(v_role, 'employee'))
    on conflict (organization_id, user_id) do nothing;
    if found then
      v_orgs := v_orgs + 1;
    elsif v_role is not null then
      -- IdP is authoritative on repeat logins; never touch owners.
      update podio.organization_members m set role = v_role
      where m.organization_id = v_org.id and m.user_id = auth.uid()
        and m.role <> 'owner' and m.role <> v_role;
      if found then v_synced := v_synced + 1; end if;
    end if;
  end loop;

  with upd as (
    update podio.item_shares
    set user_id = auth.uid()
    where user_id is null and lower(email) = v_email and revoked_at is null
    returning 1
  ) select count(*) into v_shares from upd;

  return jsonb_build_object(
    'claimed_orgs', v_orgs, 'claimed_shares', v_shares, 'roles_synced', v_synced);
end $$;
grant execute on function podio.claim_sso_membership() to authenticated;
