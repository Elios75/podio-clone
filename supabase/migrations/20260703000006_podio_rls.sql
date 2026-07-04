-- Podio Clone: Migration 6 - Row Level Security: helper functions, policies, grants
-- Baseline model: org members see org data; workspace members see/edit workspace data;
-- guests reach single items via item_shares. Refine role granularity (light/external/guest)
-- in a later migration once the permission matrix UI exists.

-- ============ Helper functions (security definer avoids RLS recursion) ============

create or replace function podio.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = podio, public as $$
  select exists (select 1 from podio.organization_members
    where organization_id = p_org and user_id = auth.uid());
$$;

create or replace function podio.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = podio, public as $$
  select exists (select 1 from podio.organization_members
    where organization_id = p_org and user_id = auth.uid() and role in ('owner','admin'));
$$;

create or replace function podio.org_member_count(p_org uuid) returns bigint
language sql stable security definer set search_path = podio, public as $$
  select count(*) from podio.organization_members where organization_id = p_org;
$$;

create or replace function podio.workspace_org(p_ws uuid) returns uuid
language sql stable security definer set search_path = podio, public as $$
  select organization_id from podio.workspaces where id = p_ws;
$$;

create or replace function podio.is_workspace_member(p_ws uuid) returns boolean
language sql stable security definer set search_path = podio, public as $$
  select exists (select 1 from podio.workspace_members
      where workspace_id = p_ws and user_id = auth.uid())
    or exists (select 1 from podio.workspaces w
      join podio.organization_members om on om.organization_id = w.organization_id
      where w.id = p_ws and w.privacy = 'open' and om.user_id = auth.uid());
$$;

create or replace function podio.is_workspace_admin(p_ws uuid) returns boolean
language sql stable security definer set search_path = podio, public as $$
  select exists (select 1 from podio.workspace_members
      where workspace_id = p_ws and user_id = auth.uid() and role = 'admin')
    or podio.is_org_admin(podio.workspace_org(p_ws));
$$;

create or replace function podio.app_workspace(p_app uuid) returns uuid
language sql stable security definer set search_path = podio, public as $$
  select workspace_id from podio.apps where id = p_app;
$$;

create or replace function podio.item_workspace(p_item uuid) returns uuid
language sql stable security definer set search_path = podio, public as $$
  select a.workspace_id from podio.items i join podio.apps a on a.id = i.app_id
  where i.id = p_item;
$$;

create or replace function podio.can_access_item(p_item uuid) returns boolean
language sql stable security definer set search_path = podio, public as $$
  select podio.is_workspace_member(podio.item_workspace(p_item))
    or exists (select 1 from podio.item_shares s
      where s.item_id = p_item and s.user_id = auth.uid() and s.revoked_at is null);
$$;

create or replace function podio.can_edit_item(p_item uuid) returns boolean
language sql stable security definer set search_path = podio, public as $$
  select podio.is_workspace_member(podio.item_workspace(p_item))
    or exists (select 1 from podio.item_shares s
      where s.item_id = p_item and s.user_id = auth.uid()
        and s.revoked_at is null and s.access = 'edit');
$$;

create or replace function podio.is_conversation_participant(p_conv uuid) returns boolean
language sql stable security definer set search_path = podio, public as $$
  select exists (select 1 from podio.conversation_participants
    where conversation_id = p_conv and user_id = auth.uid());
$$;

-- ============ Enable RLS on every table ============

alter table podio.user_profiles enable row level security;
alter table podio.organizations enable row level security;
alter table podio.organization_members enable row level security;
alter table podio.workspaces enable row level security;
alter table podio.workspace_members enable row level security;
alter table podio.apps enable row level security;
alter table podio.app_fields enable row level security;
alter table podio.app_schema_revisions enable row level security;
alter table podio.app_views enable row level security;
alter table podio.items enable row level security;
alter table podio.item_field_values enable row level security;
alter table podio.item_relationships enable row level security;
alter table podio.item_revisions enable row level security;
alter table podio.item_followers enable row level security;
alter table podio.item_shares enable row level security;
alter table podio.tags enable row level security;
alter table podio.item_tags enable row level security;
alter table podio.comments enable row level security;
alter table podio.comment_reactions enable row level security;
alter table podio.mentions enable row level security;
alter table podio.status_posts enable row level security;
alter table podio.activity_events enable row level security;
alter table podio.follows enable row level security;
alter table podio.notifications enable row level security;
alter table podio.conversations enable row level security;
alter table podio.conversation_participants enable row level security;
alter table podio.messages enable row level security;
alter table podio.tasks enable row level security;
alter table podio.task_labels enable row level security;
alter table podio.task_label_links enable row level security;
alter table podio.files enable row level security;
alter table podio.file_attachments enable row level security;
alter table podio.webforms enable row level security;
alter table podio.webform_submissions enable row level security;
alter table podio.app_email_addresses enable row level security;
alter table podio.inbound_emails enable row level security;
alter table podio.email_templates enable row level security;
alter table podio.automations enable row level security;
alter table podio.automation_revisions enable row level security;
alter table podio.automation_runs enable row level security;
alter table podio.api_keys enable row level security;
alter table podio.webhooks enable row level security;
alter table podio.webhook_deliveries enable row level security;
alter table podio.app_templates enable row level security;
alter table podio.template_installs enable row level security;
alter table podio.template_reviews enable row level security;
alter table podio.import_jobs enable row level security;
alter table podio.export_jobs enable row level security;
alter table podio.audit_logs enable row level security;

