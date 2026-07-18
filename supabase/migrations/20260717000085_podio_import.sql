-- Podio Clone: Migration 85 - Podio workspace importer backend
-- Idempotent import dispatcher (podio.import_api) + bookkeeping tables.
-- The runner (scripts/podio/import-space.mjs) authenticates with an api_keys
-- key hash, exactly like podio.api_request, and drives the import through
-- small idempotent actions. Every Podio object is mapped once in
-- podio.import_map so re-running a crashed import fast-forwards.

-- ---------------------------------------------------------------------------
-- import_map: Podio id -> local uuid, per organization. Definer-only.
-- ---------------------------------------------------------------------------
create table if not exists podio.import_map (
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  podio_type text not null,
  podio_id bigint not null,
  local_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, podio_type, podio_id)
);
alter table podio.import_map enable row level security;
revoke all on podio.import_map from anon, authenticated;

-- ---------------------------------------------------------------------------
-- import_runs: one row per import attempt. Org members can watch progress.
-- ---------------------------------------------------------------------------
create table if not exists podio.import_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  source_space_id bigint,
  source_space_name text,
  workspace_id uuid references podio.workspaces(id) on delete set null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  phase text not null default 'init',
  counts jsonb not null default '{}'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_import_runs_org on podio.import_runs (organization_id, started_at desc);
