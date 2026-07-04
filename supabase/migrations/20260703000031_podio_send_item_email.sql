-- Podio Clone: Migration 31 - Send email from an item (queued through outbound_emails)
create or replace function podio.send_item_email(
  p_item uuid, p_to text, p_subject text, p_body text
)
returns uuid
language plpgsql security definer set search_path = podio, public as $$
declare
  v_ws uuid;
  v_org uuid;
  v_id uuid;
  v_title text;
begin
  v_ws := podio.item_workspace(p_item);
  if not podio.can_edit_items(v_ws) then
    raise exception 'insufficient role to send email';
  end if;
  if p_to !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid recipient address';
  end if;
  v_org := podio.workspace_org(v_ws);
  select title into v_title from podio.items where id = p_item;

  insert into podio.outbound_emails (organization_id, to_address, subject, body_text, item_id)
  values (v_org, p_to, p_subject, p_body, p_item)
  returning id into v_id;

  insert into podio.activity_events
    (organization_id, workspace_id, item_id, actor_id, event_type, target_type, target_id, payload)
  values (v_org, v_ws, p_item, auth.uid(), 'email_sent', 'item', p_item,
    jsonb_build_object('to', p_to, 'subject', p_subject, 'item_title', v_title));

  return v_id;
end $$;
grant execute on function podio.send_item_email(uuid, text, text, text) to authenticated;