-- ============ Policies ============

create policy p_profiles_select on podio.user_profiles for select to authenticated using (true);
create policy p_profiles_write on podio.user_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy p_orgs_select on podio.organizations for select to authenticated
  using (podio.is_org_member(id));
create policy p_orgs_insert on podio.organizations for insert to authenticated with check (true);
create policy p_orgs_update on podio.organizations for update to authenticated
  using (podio.is_org_admin(id));
create policy p_orgs_delete on podio.organizations for delete to authenticated
  using (podio.is_org_admin(id));

create policy p_org_members_select on podio.organization_members for select to authenticated
  using (podio.is_org_member(organization_id));
create policy p_org_members_insert on podio.organization_members for insert to authenticated
  with check (podio.is_org_admin(organization_id)
    or (user_id = auth.uid() and podio.org_member_count(organization_id) = 0));
create policy p_org_members_update on podio.organization_members for update to authenticated
  using (podio.is_org_admin(organization_id));
create policy p_org_members_delete on podio.organization_members for delete to authenticated
  using (podio.is_org_admin(organization_id) or user_id = auth.uid());

create policy p_workspaces_select on podio.workspaces for select to authenticated
  using (podio.is_workspace_member(id) or podio.is_org_admin(organization_id));
create policy p_workspaces_insert on podio.workspaces for insert to authenticated
  with check (podio.is_org_member(organization_id));
create policy p_workspaces_update on podio.workspaces for update to authenticated
  using (podio.is_workspace_admin(id));
create policy p_workspaces_delete on podio.workspaces for delete to authenticated
  using (podio.is_workspace_admin(id));

create policy p_ws_members_select on podio.workspace_members for select to authenticated
  using (podio.is_workspace_member(workspace_id));
create policy p_ws_members_insert on podio.workspace_members for insert to authenticated
  with check (podio.is_workspace_admin(workspace_id)
    or (user_id = auth.uid() and exists (select 1 from podio.workspaces w
        where w.id = workspace_id and w.privacy = 'open'
          and podio.is_org_member(w.organization_id))));
create policy p_ws_members_update on podio.workspace_members for update to authenticated
  using (podio.is_workspace_admin(workspace_id));
create policy p_ws_members_delete on podio.workspace_members for delete to authenticated
  using (podio.is_workspace_admin(workspace_id) or user_id = auth.uid());

create policy p_apps_select on podio.apps for select to authenticated
  using (podio.is_workspace_member(workspace_id));
create policy p_apps_write on podio.apps for all to authenticated
  using (podio.is_workspace_member(workspace_id))
  with check (podio.is_workspace_member(workspace_id));
create policy p_app_fields_all on podio.app_fields for all to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id)))
  with check (podio.is_workspace_member(podio.app_workspace(app_id)));
create policy p_app_schema_rev_all on podio.app_schema_revisions for all to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id)))
  with check (podio.is_workspace_member(podio.app_workspace(app_id)));
create policy p_app_views_select on podio.app_views for select to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id))
    and (visibility = 'team' or owner_id = auth.uid()));
create policy p_app_views_write on podio.app_views for all to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id)))
  with check (podio.is_workspace_member(podio.app_workspace(app_id)));

create policy p_items_select on podio.items for select to authenticated
  using (podio.can_access_item(id));
create policy p_items_insert on podio.items for insert to authenticated
  with check (podio.is_workspace_member(podio.app_workspace(app_id)));
create policy p_items_update on podio.items for update to authenticated
  using (podio.can_edit_item(id));
create policy p_items_delete on podio.items for delete to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id)));
create policy p_ifv_select on podio.item_field_values for select to authenticated
  using (podio.can_access_item(item_id));
create policy p_ifv_write on podio.item_field_values for all to authenticated
  using (podio.can_edit_item(item_id)) with check (podio.can_edit_item(item_id));
create policy p_rel_select on podio.item_relationships for select to authenticated
  using (podio.can_access_item(from_item_id) or podio.can_access_item(to_item_id));
