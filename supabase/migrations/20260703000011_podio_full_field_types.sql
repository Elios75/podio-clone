-- Podio Clone: Migration 11 - Full field-type support:
-- save_item v2 (money, file/image, relationship edges) + storage bucket for uploads

-- Storage bucket (public for dev; lock down with signed URLs before production)
insert into storage.buckets (id, name, public)
values ('podio-files', 'podio-files', true)
on conflict (id) do nothing;

create policy "podio_files_select" on storage.objects
  for select to authenticated using (bucket_id = 'podio-files');
create policy "podio_files_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'podio-files');
create policy "podio_files_update" on storage.objects
  for update to authenticated using (bucket_id = 'podio-files');
create policy "podio_files_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'podio-files');

-- save_item v2
create or replace function podio.save_item(p_app uuid, p_item uuid, p_values jsonb)
returns podio.items
language plpgsql security definer set search_path = podio, public as $$
declare
  v_item podio.items;
  v_field record;
  v_val jsonb;
  v_text text;
  v_num numeric;
  v_ref_item uuid;
  v_title text;
  v_rev int;
begin
  if not podio.is_workspace_member(podio.app_workspace(p_app)) then
    raise exception 'not a workspace member';
  end if;

  if p_item is null then
    insert into podio.items (app_id, created_by, updated_by)
    values (p_app, auth.uid(), auth.uid())
    returning * into v_item;
  else
    select * into v_item from podio.items where id = p_item and app_id = p_app;
    if v_item.id is null then
      raise exception 'item not found';
    end if;
    update podio.items set updated_by = auth.uid() where id = v_item.id;
  end if;

  delete from podio.item_field_values where item_id = v_item.id;
  delete from podio.item_relationships where from_item_id = v_item.id;

  for v_field in
    select * from podio.app_fields
    where app_id = p_app and status = 'active'
      and type not in ('separator','calculation')
      and p_values ? id::text
  loop
    v_val := p_values -> v_field.id::text;
    if v_val is null or v_val = 'null'::jsonb or v_val = '""'::jsonb then
      continue;
    end if;

    v_text := case
      when v_field.type in ('file','image') then v_val->>'name'
      when jsonb_typeof(v_val) = 'string' then v_val #>> '{}'
      else null
    end;
    v_num := case
      when v_field.type = 'money' then nullif(v_val->>'amount','')::numeric
      when jsonb_typeof(v_val) = 'number' then (v_val #>> '{}')::numeric
      else null
    end;
    v_ref_item := case
      when v_field.type = 'relationship' then nullif(v_val #>> '{}','')::uuid
      else null
    end;

    insert into podio.item_field_values (
      item_id, field_id, value, value_text, value_number,
      value_date, value_date_end, ref_item_id, ref_user_id
    ) values (
      v_item.id, v_field.id, v_val, v_text, v_num,
      case when v_field.type = 'date' then nullif(v_val->>'start','')::timestamptz end,
      case when v_field.type = 'date' then nullif(v_val->>'end','')::timestamptz end,
      v_ref_item,
      case when v_field.type = 'contact' then nullif(v_val #>> '{}','')::uuid end
    );

    if v_field.type = 'relationship' and v_ref_item is not null then
      insert into podio.item_relationships (field_id, from_item_id, to_item_id, created_by)
      values (v_field.id, v_item.id, v_ref_item, auth.uid())
      on conflict do nothing;
    end if;

    if v_field.is_primary then
      v_title := v_text;
    end if;
  end loop;

  if v_title is not null then
    update podio.items set title = v_title where id = v_item.id returning * into v_item;
  else
    select * into v_item from podio.items where id = v_item.id;
  end if;

  select coalesce(max(revision), 0) + 1 into v_rev
  from podio.item_revisions where item_id = v_item.id;
  insert into podio.item_revisions (item_id, revision, user_id, changes)
  values (v_item.id, v_rev, auth.uid(), p_values);

  return v_item;
end $$;
