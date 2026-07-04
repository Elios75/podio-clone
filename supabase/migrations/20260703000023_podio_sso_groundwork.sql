-- Podio Clone: Migration 23 - SSO/SAML groundwork
-- Convention: organizations.security_settings = { "sso_domain": "acme.com", "enforce_sso": false }

-- Pre-auth lookup for the login page: does this email's domain route to SSO?
create or replace function podio.sso_domain_lookup(p_email text)
returns jsonb
language sql stable security definer set search_path = podio, public as $$
  select coalesce(
    (select jsonb_build_object(
       'sso', true,
       'domain', lower(split_part(p_email, '@', 2)),
       'enforce', coalesce((o.security_settings->>'enforce_sso')::boolean, false))
     from podio.organizations o
     where lower(o.security_settings->>'sso_domain') = lower(split_part(p_email, '@', 2))
     limit 1),
    jsonb_build_object('sso', false, 'enforce', false));
$$;
grant execute on function podio.sso_domain_lookup(text) to anon, authenticated;

-- Post-login auto-provisioning: join orgs whose sso_domain matches the user's
-- email domain, and claim pending single-item shares addressed to that email.
create or replace function podio.claim_sso_membership()
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_email text;
  v_domain text;
  v_orgs int := 0;
  v_shares int := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('claimed_orgs', 0, 'claimed_shares', 0);
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return jsonb_build_object('claimed_orgs', 0, 'claimed_shares', 0);
  end if;
  v_domain := split_part(v_email, '@', 2);

  with ins as (
    insert into podio.organization_members (organization_id, user_id, role)
    select o.id, auth.uid(), 'employee'
    from podio.organizations o
    where lower(o.security_settings->>'sso_domain') = v_domain
      and not exists (select 1 from podio.organization_members m
        where m.organization_id = o.id and m.user_id = auth.uid())
    returning 1
  ) select count(*) into v_orgs from ins;

  with upd as (
    update podio.item_shares
    set user_id = auth.uid()
    where user_id is null and lower(email) = v_email and revoked_at is null
    returning 1
  ) select count(*) into v_shares from upd;

  return jsonb_build_object('claimed_orgs', v_orgs, 'claimed_shares', v_shares);
end $$;
grant execute on function podio.claim_sso_membership() to authenticated;
