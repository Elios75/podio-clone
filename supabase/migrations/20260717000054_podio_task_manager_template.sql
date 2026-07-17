-- Podio Clone: Migration 54 - "Task Manager" starter pack in the App Market.
-- A full task-management template: status/priority/labels categories, assignee,
-- due date, progress, duration, file attachment — plus a "Related to"
-- relationship field so tasks can be linked to records in ANY other app (same
-- or other workspace; the installer points the field at a target app in
-- Modify Template, and linked tasks then appear in that record's Related
-- items section). Platform template: organization_id null, visibility public.
-- Idempotent by name, same as the migration-41 packs.
do $$
declare
  v_def jsonb := $tm${
    "app": {
      "name": "Task Manager",
      "icon": "task",
      "item_name": "Task",
      "description": "Plan, assign and track work — and link every task to the record it belongs to in any other app.",
      "usage_instructions": "After installing, open the wrench menu > Modify Template and point the \"Related to\" field at the app whose records your tasks belong to — it can live in this workspace or any other workspace you are a member of. Linked tasks then show up automatically in the Related items section of those records. Use the Board layout to drag tasks between statuses."
    },
    "fields": [
      {"external_id": "task-title", "label": "Task", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "description", "label": "Description", "type": "text", "position": 1},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "not-started", "label": "Not Started", "color": "#CFE8F7"},
        {"id": "in-progress", "label": "In Progress", "color": "#F5EFC8"},
        {"id": "waiting", "label": "Waiting", "color": "#DCC8F5"},
        {"id": "done", "label": "Done", "color": "#D9F2E5"}]}},
      {"external_id": "priority", "label": "Priority", "type": "category", "position": 3, "config": {"options": [
        {"id": "low", "label": "Low", "color": "#CDEDED"},
        {"id": "medium", "label": "Medium", "color": "#F5EFC8"},
        {"id": "high", "label": "High", "color": "#F7941D"},
        {"id": "urgent", "label": "Urgent", "color": "#F97F70"}]}},
      {"external_id": "assignee", "label": "Assignee", "type": "contact", "position": 4},
      {"external_id": "due-date", "label": "Due date", "type": "date", "position": 5},
      {"external_id": "progress", "label": "Progress", "type": "progress", "position": 6},
      {"external_id": "labels", "label": "Labels", "type": "category", "position": 7, "config": {"multiple": true, "options": [
        {"id": "admin", "label": "Admin", "color": "#DCC8F5"},
        {"id": "bug", "label": "Bug", "color": "#F9D7D4"},
        {"id": "feature", "label": "Feature", "color": "#D9F2E5"},
        {"id": "meeting", "label": "Meeting", "color": "#CFE8F7"}]}},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 8,
       "help_text": "Link this task to a record in another app. Set the target app in Modify Template — it can be in any workspace you belong to."},
      {"external_id": "attachment", "label": "Attachment", "type": "file", "position": 9},
      {"external_id": "time-estimate", "label": "Time estimate", "type": "duration", "position": 10}
    ],
    "views": [
      {"name": "All tasks", "layout": "table", "is_default": true, "position": 0},
      {"name": "Board", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2},
      {"name": "Due dates", "layout": "calendar", "position": 3}
    ],
    "automations": [
      {"name": "Completed follow-up", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "done"}],
       "actions": [{"type": "add_comment", "body": "Task marked Done — check for follow-up work before closing it out."}]}
    ],
    "sample_items": [
      {"title": "Draft Q3 report", "values": {"task-title": "Draft Q3 report", "description": "Pull the quarterly numbers together and draft the summary for review.", "status": "in-progress", "priority": "high", "progress": 40, "due-date": {"start": "2026-07-24"}}},
      {"title": "Fix login timeout bug", "values": {"task-title": "Fix login timeout bug", "description": "Sessions expire after 5 minutes instead of 8 hours. Reproduce, fix, add a regression test.", "status": "not-started", "priority": "urgent", "labels": ["bug"]}},
      {"title": "Schedule kickoff meeting", "values": {"task-title": "Schedule kickoff meeting", "status": "done", "priority": "medium", "progress": 100, "labels": ["meeting"]}}
    ]
  }$tm$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Task Manager' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Task Manager',
       'A complete task tracker: statuses, priorities, assignees, due dates, labels and progress — with a Related-to field that links tasks to records in any other app, in this or another workspace.',
       'productivity', v_def, 'public', 1);
  end if;
end $$;
