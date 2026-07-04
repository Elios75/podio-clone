-- Podio Clone: Migration 21 - Chat: conversation/message RPCs + realtime

create or replace function podio.start_conversation(p_subject text, p_participants uuid[])
returns podio.conversations
language plpgsql security definer set search_path = podio, public as $$
declare
  v_conv podio.conversations;
  u uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if array_length(p_participants, 1) is null then
    raise exception 'at least one participant required';
  end if;

  insert into podio.conversations (subject, is_group, created_by)
  values (nullif(trim(p_subject), ''), array_length(p_participants, 1) > 1, auth.uid())
  returning * into v_conv;

  insert into podio.conversation_participants (conversation_id, user_id, last_read_at)
  values (v_conv.id, auth.uid(), now())
  on conflict do nothing;

  foreach u in array p_participants loop
    insert into podio.conversation_participants (conversation_id, user_id)
    values (v_conv.id, u)
    on conflict do nothing;
  end loop;

  return v_conv;
end $$;
grant execute on function podio.start_conversation(text, uuid[]) to authenticated;

create or replace function podio.send_message(p_conversation uuid, p_body text)
returns podio.messages
language plpgsql security definer set search_path = podio, public as $$
declare
  v_msg podio.messages;
begin
  if not podio.is_conversation_participant(p_conversation) then
    raise exception 'not a participant';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'message body required';
  end if;

  insert into podio.messages (conversation_id, sender_id, body)
  values (p_conversation, auth.uid(), p_body)
  returning * into v_msg;

  update podio.conversations set updated_at = now() where id = p_conversation;
  update podio.conversation_participants
  set last_read_at = now()
  where conversation_id = p_conversation and user_id = auth.uid();

  insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
  select cp.user_id, 'message', 'message', v_msg.id, auth.uid(),
    jsonb_build_object('preview', left(p_body, 140), 'conversation_id', p_conversation)
  from podio.conversation_participants cp
  where cp.conversation_id = p_conversation and cp.user_id <> auth.uid();

  return v_msg;
end $$;
grant execute on function podio.send_message(uuid, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table podio.messages;
exception when others then null;
end $$;
