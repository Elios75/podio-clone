-- Podio Clone: Migration 9 - Atomic workspace creation (workspace + admin membership)
create or replace function podio.create_workspace(
  p_org uuid,
  p_name text,
  p_slug text,
  p_privacy podio.workspace_privacy default 'private'
)
returns podio.workspaces
language plpgsql security definer set search_path = podio, public as $$
declare
  v_ws podio.workspaces;
begin
  if not podio.is_org_member(p_org) then
    raise exception 'not an organization member';
  end if;
  insert into podio.workspaces (organization_id, name, slug, privacy, created_by)
  values (p_org, p_name, p_slug, p_privacy, auth.uid())
  returning * into v_ws;

  insert into podio.workspace_members (workspace_id, user_id, role)
  values (v_ws.id, auth.uid(), 'admin');

  return v_ws;
end $$;

grant execute on function podio.create_workspace(uuid, text, text, podio.workspace_privacy) to authenticated;
