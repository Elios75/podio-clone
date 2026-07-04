-- Podio Clone: Migration 38 - Phase 13a: billing plans + enforced limits,
-- chat_message action (Slack/Teams incoming webhooks), retention policies.
-- Stripe wiring: /api/billing/checkout + /api/billing/webhook (env keys), and
-- apply_stripe_plan() gated by a Vault secret:
--   select vault.create_secret('some-long-random-string', 'stripe_rpc_proof');
-- Set the same value as STRIPE_RPC_PROOF in the app environment.

-- ============================================================
-- 1) Plans (spec §19): free / team / business / enterprise (-1 = unlimited)
-- ============================================================
create or replace function podio.plan_limits(p_plan text)
returns jsonb
language sql immutable as $$
  select case coalesce(p_plan, 'free')
    when 'team' then '{"users": 20, "items": 20000, "storage_mb": 10240, "automations_month": 5000, "runs_retention_days": 90, "revisions_per_item": 100}'::jsonb
    when 'business' then '{"users": 100, "items": 200000, "storage_mb": 51200, "automations_month": 50000, "runs_retention_days": 365, "revisions_per_item": 1000}'::jsonb
    when 'enterprise' then '{"users": -1, "items": -1, "storage_mb": -1, "automations_month": -1, "runs_retention_days": -1, "revisions_per_item": -1}'::jsonb
    else '{"users": 5, "items": 1000, "storage_mb": 1024, "automations_month": 250, "runs_retention_days": 30, "revisions_per_item": 25}'::jsonb
  end;
$$;

create or replace function podio.org_limit(p_org uuid, p_key text)
returns bigint
language sql stable security definer set search_path = podio, public as $$
  select coalesce((podio.plan_limits(o.billing_plan)->>p_key)::bigint, -1)
  from podio.organizations o where o.id = p_org;
$$;

-- ============================================================
-- 2) Usage snapshot for the billing UI
-- ============================================================
create or replace function podio.org_usage(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = podio, public as $$
declare
  v_plan text;
begin
  if not podio.is_org_member(p_org) then raise exception 'not an org member'; end if;
  select billing_plan into v_plan from podio.organizations where id = p_org;
  return jsonb_build_object(
    'plan', coalesce(v_plan, 'free'),
    'limits', podio.plan_limits(v_plan),
    'users', (select count(*) from podio.organization_members where organization_id = p_org),
    'items', (select count(*) from podio.items i
      join podio.apps a on a.id = i.app_id
      join podio.workspaces w on w.id = a.workspace_id
      where w.organization_id = p_org and not i.is_deleted),
    'storage_bytes', (select coalesce(sum(size_bytes), 0) from podio.files
      where organization_id = p_org and deleted_at is null and provider = 'native'),
    'automations_this_month', (select count(*) from podio.automation_runs r
      join podio.automations a on a.id = r.automation_id
      join podio.workspaces w on w.id = a.workspace_id
      where w.organization_id = p_org and r.created_at >= date_trunc('month', now()))
  );
end $$;
grant execute on function podio.org_usage(uuid) to authenticated;

-- ============================================================
-- 3) Enforcement (bounded counts so checks stay cheap)
-- ============================================================
create or replace function podio.trg_enforce_item_limit()
returns trigger
language plpgsql security definer set search_path = podio, public as $$
declare
  v_org uuid;
  v_cap bigint;
  v_count bigint;
begin
  select w.organization_id into v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = new.app_id;
  if v_org is null then return new; end if;

  v_cap := podio.org_limit(v_org, 'items');
  if v_cap < 0 then return new; end if;

  select count(*) into v_count from (
    select 1 from podio.items i
    join podio.apps a on a.id = i.app_id
    join podio.workspaces w on w.id = a.workspace_id
    where w.organization_id = v_org and not i.is_deleted
    limit v_cap + 1
  ) x;
  if v_count >= v_cap then
    raise exception 'plan limit reached: % items on the % plan — upgrade to add more',
      v_cap, (select billing_plan from podio.organizations where id = v_org);
  end if;
  return new;
end $$;

drop trigger if exists trg_items_plan_limit on podio.items;
create trigger trg_items_plan_limit
before insert on podio.items
for each row execute function podio.trg_enforce_item_limit();

create or replace function podio.trg_enforce_member_limit()
returns trigger
language plpgsql security definer set search_path = podio, public as $$
declare
  v_cap bigint;
  v_count bigint;
