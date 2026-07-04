-- Podio Clone: Migration 29 - Daily notification digest
-- Users who opt in (notification_prefs.email_digest = true) get one queued email
-- per day summarizing unread notifications. Delivery worker ships in Phase 11;
-- until then rows accumulate in outbound_emails.

create or replace function podio.send_daily_digests()
returns int
language plpgsql security definer set search_path = podio, public as $$
declare
  u record;
  v_lines text;
  v_cnt bigint;
  v_sent int := 0;
begin
  for u in
    select up.user_id, au.email
    from podio.user_profiles up
    join auth.users au on au.id = up.user_id
    where up.notification_prefs->>'email_digest' = 'true'
      and au.email is not null
  loop
    select count(*),
      string_agg(line, E'\n')
    into v_cnt, v_lines
    from (
      select '- ' ||
        case n.event_type
          when 'mentioned' then 'Mentioned on '
          when 'comment_added' then 'New comment on '
          when 'task_assigned' then 'Task assigned: '
          when 'task_completed' then 'Task completed: '
          when 'task_reminder' then 'Task due: '
          when 'message' then 'New message: '
          when 'item_shared' then 'Item shared with you: '
          else n.event_type || ': '
        end ||
        coalesce(n.payload->>'item_title', n.payload->>'task_title',
                 n.payload->>'preview', n.payload->>'message', '') as line
      from podio.notifications n
      where n.user_id = u.user_id
        and n.read_at is null
        and n.created_at > now() - interval '24 hours'
      order by n.created_at desc
      limit 10
    ) t;

    if coalesce(v_cnt, 0) > 0 then
      insert into podio.outbound_emails (to_address, subject, body_text)
      values (u.email,
        'Your daily digest — ' || v_cnt || ' update' || case when v_cnt = 1 then '' else 's' end,
        'Here''s what happened while you were away:' || E'\n\n' || v_lines
          || E'\n\nOpen your notifications to catch up.');
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end $$;

do $$
begin
  perform cron.schedule('podio_daily_digest', '0 13 * * *',
    'select podio.send_daily_digests()');
exception when others then null;
end $$;
