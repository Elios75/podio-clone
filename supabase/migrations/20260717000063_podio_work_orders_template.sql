-- Podio Clone: Migration 63 - "Work Orders" starter pack in the App Market.
-- Field-service style work order tracker: status/priority categories, assignee,
-- due date, site location, estimated time, cost, file attachment — plus a
-- "Related to" relationship field so each work order can be linked to the
-- customer, order or asset record it belongs to in ANY other app (same or
-- other workspace; the installer points the field at a target app in Modify
-- Template). Platform template: organization_id null, visibility public.
-- Idempotent by name, same as the migration-41/54 packs.
do $$
declare
  v_def jsonb := $wo${
    "app": {
      "name": "Work Orders",
      "icon": "tray",
      "item_name": "Work Order",
      "description": "Use the work orders to track the work your team delivers — schedule jobs, assign them, follow status and cost, and link each order to the customer or asset it belongs to.",
      "usage_instructions": "Log each job as a work order and drag it across the Board (grouped by Status) as it moves from New to Completed. Use the Schedule view to plan by due date. After installing, open the wrench menu > Modify Template and point the \"Related to\" field at your customer, order or asset app — it can live in this workspace or any other workspace you are a member of; linked work orders then appear in the Related items section of those records."
    },
    "fields": [
      {"external_id": "work-order", "label": "Work order", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "description", "label": "Description", "type": "text", "position": 1},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "new", "label": "New", "color": "#CFE8F7"},
        {"id": "scheduled", "label": "Scheduled", "color": "#CDEDED"},
        {"id": "in-progress", "label": "In Progress", "color": "#F5EFC8"},
        {"id": "on-hold", "label": "On Hold", "color": "#DCC8F5"},
        {"id": "completed", "label": "Completed", "color": "#D9F2E5"}]}},
      {"external_id": "priority", "label": "Priority", "type": "category", "position": 3, "config": {"options": [
        {"id": "low", "label": "Low", "color": "#CDEDED"},
        {"id": "medium", "label": "Medium", "color": "#F5EFC8"},
        {"id": "high", "label": "High", "color": "#F7941D"},
        {"id": "urgent", "label": "Urgent", "color": "#F97F70"}]}},
      {"external_id": "assigned-to", "label": "Assigned to", "type": "contact", "position": 4},
      {"external_id": "due-date", "label": "Due date", "type": "date", "position": 5},
      {"external_id": "site-location", "label": "Site location", "type": "location", "position": 6},
      {"external_id": "estimated-time", "label": "Estimated time", "type": "duration", "position": 7},
      {"external_id": "cost", "label": "Cost", "type": "money", "position": 8},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 9,
       "help_text": "Link this work order to the customer, order or asset record it belongs to. Set the target app in Modify Template — it can be in any workspace you belong to."},
      {"external_id": "attachment", "label": "Attachment", "type": "file", "position": 10}
    ],
    "views": [
      {"name": "All work orders", "layout": "table", "is_default": true, "position": 0},
      {"name": "Board", "layout": "kanban", "position": 1},
      {"name": "Schedule", "layout": "calendar", "position": 2},
      {"name": "Cards", "layout": "card", "position": 3}
    ],
    "automations": [
      {"name": "New work order intake", "trigger": {"type": "item_created"},
       "actions": [{"type": "create_task", "title": "Schedule and assign work order", "due_days": 1}]}
    ],
    "sample_items": [
      {"title": "Replace HVAC filter — Building A", "values": {"work-order": "Replace HVAC filter — Building A", "description": "Quarterly filter replacement on rooftop units 1-4. Bring two spare filters.", "status": "scheduled", "priority": "medium", "due-date": {"start": "2026-07-20"}, "estimated-time": 7200, "cost": {"amount": "180", "currency": "USD"}}},
      {"title": "Emergency leak repair — Suite 210", "values": {"work-order": "Emergency leak repair — Suite 210", "description": "Tenant reports water leaking from the ceiling near the break room. Shut off riser and repair.", "status": "in-progress", "priority": "urgent", "due-date": {"start": "2026-07-17"}, "estimated-time": 10800, "cost": {"amount": "1200", "currency": "USD"}}},
      {"title": "Install signage — Front entrance", "values": {"work-order": "Install signage — Front entrance", "description": "Mount the new backlit sign above the front entrance and connect to timer circuit.", "status": "completed", "priority": "low", "estimated-time": 14400, "cost": {"amount": "650", "currency": "USD"}}}
    ]
  }$wo$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Work Orders' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Work Orders',
       'Use the work orders to track the work your team delivers — statuses, priorities, assignees, due dates, site locations, time estimates and costs, with a Related-to field that links each order to the customer, order or asset record in any other app.',
       'operations', v_def, 'public', 1);
  end if;
end $$;