create policy p_rel_write on podio.item_relationships for all to authenticated
  using (podio.can_edit_item(from_item_id)) with check (podio.can_edit_item(from_item_id));
create policy p_item_rev_select on podio.item_revisions for select to authenticated
  using (podio.can_access_item(item_id));
create policy p_item_rev_insert on podio.item_revisions for insert to authenticated
  with check (podio.can_edit_item(item_id));
create policy p_item_followers_all on podio.item_followers for all to authenticated
  using (user_id = auth.uid() or podio.can_access_item(item_id))
  with check (podio.can_access_item(item_id));
create policy p_item_shares_select on podio.item_shares for select to authenticated
  using (user_id = auth.uid() or podio.is_workspace_member(podio.item_workspace(item_id)));
create policy p_item_shares_write on podio.item_shares for all to authenticated
  using (podio.is_workspace_member(podio.item_workspace(item_id)))
  with check (podio.is_workspace_member(podio.item_workspace(item_id)));

create policy p_tags_all on podio.tags for all to authenticated
  using (podio.is_org_member(organization_id)) with check (podio.is_org_member(organization_id));
create policy p_item_tags_all on podio.item_tags for all to authenticated
  using (podio.can_access_item(item_id)) with check (podio.can_edit_item(item_id));

create policy p_comments_select on podio.comments for select to authenticated
  using ((workspace_id is not null and podio.is_workspace_member(workspace_id))
    or (target_type = 'item' and podio.can_access_item(target_id))
    or created_by = auth.uid());
create policy p_comments_insert on podio.comments for insert to authenticated
  with check (created_by = auth.uid()
    and ((workspace_id is not null and podio.is_workspace_member(workspace_id))
      or (target_type = 'item' and podio.can_access_item(target_id))));
create policy p_comments_update on podio.comments for update to authenticated
  using (created_by = auth.uid());
create policy p_comments_delete on podio.comments for delete to authenticated
  using (created_by = auth.uid());
create policy p_comment_reactions_all on podio.comment_reactions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy p_mentions_select on podio.mentions for select to authenticated
  using (mentioned_user_id = auth.uid() or created_by = auth.uid()
    or (mentioned_workspace_id is not null and podio.is_workspace_member(mentioned_workspace_id)));
create policy p_mentions_insert on podio.mentions for insert to authenticated
  with check (created_by = auth.uid());
create policy p_status_posts_select on podio.status_posts for select to authenticated
  using (podio.is_workspace_member(workspace_id));
create policy p_status_posts_write on podio.status_posts for all to authenticated
  using (created_by = auth.uid() and podio.is_workspace_member(workspace_id))
  with check (created_by = auth.uid() and podio.is_workspace_member(workspace_id));
create policy p_activity_select on podio.activity_events for select to authenticated
  using ((workspace_id is not null and podio.is_workspace_member(workspace_id))
    or podio.is_org_admin(organization_id));
create policy p_activity_insert on podio.activity_events for insert to authenticated
  with check (podio.is_org_member(organization_id));
create policy p_follows_all on podio.follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy p_notifications_all on podio.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy p_conversations_select on podio.conversations for select to authenticated
  using (podio.is_conversation_participant(id));
create policy p_conversations_insert on podio.conversations for insert to authenticated
  with check (created_by = auth.uid());
create policy p_conversations_update on podio.conversations for update to authenticated
  using (podio.is_conversation_participant(id));
create policy p_conv_parts_select on podio.conversation_participants for select to authenticated
  using (podio.is_conversation_participant(conversation_id));
create policy p_conv_parts_insert on podio.conversation_participants for insert to authenticated
  with check (podio.is_conversation_participant(conversation_id)
    or exists (select 1 from podio.conversations c
        where c.id = conversation_id and c.created_by = auth.uid()));
create policy p_conv_parts_update on podio.conversation_participants for update to authenticated
  using (user_id = auth.uid());
create policy p_conv_parts_delete on podio.conversation_participants for delete to authenticated
  using (user_id = auth.uid());
create policy p_messages_select on podio.messages for select to authenticated
  using (podio.is_conversation_participant(conversation_id));
create policy p_messages_insert on podio.messages for insert to authenticated
  with check (sender_id = auth.uid() and podio.is_conversation_participant(conversation_id));

create policy p_tasks_select on podio.tasks for select to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid()
    or (not is_private and workspace_id is not null and podio.is_workspace_member(workspace_id)));
create policy p_tasks_insert on podio.tasks for insert to authenticated
  with check (created_by = auth.uid() and podio.is_org_member(organization_id));
create policy p_tasks_update on podio.tasks for update to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid()
    or (workspace_id is not null and podio.is_workspace_member(workspace_id)));
