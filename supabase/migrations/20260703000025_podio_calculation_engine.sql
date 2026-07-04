-- Podio Clone: Migration 25 - Calculation engine v1
-- Formulas reference same-item number-ish fields by {external_id}, e.g. "{deal-value-1} * 0.2".
-- Recomputed by trigger on every value write, so ALL paths (forms, board, API,
-- webforms, automations) stay consistent. Expression is whitelisted to digits
-- and arithmetic before evaluation - no injection surface.

create or replace function podio.compute_calculations(p_item uuid)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare
  v_app uuid;
  f record;
  tok record;
  expr text;
  v_num numeric;
begin
  select app_id into v_app from podio.items where id = p_item;
  if v_app is null then return; end if;

  for f in
    select * from podio.app_fields
    where app_id = v_app and status = 'active' and type = 'calculation'
      and coalesce(config->>'formula','') <> ''
  loop
    expr := f.config->>'formula';

    for tok in
      select af.external_id, coalesce(ifv.value_number, 0) as num
      from podio.app_fields af
      left join podio.item_field_values ifv
        on ifv.field_id = af.id and ifv.item_id = p_item
      where af.app_id = v_app and af.status = 'active' and af.id <> f.id
    loop
      expr := replace(expr, '{' || tok.external_id || '}', tok.num::text);
    end loop;

    if expr !~ '^[0-9+\-*/(). ]+$' then
      continue;
    end if;

    begin
      execute 'select (' || expr || ')::numeric' into v_num;
    exception when others then
      v_num := null;
    end;

    if v_num is not null then
      insert into podio.item_field_values
        (item_id, field_id, position, value, value_number)
      values (p_item, f.id, 0, to_jsonb(round(v_num, 4)), round(v_num, 4))
      on conflict (item_id, field_id, position) do update
        set value = excluded.value, value_number = excluded.value_number,
            updated_at = now();
    end if;
  end loop;
end $$;

create or replace function podio.tg_compute_calc() returns trigger
language plpgsql security definer set search_path = podio, public as $$
begin
  if exists (select 1 from podio.app_fields
             where id = new.field_id and type = 'calculation') then
    return new;
  end if;
  perform podio.compute_calculations(new.item_id);
  return new;
end $$;

drop trigger if exists trg_compute_calc on podio.item_field_values;
create trigger trg_compute_calc after insert on podio.item_field_values
for each row execute function podio.tg_compute_calc();
