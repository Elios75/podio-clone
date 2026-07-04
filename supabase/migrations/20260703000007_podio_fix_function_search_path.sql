-- Podio Clone: Migration 7 - Pin search_path on trigger functions (security advisor fix)
create or replace function podio.set_updated_at() returns trigger
language plpgsql set search_path = podio, public as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function podio.assign_item_number() returns trigger
language plpgsql set search_path = podio, public as $$
begin
  update podio.apps set next_item_number = next_item_number + 1
  where id = new.app_id
  returning next_item_number - 1 into new.item_number;
  return new;
end $$;
