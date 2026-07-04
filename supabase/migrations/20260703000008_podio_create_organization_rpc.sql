-- Podio Clone: Migration 8 - Atomic org creation (org + owner membership in one call)
create or replace function podio.create_organization(p_name text, p_slug text)
returns podio.organizations
language plpgsql security definer set search_path = podio, public as $$
declare
  v_org podio.organizations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into podio.organizations (name, slug)
  values (p_name, p_slug)
  returning * into v_org;

  insert into podio.organization_members (organization_id, user_id, role)
  values (v_org.id, auth.uid(), 'owner');

  return v_org;
end $$;

grant execute on function podio.create_organization(text, text) to authenticated;