begin
  v_cap := podio.org_limit(new.organization_id, 'users');
  if v_cap < 0 then return new; end if;
  select count(*) into v_count from podio.organization_members
  where organization_id = new.organization_id;
  if v_count >= v_cap then
    raise exception 'plan limit reached: % members on the % plan — upgrade to add more',
      v_cap, (select billing_plan from podio.organizations where id = new.organization_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_members_plan_limit on podio.organization_members;
create trigger trg_members_plan_limit
before insert on podio.organization_members
for each row execute function podio.trg_enforce_member_limit();

create or replace function podio.trg_enforce_storage_limit()
returns trigger
language plpgsql security definer set search_path = podio, public as $$
declare
  v_cap bigint;
  v_used bigint;
begin
  if new.provider <> 'native' or new.organization_id is null then return new; end if;
  v_cap := podio.org_limit(new.organization_id, 'storage_mb');
  if v_cap < 0 then return new; end if;
  select coalesce(sum(size_bytes), 0) into v_used from podio.files
  where organization_id = new.organization_id and deleted_at is null and provider = 'native';
  if v_used + coalesce(new.size_bytes, 0) > v_cap * 1024 * 1024 then
    raise exception 'plan limit reached: % MB storage on the % plan — upgrade for more space',
      v_cap, (select billing_plan from podio.organizations where id = new.organization_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_files_plan_limit on podio.files;
create trigger trg_files_plan_limit
before insert on podio.files
for each row execute function podio.trg_enforce_storage_limit();

-- Monthly automation cap: checked at fire time; over-cap orgs skip silently
create or replace function podio.automation_cap_reached(p_org uuid)
returns boolean
language plpgsql stable security definer set search_path = podio, public as $$
declare
  v_cap bigint;
  v_count bigint;
begin
  v_cap := podio.org_limit(p_org, 'automations_month');
  if v_cap < 0 then return false; end if;
  select count(*) into v_count from (
    select 1 from podio.automation_runs r
    join podio.automations a on a.id = r.automation_id
    join podio.workspaces w on w.id = a.workspace_id
    where w.organization_id = p_org and r.created_at >= date_trunc('month', now())
    limit v_cap + 1
  ) x;
  return v_count >= v_cap;
end $$;

-- ============================================================
-- 4) Plan changes: manual (owner) + Stripe webhook (vault-proofed)
-- ============================================================
create or replace function podio.set_billing_plan(p_org uuid, p_plan text)
returns void
language plpgsql security definer set search_path = podio, public as $$
begin
  if p_plan not in ('free','team','business','enterprise') then
    raise exception 'invalid plan';
  end if;
  if not exists (select 1 from podio.organization_members
    where organization_id = p_org and user_id = auth.uid() and role = 'owner') then
    raise exception 'only the org owner can change the plan';
  end if;
  update podio.organizations set billing_plan = p_plan where id = p_org;
  insert into podio.audit_logs (organization_id, actor_id, action, target_type, metadata)
  values (p_org, auth.uid(), 'billing.plan_changed', 'organization',
    jsonb_build_object('plan', p_plan, 'via', 'manual'));
end $$;
grant execute on function podio.set_billing_plan(uuid, text) to authenticated;

create or replace function podio.apply_stripe_plan(p_org uuid, p_plan text, p_proof text)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare
  v_proof text;
begin
  begin
    select decrypted_secret into v_proof
    from vault.decrypted_secrets where name = 'stripe_rpc_proof' limit 1;
  exception when others then
    v_proof := null;
  end;
  if v_proof is null or p_proof is distinct from v_proof then
    raise exception 'invalid proof';
  end if;
  if p_plan not in ('free','team','business','enterprise') then
    raise exception 'invalid plan';
  end if;
  update podio.organizations set billing_plan = p_plan where id = p_org;
  insert into podio.audit_logs (organization_id, actor_id, action, target_type, metadata)
  values (p_org, null, 'billing.plan_changed', 'organization',
    jsonb_build_object('plan', p_plan, 'via', 'stripe'));
end $$;
grant execute on function podio.apply_stripe_plan(uuid, text, text) to anon, authenticated;

-- ============================================================
-- 5) run_simple_automations / execute_automation: honor the monthly cap
-- ============================================================
create or replace function podio.run_simple_automations(
  p_app uuid, p_item uuid, p_event text, p_actor uuid
)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare
  v_auto record;
  v_cond jsonb;
  v_action jsonb;
  v_ok boolean;
  v_logs jsonb;
  v_actor uuid;
  v_ws uuid; v_org uuid;
