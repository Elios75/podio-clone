-- Podio Clone: Migration 56 - "Projects" starter pack in the App Market.
-- A project-tracking template: status/priority/labels categories, owner,
-- start/due dates, budget, progress — plus a "Client" relationship field so
-- projects can be linked to records in a CRM/Contacts app (same or other
-- workspace; the installer points the field at a target app in Modify
-- Template, and linked projects then appear in that record's Related items
-- section). Platform template: organization_id null, visibility public.
-- Idempotent by name, same as the migration-54 pack.
do $$
declare
  v_def jsonb := $pj${
    "app": {
      "name": "Projects",
      "icon": "rocket",
      "item_name": "Project",
      "description": "Plan and track projects from kickoff to delivery — statuses, owners, budgets, timelines and progress in one place.",
      "usage_instructions": "After installing, open the wrench menu > Modify Template and point the \"Client\" field at your CRM or Contacts app — it can live in this workspace or any other workspace you are a member of. Linked projects then show up automatically in the Related items section of those client records. Use the Board layout to drag projects between statuses, and the Timeline layout to see start and due dates on a calendar."
    },
    "fields": [
      {"external_id": "project-title", "label": "Project", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "description", "label": "Description", "type": "text", "position": 1},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "planning", "label": "Planning", "color": "#CFE8F7"},
        {"id": "active", "label": "Active", "color": "#F5EFC8"},
        {"id": "on-hold", "label": "On Hold", "color": "#DCC8F5"},
        {"id": "completed", "label": "Completed", "color": "#D9F2E5"}]}},
      {"external_id": "priority", "label": "Priority", "type": "category", "position": 3, "config": {"options": [
        {"id": "low", "label": "Low", "color": "#CDEDED"},
        {"id": "medium", "label": "Medium", "color": "#F5EFC8"},
        {"id": "high", "label": "High", "color": "#F7941D"}]}},
      {"external_id": "owner", "label": "Owner", "type": "contact", "position": 4},
      {"external_id": "start-date", "label": "Start date", "type": "date", "position": 5},
      {"external_id": "due-date", "label": "Due date", "type": "date", "position": 6},
      {"external_id": "budget", "label": "Budget", "type": "money", "position": 7},
      {"external_id": "progress", "label": "Progress", "type": "progress", "position": 8},
      {"external_id": "labels", "label": "Labels", "type": "category", "position": 9, "config": {"multiple": true, "options": [
        {"id": "internal", "label": "Internal", "color": "#CFE8F7"},
        {"id": "client", "label": "Client", "color": "#D9F2E5"},
        {"id": "rnd", "label": "R&D", "color": "#DCC8F5"}]}},
      {"external_id": "client", "label": "Client", "type": "relationship", "position": 10,
       "help_text": "Link this project to a client record in your CRM or Contacts app. Set the target app in Modify Template — it can be in any workspace you belong to."}
    ],
    "views": [
      {"name": "All projects", "layout": "table", "is_default": true, "position": 0},
      {"name": "Board", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2},
      {"name": "Timeline", "layout": "calendar", "position": 3}
    ],
    "automations": [
      {"name": "Completed wrap-up", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "completed"}],
       "actions": [{"type": "add_comment", "body": "Project marked Completed — schedule a retrospective and archive the project once deliverables are signed off."}]}
    ],
    "sample_items": [
      {"title": "Website redesign", "values": {"project-title": "Website redesign", "description": "Refresh the marketing site: new visual identity, faster pages, updated case studies.", "status": "active", "priority": "high", "progress": 55, "start-date": {"start": "2026-06-15"}, "due-date": {"start": "2026-08-28"}, "budget": {"amount": "24000", "currency": "USD"}, "labels": ["client"]}},
      {"title": "Mobile app v2 kickoff", "values": {"project-title": "Mobile app v2 kickoff", "description": "Scope the v2 feature set, assemble the team and lock the delivery plan.", "status": "planning", "priority": "medium", "progress": 10, "start-date": {"start": "2026-07-20"}, "due-date": {"start": "2026-10-30"}, "budget": {"amount": "60000", "currency": "USD"}, "labels": ["internal", "rnd"]}},
      {"title": "Office move logistics", "values": {"project-title": "Office move logistics", "description": "Coordinate the move to the new floor: vendors, IT cutover, seating plan.", "status": "completed", "priority": "low", "progress": 100, "due-date": {"start": "2026-07-03"}, "labels": ["internal"]}}
    ]
  }$pj$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Projects' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Projects',
       'Plan and track projects from kickoff to delivery: statuses, priorities, owners, start and due dates, budgets, progress and labels — with a Client field that links each project to a record in your CRM or Contacts app, in this or another workspace.',
       'project_management', v_def, 'public', 1);
  end if;
end $$;
