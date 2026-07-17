-- Podio Clone: Migration 72 - "Tickets" starter pack in the App Market.
-- A helpdesk/work-ticket template: status and priority categories, contact
-- assignee, requester, due date, resolution notes, file attachment — plus a
-- "Related to" relationship field so tickets can be linked to the customer,
-- asset or project they concern in ANY other app (same or other workspace;
-- the installer points the field at a target app in Modify Template).
-- Platform template: organization_id null, visibility public.
-- Idempotent by name, same as the migration-41/54 packs.
do $$
declare
  v_def jsonb := $tk${
    "app": {
      "name": "Tickets",
      "icon": "task",
      "item_name": "Ticket",
      "description": "Assign work tasks to employees.",
      "usage_instructions": "Log every incoming request as a ticket: new tickets start in New, get triaged (a follow-up task is created automatically), and are assigned to an employee via the \"Assigned to\" field. Use the Board layout to drag tickets through New, Assigned, In Progress, Waiting and Resolved as work moves along. When resolving, fill in the Resolution field so the fix is on record — an automatic comment reminds you to confirm with the requester before closing. After installing, open the wrench menu > Modify Template and point the \"Related to\" field at the app the tickets concern (customers, assets, projects…) — it can live in this workspace or any other workspace you are a member of; linked tickets then appear in that record's Related items section."
    },
    "fields": [
      {"external_id": "ticket-title", "label": "Ticket", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "description", "label": "Description", "type": "text", "position": 1},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "new", "label": "New", "color": "#CFE8F7"},
        {"id": "assigned", "label": "Assigned", "color": "#CDEDED"},
        {"id": "in-progress", "label": "In Progress", "color": "#F5EFC8"},
        {"id": "waiting", "label": "Waiting", "color": "#DCC8F5"},
        {"id": "resolved", "label": "Resolved", "color": "#D9F2E5"}]}},
      {"external_id": "priority", "label": "Priority", "type": "category", "position": 3, "config": {"options": [
        {"id": "low", "label": "Low", "color": "#CDEDED"},
        {"id": "medium", "label": "Medium", "color": "#F5EFC8"},
        {"id": "high", "label": "High", "color": "#F7941D"},
        {"id": "urgent", "label": "Urgent", "color": "#F97F70"}]}},
      {"external_id": "assigned-to", "label": "Assigned to", "type": "contact", "position": 4},
      {"external_id": "requester", "label": "Requester", "type": "text", "position": 5,
       "help_text": "Who reported or requested this — can be someone outside the workspace."},
      {"external_id": "due-date", "label": "Due date", "type": "date", "position": 6},
      {"external_id": "resolution", "label": "Resolution", "type": "text", "position": 7,
       "help_text": "What fixed it — fill this in when resolving the ticket."},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 8,
       "help_text": "Link this ticket to the customer, asset or project it concerns. Set the target app in Modify Template — it can be in any workspace you belong to."},
      {"external_id": "attachment", "label": "Attachment", "type": "file", "position": 9}
    ],
    "views": [
      {"name": "All tickets", "layout": "table", "is_default": true, "position": 0},
      {"name": "Board", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2}
    ],
    "automations": [
      {"name": "Triage new ticket", "trigger": {"type": "item_created"},
       "actions": [{"type": "create_task", "title": "Triage and assign ticket", "due_days": 1}]},
      {"name": "Resolved follow-up", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "resolved"}],
       "actions": [{"type": "add_comment", "body": "Ticket marked Resolved — confirm the fix with the requester before closing it out."}]}
    ],
    "sample_items": [
      {"title": "Printer on 2nd floor jams on duplex", "values": {"ticket-title": "Printer on 2nd floor jams on duplex", "description": "Every double-sided job jams at the fuser. Single-sided prints fine.", "status": "in-progress", "priority": "high", "requester": "Dana Willis (Accounting)", "due-date": {"start": "2026-07-20"}}},
      {"title": "New starter laptop setup", "values": {"ticket-title": "New starter laptop setup", "description": "Prepare laptop, accounts and badge for the new hire starting Monday.", "status": "assigned", "priority": "medium", "requester": "HR", "due-date": {"start": "2026-07-24"}}},
      {"title": "VPN drops every 30 minutes", "values": {"ticket-title": "VPN drops every 30 minutes", "description": "Connection re-authenticates and drops active sessions. Started after the last client update.", "status": "resolved", "priority": "urgent", "requester": "Miguel Torres (Sales)", "resolution": "Rolled VPN client back to 4.2.1 and pinned the version until the vendor patch lands."}}
    ]
  }$tk$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Tickets' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Tickets',
       'Assign work tasks to employees.',
       'operations', v_def, 'public', 1);
  end if;
end $$;