begin
  select a.workspace_id, w.organization_id into v_ws, v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = p_app;

  if podio.automation_cap_reached(v_org) then return; end if;

  for v_auto in
    select * from podio.automations
    where app_id = p_app and status = 'active' and kind = 'simple'
      and trigger->>'type' = p_event
  loop
    v_actor := coalesce(p_actor, v_auto.created_by);
    v_ok := true;
    for v_cond in select * from jsonb_array_elements(v_auto.conditions) loop
      if not podio.check_condition(p_item, v_cond) then
        v_ok := false;
      end if;
    end loop;
    if not v_ok then continue; end if;

    v_logs := '[]'::jsonb;
    begin
      for v_action in select * from jsonb_array_elements(v_auto.actions) loop
        v_logs := v_logs || jsonb_build_array(
          podio.exec_action(v_action, v_org, v_ws, p_item, v_actor, v_auto.name));
      end loop;
      insert into podio.automation_runs (automation_id, item_id, status, logs, trigger_event, started_at, finished_at)
      values (v_auto.id, p_item, 'success', v_logs, jsonb_build_object('type', p_event), now(), now());
    exception when others then
      insert into podio.automation_runs (automation_id, item_id, status, error, trigger_event, started_at, finished_at)
      values (v_auto.id, p_item, 'failed', SQLERRM, jsonb_build_object('type', p_event), now(), now());
    end;
  end loop;

  insert into podio.automation_runs (automation_id, item_id, status, state, trigger_event, scheduled_for)
  select a.id, p_item, 'pending',
    jsonb_build_object('queue', coalesce(a.definition->'steps', '[]'::jsonb)),
    jsonb_build_object('type', p_event, 'actor', p_actor),
    now()
  from podio.automations a
  where a.app_id = p_app and a.status = 'active' and a.kind = 'advanced'
    and a.trigger->>'type' = p_event;
end $$;

-- ============================================================
-- 6) chat_message action: Slack / Teams incoming-webhook URLs (JSON {"text": …})
--    (full exec_action replacement, adding the new case)
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
    else
      return jsonb_build_object('action', p_action->>'type', 'ok', false, 'reason', 'unknown action');
  end case;
  return jsonb_build_object('action', p_action->>'type', 'ok', true);
end $$;

-- ============================================================
-- 7) Retention policies by plan (daily cron)
-- ============================================================
create or replace function podio.process_retention()
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_org record;
  v_days bigint;
  v_keep bigint;
  v_runs int := 0;
  v_hooks int := 0;
  v_revs int := 0;
  n int;
begin
  for v_org in select id, billing_plan from podio.organizations loop
    v_days := podio.org_limit(v_org.id, 'runs_retention_days');
    if v_days >= 0 then
      delete from podio.automation_runs r
      using podio.automations a, podio.workspaces w
      where r.automation_id = a.id and a.workspace_id = w.id
        and w.organization_id = v_org.id
        and r.status in ('success','failed','cancelled')
        and r.created_at < now() - (v_days || ' days')::interval;
      get diagnostics n = row_count; v_runs := v_runs + n;

      delete from podio.webhook_deliveries d
      using podio.webhooks h
      where d.webhook_id = h.id and h.organization_id = v_org.id
        and d.status in ('success','failed')
        and d.created_at < now() - (v_days || ' days')::interval;
      get diagnostics n = row_count; v_hooks := v_hooks + n;
    end if;

    v_keep := podio.org_limit(v_org.id, 'revisions_per_item');
    if v_keep >= 0 then
      delete from podio.item_revisions ir
      where ir.id in (
        select x.id from (
          select r2.id, row_number() over (partition by r2.item_id order by r2.revision desc) as rn
          from podio.item_revisions r2
          join podio.items i on i.id = r2.item_id
          join podio.apps a on a.id = i.app_id
          join podio.workspaces w on w.id = a.workspace_id
          where w.organization_id = v_org.id
        ) x where x.rn > v_keep
        limit 5000
      );
      get diagnostics n = row_count; v_revs := v_revs + n;
    end if;
  end loop;
  return jsonb_build_object('runs_pruned', v_runs, 'deliveries_pruned', v_hooks, 'revisions_pruned', v_revs);
end $$;

do $$
begin
  perform cron.schedule('podio_retention', '30 3 * * *',
    'select podio.process_retention()');
exception when others then null;
end $$;