create policy p_tasks_delete on podio.tasks for delete to authenticated
  using (created_by = auth.uid());
create policy p_task_labels_all on podio.task_labels for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy p_task_label_links_all on podio.task_label_links for all to authenticated
  using (exists (select 1 from podio.task_labels l where l.id = label_id and l.user_id = auth.uid()))
  with check (exists (select 1 from podio.task_labels l where l.id = label_id and l.user_id = auth.uid()));

create policy p_files_select on podio.files for select to authenticated
  using (uploaded_by = auth.uid()
    or (workspace_id is not null and podio.is_workspace_member(workspace_id))
    or (workspace_id is null and podio.is_org_member(organization_id)));
create policy p_files_write on podio.files for all to authenticated
  using (uploaded_by = auth.uid()
    or (workspace_id is not null and podio.is_workspace_member(workspace_id)))
  with check (podio.is_org_member(organization_id));
create policy p_file_attach_select on podio.file_attachments for select to authenticated
  using (exists (select 1 from podio.files f where f.id = file_id));
create policy p_file_attach_write on podio.file_attachments for all to authenticated
  using (attached_by = auth.uid()) with check (attached_by = auth.uid());

create policy p_webforms_all on podio.webforms for all to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id)))
  with check (podio.is_workspace_member(podio.app_workspace(app_id)));
create policy p_webform_subs_select on podio.webform_submissions for select to authenticated
  using (exists (select 1 from podio.webforms w where w.id = webform_id
    and podio.is_workspace_member(podio.app_workspace(w.app_id))));

create policy p_app_email_all on podio.app_email_addresses for all to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id)))
  with check (podio.is_workspace_member(podio.app_workspace(app_id)));
create policy p_inbound_emails_select on podio.inbound_emails for select to authenticated
  using (exists (select 1 from podio.app_email_addresses a where a.id = app_email_id
    and podio.is_workspace_member(podio.app_workspace(a.app_id))));
create policy p_email_templates_all on podio.email_templates for all to authenticated
  using (podio.is_org_member(organization_id)) with check (podio.is_org_member(organization_id));

create policy p_automations_all on podio.automations for all to authenticated
  using (podio.is_workspace_member(workspace_id))
  with check (podio.is_workspace_member(workspace_id));
create policy p_auto_revisions_select on podio.automation_revisions for select to authenticated
  using (exists (select 1 from podio.automations a where a.id = automation_id
    and podio.is_workspace_member(a.workspace_id)));
create policy p_auto_runs_select on podio.automation_runs for select to authenticated
  using (exists (select 1 from podio.automations a where a.id = automation_id
    and podio.is_workspace_member(a.workspace_id)));

create policy p_api_keys_all on podio.api_keys for all to authenticated
  using (podio.is_org_admin(organization_id)) with check (podio.is_org_admin(organization_id));
create policy p_webhooks_all on podio.webhooks for all to authenticated
  using (podio.is_org_admin(organization_id)) with check (podio.is_org_admin(organization_id));
create policy p_wh_deliveries_select on podio.webhook_deliveries for select to authenticated
  using (exists (select 1 from podio.webhooks w where w.id = webhook_id
    and podio.is_org_admin(w.organization_id)));

create policy p_templates_select on podio.app_templates for select to authenticated
  using (visibility = 'public'
    or (organization_id is not null and podio.is_org_member(organization_id)));
create policy p_templates_write on podio.app_templates for all to authenticated
  using (organization_id is not null and podio.is_org_member(organization_id))
  with check (organization_id is not null and podio.is_org_member(organization_id));
create policy p_template_installs_all on podio.template_installs for all to authenticated
  using (podio.is_workspace_member(workspace_id))
  with check (podio.is_workspace_member(workspace_id));
create policy p_template_reviews_select on podio.template_reviews for select to authenticated using (true);
create policy p_template_reviews_write on podio.template_reviews for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy p_import_jobs_all on podio.import_jobs for all to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id)))
  with check (user_id = auth.uid() and podio.is_workspace_member(podio.app_workspace(app_id)));
create policy p_export_jobs_all on podio.export_jobs for all to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id)))
  with check (user_id = auth.uid() and podio.is_workspace_member(podio.app_workspace(app_id)));

create policy p_audit_select on podio.audit_logs for select to authenticated
  using (podio.is_org_admin(organization_id));

-- ============ Grants ============
grant usage on schema podio to authenticated, service_role;
grant select, insert, update, delete on all tables in schema podio to authenticated;
grant all on all tables in schema podio to service_role;
grant execute on all functions in schema podio to authenticated, service_role;
alter default privileges in schema podio grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema podio grant all on tables to service_role;
alter default privileges in schema podio grant execute on functions to authenticated, service_role;
