-- Podio Clone: Migration 86 - Reserved app slugs.
-- Workspace-level routes (/org/:org/:ws/<segment>) have static segments that
-- SHADOW the dynamic [appSlug] route in Next.js: an app whose slug is
-- "tasks" (etc.) becomes unreachable — its tab opens the built-in page.
-- Guard every app-creation path (builder, templates, importer) with one
-- BEFORE trigger that bumps reserved slugs to "<slug>-app", and repair any
-- existing rows that already collide.
create or replace function podio.tg_reserve_app_slugs() returns trigger
language plpgsql set search_path = podio, public as $$
declare
  reserved constant text[] := array[
    'tasks','files','settings','map','market','ai-builder',
    'new-app','new-app-from-csv','import','calendar','form','edit','automations'
  ];
  v_base text;
  v_slug text;
  v_i int := 1;
begin
  if new.slug = any(reserved) then
    v_base := new.slug || '-app';
    v_slug := v_base;
    while exists (select 1 from podio.apps
                  where workspace_id = new.workspace_id and slug = v_slug
                    and id is distinct from new.id) loop
      v_slug := v_base || '-' || v_i;
      v_i := v_i + 1;
    end loop;
    new.slug := v_slug;
  end if;
  return new;
end $$;

drop trigger if exists trg_reserve_app_slugs on podio.apps;
create trigger trg_reserve_app_slugs
before insert or update of slug on podio.apps
for each row execute function podio.tg_reserve_app_slugs();

-- Repair existing collisions (the UPDATE routes back through the trigger).
update podio.apps set slug = slug
where slug = any(array[
  'tasks','files','settings','map','market','ai-builder',
  'new-app','new-app-from-csv','import','calendar','form','edit','automations'
]);