alter table podio.import_runs enable row level security;
revoke all on podio.import_runs from anon, authenticated;
grant select on podio.import_runs to authenticated;
drop policy if exists import_runs_select on podio.import_runs;
create policy import_runs_select on podio.import_runs
  for select to authenticated
  using (podio.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- import_api: key-authenticated, idempotent import dispatcher
-- ---------------------------------------------------------------------------
create or replace function podio.import_api(p_key_hash text, p_action text, p_params jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_key podio.api_keys;
  v_org uuid;
  v_run podio.import_runs;
  v_ws podio.workspaces;
  v_ws_id uuid;
  v_app podio.apps;
  v_app_id uuid;
  v_item_id uuid;
  v_field podio.app_fields;
  v_field_id uuid;
  v_file_id uuid;
  v_comment_id uuid;
  v_task_id uuid;
  v_space_id bigint;
  v_podio_app_id bigint;
  v_podio_item_id bigint;
  v_name text;
  v_base text;
  v_slug text;
  v_i int;
  v_f jsonb;
  v_ref jsonb;
  v_pid text;
  v_type podio.field_type;
  v_field_ids jsonb := '{}'::jsonb;
  v_field_external jsonb := '{}'::jsonb;
  v_values jsonb;
  v_target uuid;
  v_first uuid;
  v_linked int := 0;
  v_skipped int := 0;
  v_count int := 0;
  v_body text;
begin
  -- Key validation (inline replica of the api_request pattern)
  select * into v_key from podio.api_keys
  where key_hash = p_key_hash and revoked_at is null;
  if v_key.id is null then
    raise exception 'invalid api key';
  end if;
  perform podio.check_rate_limit(v_key);
  update podio.api_keys set last_used_at = now() where id = v_key.id;
  v_org := v_key.organization_id;

  -- Every import action writes: require the write scope for all of them.
  if not ('write' = any(v_key.scopes)) then
    raise exception 'api key lacks write scope';
  end if;
  -- Everything imported is attributed to the key's owning user.
  if v_key.created_by is null then
    raise exception 'api key has no owning user; cannot import';
  end if;

  -- -------------------------------------------------------------------------
  if p_action = 'run.start' then
    v_space_id := (p_params->>'space_id')::bigint;
    v_name := coalesce(nullif(p_params->>'space_name',''), 'Podio space ' || v_space_id);
    if v_space_id is null then raise exception 'space_id required'; end if;

    select local_id into v_ws_id from podio.import_map
    where organization_id = v_org and podio_type = 'space' and podio_id = v_space_id;

    if v_ws_id is null then
      -- Fresh target workspace (mirrors create_workspace: workspace + admin member)
      v_base := trim(both '-' from lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')));
      if v_base = '' then v_base := 'podio-import'; end if;
      v_slug := v_base; v_i := 1;
      while exists (select 1 from podio.workspaces
                    where organization_id = v_org and slug = v_slug) loop
        v_slug := v_base || '-' || v_i;
        v_i := v_i + 1;
      end loop;

      insert into podio.workspaces (organization_id, name, slug, privacy, created_by)
      values (v_org, v_name || ' (Podio import)', v_slug, 'private', v_key.created_by)
      returning * into v_ws;
      v_ws_id := v_ws.id;

      insert into podio.workspace_members (workspace_id, user_id, role)
      values (v_ws_id, v_key.created_by, 'admin')
      on conflict do nothing;

      insert into podio.import_map (organization_id, podio_type, podio_id, local_id)
      values (v_org, 'space', v_space_id, v_ws_id);
    end if;

    insert into podio.import_runs (organization_id, source_space_id, source_space_name, workspace_id)
    values (v_org, v_space_id, nullif(p_params->>'space_name',''), v_ws_id)
    returning * into v_run;

    return jsonb_build_object('run_id', v_run.id, 'workspace_id', v_ws_id,
                              'user_id', v_key.created_by);
  end if;

  -- members.match needs no run: used to build the runner's memberMap.
  if p_action = 'members.match' then
    -- Definer can read auth.users; the anon runner cannot. Case-insensitive.
    return coalesce((
      select jsonb_object_agg(e.email, u.id)
      from jsonb_array_elements_text(coalesce(p_params->'emails', '[]'::jsonb)) as e(email)
      left join auth.users u on lower(u.email) = lower(e.email)
    ), '{}'::jsonb);
  end if;

  -- Every other action operates on an existing run of this org.
  select * into v_run from podio.import_runs
  where id = (p_params->>'run_id')::uuid and organization_id = v_org;
  if v_run.id is null then raise exception 'run not found'; end if;

  -- -------------------------------------------------------------------------
  if p_action = 'run.progress' then
    update podio.import_runs
    set phase = coalesce(nullif(p_params->>'phase',''), phase),
        counts = counts || coalesce(p_params->'counts', '{}'::jsonb),
        notes = notes || coalesce(p_params->'notes_append', '[]'::jsonb),
        updated_at = now()
    where id = v_run.id;
    return jsonb_build_object('ok', true);

  -- -------------------------------------------------------------------------
  elsif p_action = 'run.finish' then
    if coalesce(p_params->>'status','') not in ('completed','failed') then
      raise exception 'status must be completed or failed';
    end if;
    update podio.import_runs
    set status = p_params->>'status',
        error = nullif(p_params->>'error',''),
        updated_at = now()
    where id = v_run.id;
    return jsonb_build_object('ok', true);

  -- -------------------------------------------------------------------------
  elsif p_action = 'app.upsert' then
    v_podio_app_id := (p_params->>'podio_app_id')::bigint;
    if v_podio_app_id is null then raise exception 'podio_app_id required'; end if;

    select local_id into v_app_id from podio.import_map
    where organization_id = v_org and podio_type = 'app' and podio_id = v_podio_app_id;

    if v_app_id is not null then
      update podio.apps
      set name = coalesce(p_params->'app'->>'name', name),
          icon = p_params->'app'->>'icon',
          item_name = coalesce(nullif(p_params->'app'->>'item_name',''), item_name),
          description = p_params->'app'->>'description'
      where id = v_app_id;
    else
      v_base := trim(both '-' from lower(regexp_replace(
        coalesce(nullif(p_params->'app'->>'slug',''), p_params->'app'->>'name', 'app'),
        '[^a-zA-Z0-9]+', '-', 'g')));
      if v_base = '' then v_base := 'app'; end if;
      v_slug := v_base; v_i := 1;
      while exists (select 1 from podio.apps
                    where workspace_id = v_run.workspace_id and slug = v_slug) loop
        v_slug := v_base || '-' || v_i;
        v_i := v_i + 1;
      end loop;

      insert into podio.apps (workspace_id, name, slug, icon, item_name, description, created_by)
      values (v_run.workspace_id,
              coalesce(p_params->'app'->>'name', 'Imported app'),
              v_slug,
              p_params->'app'->>'icon',
              coalesce(nullif(p_params->'app'->>'item_name',''), 'Item'),
              p_params->'app'->>'description',
              v_key.created_by)
      returning id into v_app_id;

      insert into podio.import_map (organization_id, podio_type, podio_id, local_id)
      values (v_org, 'app', v_podio_app_id, v_app_id);
    end if;

    for v_f in select * from jsonb_array_elements(coalesce(p_params->'fields', '[]'::jsonb)) loop
      -- Unknown types degrade to text rather than aborting the whole app.
      if (v_f->>'type') = any (enum_range(null::podio.field_type)::text[]) then
        v_type := (v_f->>'type')::podio.field_type;
      else
        v_type := 'text';
      end if;

      select local_id into v_field_id from podio.import_map
      where organization_id = v_org and podio_type = 'field'
        and podio_id = (v_f->>'podio_field_id')::bigint;

      if v_field_id is null then
        -- No map entry: reuse an existing row with the same external_id if
        -- present (safe re-run), otherwise insert.
        select id into v_field_id from podio.app_fields
        where app_id = v_app_id and external_id = v_f->>'external_id';
        if v_field_id is null then
          insert into podio.app_fields
            (app_id, external_id, label, type, is_required, is_primary, position, config)
          values
            (v_app_id, v_f->>'external_id', coalesce(v_f->>'label',''), v_type,
             coalesce((v_f->>'is_required')::boolean, false),
             coalesce((v_f->>'is_primary')::boolean, false),
             coalesce((v_f->>'position')::int, 0),
             coalesce(v_f->'config', '{}'::jsonb))
          returning id into v_field_id;
        end if;
        insert into podio.import_map (organization_id, podio_type, podio_id, local_id)
        values (v_org, 'field', (v_f->>'podio_field_id')::bigint, v_field_id)
        on conflict do nothing;
      end if;

      update podio.app_fields
      set label = coalesce(v_f->>'label', label),
          config = coalesce(v_f->'config', config),
          position = coalesce((v_f->>'position')::int, position),
          is_required = coalesce((v_f->>'is_required')::boolean, is_required),
          is_primary = coalesce((v_f->>'is_primary')::boolean, is_primary),
          status = 'active'
      where id = v_field_id;

      v_field_ids := v_field_ids || jsonb_build_object(v_f->>'podio_field_id', v_field_id);
      v_field_external := v_field_external
        || jsonb_build_object(v_f->>'podio_field_id',
             (select external_id from podio.app_fields where id = v_field_id));
    end loop;

    return jsonb_build_object('app_id', v_app_id,
                              'field_ids', v_field_ids,
                              'field_external', v_field_external);

  -- -------------------------------------------------------------------------
  elsif p_action = 'app.link_references' then
    v_podio_app_id := (p_params->>'podio_app_id')::bigint;
    select local_id into v_app_id from podio.import_map
    where organization_id = v_org and podio_type = 'app' and podio_id = v_podio_app_id;
    if v_app_id is null then raise exception 'app not found in import map'; end if;

    for v_field in
      select * from podio.app_fields
      where app_id = v_app_id and type = 'relationship'
        and config ? 'podio_referenced_apps'
        and jsonb_array_length(config->'podio_referenced_apps') > 0
    loop
      select local_id into v_target from podio.import_map
      where organization_id = v_org and podio_type = 'app'
        and podio_id = (v_field.config->'podio_referenced_apps'->>0)::bigint;
      if v_target is not null then
        update podio.app_fields
        set config = config || jsonb_build_object('related_app_id', v_target)
        where id = v_field.id;
        v_count := v_count + 1;
      end if;
    end loop;
    return jsonb_build_object('updated', v_count);

  -- -------------------------------------------------------------------------
  elsif p_action = 'item.upsert' then
    v_podio_app_id := (p_params->>'podio_app_id')::bigint;
    v_podio_item_id := (p_params->>'podio_item_id')::bigint;
    select local_id into v_app_id from podio.import_map
    where organization_id = v_org and podio_type = 'app' and podio_id = v_podio_app_id;
    if v_app_id is null then raise exception 'app not found in import map'; end if;

    select local_id into v_item_id from podio.import_map
    where organization_id = v_org and podio_type = 'item' and podio_id = v_podio_item_id;

    if v_item_id is null then
      -- item_number comes from the assign_item_number trigger (per-app sequence)
      insert into podio.items (app_id, title, created_by, created_at)
      values (v_app_id, nullif(p_params->>'title',''), v_key.created_by,
              coalesce(nullif(p_params->>'created_on','')::timestamptz, now()))
      returning id into v_item_id;
      insert into podio.import_map (organization_id, podio_type, podio_id, local_id)
      values (v_org, 'item', v_podio_item_id, v_item_id);
    else
      update podio.items set title = nullif(p_params->>'title',''), updated_by = v_key.created_by
      where id = v_item_id;
    end if;

    -- external_id-keyed values -> field-id-keyed map, then the shared writer
    select coalesce(jsonb_object_agg(af.id::text, p_params->'values'->af.external_id), '{}'::jsonb)
      into v_values
    from podio.app_fields af
    where af.app_id = v_app_id and af.status = 'active'
      and p_params->'values' ? af.external_id;
    perform podio.write_values(v_app_id, v_item_id, v_values, v_key.created_by);
    perform podio.compute_calculations(v_item_id);

    return jsonb_build_object('item_id', v_item_id);

  -- -------------------------------------------------------------------------
  elsif p_action = 'item.link_refs' then
    v_podio_item_id := (p_params->>'podio_item_id')::bigint;
    select local_id into v_item_id from podio.import_map
    where organization_id = v_org and podio_type = 'item' and podio_id = v_podio_item_id;
    if v_item_id is null then raise exception 'item not found in import map'; end if;
    select app_id into v_app_id from podio.items where id = v_item_id;

    for v_ref in select * from jsonb_array_elements(coalesce(p_params->'refs', '[]'::jsonb)) loop
      select * into v_field from podio.app_fields
      where app_id = v_app_id and external_id = v_ref->>'external_id'
        and type = 'relationship' and status = 'active';
      if v_field.id is null then
        v_skipped := v_skipped + coalesce(jsonb_array_length(v_ref->'podio_item_ids'), 0);
        continue;
      end if;

      v_first := null;
      for v_pid in select * from jsonb_array_elements_text(coalesce(v_ref->'podio_item_ids', '[]'::jsonb)) loop
        select local_id into v_target from podio.import_map
        where organization_id = v_org and podio_type = 'item' and podio_id = v_pid::bigint;
        if v_target is null then
          v_skipped := v_skipped + 1;
          continue;
        end if;
        if v_first is null then
          v_first := v_target;
          -- One-key map through the shared writer: value = item uuid string,
          -- which sets ref_item_id and item_relationships.
          perform podio.write_values(v_app_id, v_item_id,
            jsonb_build_object(v_field.id::text, to_jsonb(v_target::text)),
            v_key.created_by);
        else
          -- Multi-value relationships: extra rows next to the writer's first
          insert into podio.item_field_values (item_id, field_id, value, ref_item_id)
          values (v_item_id, v_field.id, to_jsonb(v_target::text), v_target);
          insert into podio.item_relationships (field_id, from_item_id, to_item_id, created_by)
          values (v_field.id, v_item_id, v_target, v_key.created_by)
          on conflict do nothing;
        end if;
        v_linked := v_linked + 1;
      end loop;
    end loop;

    perform podio.compute_calculations(v_item_id);
    return jsonb_build_object('linked', v_linked, 'skipped', v_skipped);

  -- -------------------------------------------------------------------------
  elsif p_action = 'item.add_file' then
    v_podio_item_id := (p_params->>'podio_item_id')::bigint;
    select local_id into v_item_id from podio.import_map
    where organization_id = v_org and podio_type = 'item' and podio_id = v_podio_item_id;
    if v_item_id is null then raise exception 'item not found in import map'; end if;

    select local_id into v_file_id from podio.import_map
    where organization_id = v_org and podio_type = 'file'
      and podio_id = (p_params->>'podio_file_id')::bigint;

    if v_file_id is null then
      -- External-link import: no storage upload, the file stays on Podio's CDN
      insert into podio.files
        (organization_id, workspace_id, external_url, provider, name, mime_type, uploaded_by)
      values
        (v_org, v_run.workspace_id, p_params->>'link', 'podio',
         coalesce(nullif(p_params->>'name',''), 'podio-file'),
         nullif(p_params->>'mimetype',''), v_key.created_by)
      returning id into v_file_id;
      insert into podio.import_map (organization_id, podio_type, podio_id, local_id)
      values (v_org, 'file', (p_params->>'podio_file_id')::bigint, v_file_id);
    end if;

    insert into podio.file_attachments (file_id, target_type, target_id, attached_by)
    values (v_file_id, 'item', v_item_id, v_key.created_by)
    on conflict do nothing;

    return jsonb_build_object('file_id', v_file_id);

  -- -------------------------------------------------------------------------
  elsif p_action = 'comment.upsert' then
    v_podio_item_id := (p_params->>'podio_item_id')::bigint;
    select local_id into v_item_id from podio.import_map
    where organization_id = v_org and podio_type = 'item' and podio_id = v_podio_item_id;
    if v_item_id is null then raise exception 'item not found in import map'; end if;

    select local_id into v_comment_id from podio.import_map
    where organization_id = v_org and podio_type = 'comment'
      and podio_id = (p_params->>'podio_comment_id')::bigint;
    if v_comment_id is not null then
      return jsonb_build_object('comment_id', v_comment_id);
    end if;

    -- created_by must be a real local user, so the key's user posts it; the
    -- runner passes author_note ('[imported: <name>] ') when the original
    -- Podio author is someone else.
    v_body := coalesce(p_params->>'author_note', '') || coalesce(p_params->>'body', '');
    insert into podio.comments (workspace_id, target_type, target_id, created_by, body, created_at)
    values (v_run.workspace_id, 'item', v_item_id, v_key.created_by, v_body,
            coalesce(nullif(p_params->>'created_at','')::timestamptz, now()))
    returning id into v_comment_id;

    insert into podio.import_map (organization_id, podio_type, podio_id, local_id)
    values (v_org, 'comment', (p_params->>'podio_comment_id')::bigint, v_comment_id);

    return jsonb_build_object('comment_id', v_comment_id);

  -- -------------------------------------------------------------------------
  elsif p_action = 'task.upsert' then
    select local_id into v_task_id from podio.import_map
    where organization_id = v_org and podio_type = 'task'
      and podio_id = (p_params->>'podio_task_id')::bigint;
    if v_task_id is not null then
      return jsonb_build_object('task_id', v_task_id);
    end if;

    insert into podio.tasks
      (organization_id, workspace_id, title, description, assignee_id, created_by,
       due_at, status, completed_at, completed_by)
    values
      (v_org, v_run.workspace_id,
       coalesce(nullif(p_params->>'title',''), 'Imported task'),
       nullif(p_params->>'description',''),
       v_key.created_by, v_key.created_by,
       nullif(p_params->>'due_at','')::timestamptz,
       case when nullif(p_params->>'completed_at','') is not null then 'completed'::podio.task_status
            else 'open'::podio.task_status end,
       nullif(p_params->>'completed_at','')::timestamptz,
       case when nullif(p_params->>'completed_at','') is not null then v_key.created_by end)
    returning id into v_task_id;

    insert into podio.import_map (organization_id, podio_type, podio_id, local_id)
    values (v_org, 'task', (p_params->>'podio_task_id')::bigint, v_task_id);

    return jsonb_build_object('task_id', v_task_id);

  else
    raise exception 'unknown action: %', p_action;
  end if;
end $$;

grant execute on function podio.import_api(text, text, jsonb) to anon, authenticated;
