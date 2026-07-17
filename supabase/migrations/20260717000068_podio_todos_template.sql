-- Podio Clone: Migration 68 - "To-Dos" starter pack in the App Market.
-- The lightweight sibling of the full Task Manager template: quick categorized
-- checklist items (Errand / Call / Buy / Prepare / Other) with an Open/Done
-- flag, due date, assignee and priority — no automations, no heavy tracking.
-- The "By category" kanban groups by Category (the first single-select
-- category field in position order). Platform template: organization_id null,
-- visibility public. Idempotent by name, same as the migration-41 packs.
do $$
declare
  v_def jsonb := $td${
    "app": {
      "name": "To-Dos",
      "icon": "task",
      "item_name": "To-Do",
      "description": "Use this app to keep track of categorized to-dos — quick checklist items you can capture, flag as done and sort by category.",
      "usage_instructions": "Capture to-dos as fast as you can type them — only the To-Do title is required; add a category, due date or assignee when it helps. Flip the Done field to Done when you finish an item, and use the \"By category\" Board layout to drag to-dos between category columns (Errand, Call, Buy, Prepare, Other). If you outgrow this light checklist and need statuses, progress, labels and linked records, install the full Task Manager template alongside it."
    },
    "fields": [
      {"external_id": "todo-title", "label": "To-Do", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "category", "label": "Category", "type": "category", "position": 1, "config": {"options": [
        {"id": "errand", "label": "Errand", "color": "#CFE8F7"},
        {"id": "call", "label": "Call", "color": "#CDEDED"},
        {"id": "buy", "label": "Buy", "color": "#F5EFC8"},
        {"id": "prepare", "label": "Prepare", "color": "#DCC8F5"},
        {"id": "other", "label": "Other", "color": "#FBE3C9"}]}},
      {"external_id": "done", "label": "Done", "type": "category", "position": 2, "config": {"options": [
        {"id": "open", "label": "Open", "color": "#CFE8F7"},
        {"id": "done", "label": "Done", "color": "#D9F2E5"}]}},
      {"external_id": "due-date", "label": "Due date", "type": "date", "position": 3},
      {"external_id": "assigned-to", "label": "Assigned to", "type": "contact", "position": 4},
      {"external_id": "priority", "label": "Priority", "type": "category", "position": 5, "config": {"options": [
        {"id": "low", "label": "Low", "color": "#CDEDED"},
        {"id": "medium", "label": "Medium", "color": "#F5EFC8"},
        {"id": "high", "label": "High", "color": "#F7941D"}]}},
      {"external_id": "details", "label": "Details", "type": "text", "position": 6}
    ],
    "views": [
      {"name": "All to-dos", "layout": "table", "is_default": true, "position": 0},
      {"name": "By category", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2}
    ],
    "automations": [],
    "sample_items": [
      {"title": "Pick up dry cleaning", "values": {"todo-title": "Pick up dry cleaning", "category": "errand", "done": "open", "priority": "low", "due-date": {"start": "2026-07-20"}, "details": "Ticket is in the car glovebox — shop closes at 6pm."}},
      {"title": "Call the venue about catering", "values": {"todo-title": "Call the venue about catering", "category": "call", "done": "open", "priority": "high", "due-date": {"start": "2026-07-21"}, "details": "Confirm headcount and ask about vegetarian options."}},
      {"title": "Buy printer paper", "values": {"todo-title": "Buy printer paper", "category": "buy", "done": "done", "priority": "medium"}}
    ]
  }$td$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'To-Dos' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'To-Dos',
       'Use this app to keep track of categorized to-dos — the lightweight sibling of Task Manager for quick checklist items with a category, an Open/Done flag, due date, assignee and priority.',
       'productivity', v_def, 'public', 1);
  end if;
end $$;
