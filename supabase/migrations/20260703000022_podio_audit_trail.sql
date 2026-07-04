-- Podio Clone: Migration 22 - Audit trail: generic trigger on sensitive tables
-- Captures who changed what, with a compact old/new diff on updates.
-- Secrets (key hashes, webhook secrets) are stripped from snapshots.

create or replace function podio.tg_audit() returns trigger
language plpgsql security definer set search_path = podio, public as $$
declare
  v_org uuid;
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb := '{}'::jsonb;
  k text;
begin
  v_row := to_jsonb(coalesce(new, old));

  case TG_TABLE_NAME
    when 'organization_members' then v_org := (v_row->>'organization_id')::uuid;
    when 'workspaces' then v_org := (v_row->>'organization_id')::uuid;
    when 'api_keys' then v_org := (v_row->>'organization_id')::uuid;
    when 'webhooks' then v_org := (v_row->>'organization_id')::uuid;
    when 'app_templates' then v_org := (v_row->>'organization_id')::uuid;
    when 'workspace_members' then
      select organization_id into v_org from podio.workspaces
      where id = (v_row->>'workspace_id')::uuid;
    when 'automations' then
      select organization_id into v_org from podio.workspaces
      where id = (v_row->>'workspace_id')::uuid;
    when 'item_shares' then
      v_org := podio.workspace_org(podio.item_workspace((v_row->>'item_id')::uuid));
    else v_org := null;
  end case;
  if v_org is null then
    return coalesce(new, old);
  end if;

  if TG_OP = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for k in select jsonb_object_keys(v_new) loop
      if (v_new->k) is distinct from (v_old->k)
         and k not in ('updated_at','last_used_at','last_read_at','last_login_at',
                       'next_item_number','install_count','request_id') then
        v_diff := v_diff || jsonb_build_object(
          k, jsonb_build_object('old', v_old->k, 'new', v_new->k));
      end if;
    end loop;
    if v_diff = '{}'::jsonb then
      return new;
    end if;
  end if;

  insert into podio.audit_logs
    (organization_id, workspace_id, actor_id, action, target_type, target_id, metadata)
  values (
    v_org,
    case
      when TG_TABLE_NAME in ('workspace_members','automations') then (v_row->>'workspace_id')::uuid
      when TG_TABLE_NAME = 'workspaces' then (v_row->>'id')::uuid
    end,
    auth.uid(),
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    (v_row->>'id')::uuid,
    case when TG_OP = 'UPDATE' then v_diff
      else v_row - array['key_hash','secret','verify_token','definition',
                         'config','settings','field_mapping','notification_prefs']
    end);
  return coalesce(new, old);
end $$;

drop trigger if exists trg_audit on podio.organization_members;
create trigger trg_audit after insert or update or delete on podio.organization_members
for each row execute function podio.tg_audit();

drop trigger if exists trg_audit on podio.workspace_members;
create trigger trg_audit after insert or update or delete on podio.workspace_members
for each row execute function podio.tg_audit();

drop trigger if exists trg_audit on podio.workspaces;
create trigger trg_audit after insert or update or delete on podio.workspaces
for each row execute function podio.tg_audit();

drop trigger if exists trg_audit on podio.api_keys;
create trigger trg_audit after insert or update or delete on podio.api_keys
for each row execute function podio.tg_audit();

drop trigger if exists trg_audit on podio.webhooks;
create trigger trg_audit after insert or update or delete on podio.webhooks
for each row execute function podio.tg_audit();

drop trigger if exists trg_audit on podio.item_shares;
create trigger trg_audit after insert or update or delete on podio.item_shares
for each row execute function podio.tg_audit();

drop trigger if exists trg_audit on podio.automations;
create trigger trg_audit after insert or update or delete on podio.automations
for each row execute function podio.tg_audit();

drop trigger if exists trg_audit on podio.app_templates;
create trigger trg_audit after insert or update or delete on podio.app_templates
for each row execute function podio.tg_audit();
