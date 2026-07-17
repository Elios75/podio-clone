-- Podio Clone: Migration 70 - "Ideas" starter pack in the App Market.
-- A platform for keeping track of new ideas: capture, review and prioritize
-- ideas with Status/Impact/Effort chips, a vote counter, and a "Related to"
-- relationship field so each idea can be linked to the project or product
-- area it belongs to (installer points it at a target app in Modify
-- Template — works across workspaces). Platform template: organization_id
-- null, visibility public. Idempotent by name.
do $$
declare
  v_def jsonb := $id${
    "app": {
      "name": "Ideas",
      "icon": "idea",
      "item_name": "Idea",
      "description": "A platform for keeping track of new ideas — capture them fast, review them together, and prioritize the best ones.",
      "usage_instructions": "Capture ideas fast: the Idea title and a short Description are enough to submit. Review the list weekly and move each idea through the Status flow — New, Under Review, Approved (or Rejected). Use the Impact and Effort chips to prioritize: high impact + low effort first. Bump the Votes number whenever someone +1s an idea. After installing, open the wrench menu > Modify Template and point the \"Related to\" field at your Projects app (or any other app) — it can live in this workspace or any other workspace you are a member of."
    },
    "fields": [
      {"external_id": "idea-title", "label": "Idea", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "description", "label": "Description", "type": "text", "position": 1},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "new", "label": "New", "color": "#CFE8F7"},
        {"id": "under-review", "label": "Under Review", "color": "#F5EFC8"},
        {"id": "approved", "label": "Approved", "color": "#D9F2E5"},
        {"id": "in-progress", "label": "In Progress", "color": "#CDEDED"},
        {"id": "rejected", "label": "Rejected", "color": "#F9D7D4"}]}},
      {"external_id": "idea-category", "label": "Idea category", "type": "category", "position": 3, "config": {"options": [
        {"id": "product", "label": "Product", "color": "#DCC8F5"},
        {"id": "process", "label": "Process", "color": "#CFE8F7"},
        {"id": "marketing", "label": "Marketing", "color": "#FBE3C9"},
        {"id": "other", "label": "Other", "color": "#CDEDED"}]}},
      {"external_id": "submitted-by", "label": "Submitted by", "type": "contact", "position": 4},
      {"external_id": "impact", "label": "Impact", "type": "category", "position": 5, "config": {"options": [
        {"id": "low", "label": "Low", "color": "#CDEDED"},
        {"id": "medium", "label": "Medium", "color": "#F5EFC8"},
        {"id": "high", "label": "High", "color": "#D9F2E5"}]}},
      {"external_id": "effort", "label": "Effort", "type": "category", "position": 6, "config": {"options": [
        {"id": "low", "label": "Low", "color": "#D9F2E5"},
        {"id": "medium", "label": "Medium", "color": "#F5EFC8"},
        {"id": "high", "label": "High", "color": "#F9D7D4"}]}},
      {"external_id": "votes", "label": "Votes", "type": "number", "position": 7,
       "help_text": "Bump this when someone +1s the idea."},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 8,
       "help_text": "Link this idea to the project or product area it belongs to. Set the target app in Modify Template — it can be in any workspace you belong to."}
    ],
    "views": [
      {"name": "All ideas", "layout": "table", "is_default": true, "position": 0},
      {"name": "Board", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2}
    ],
    "automations": [
      {"name": "Welcome new idea", "trigger": {"type": "item_created"},
       "actions": [{"type": "add_comment", "body": "Thanks for the idea! It starts as New and will be picked up in the weekly review, where it moves to Under Review and then Approved or Rejected. Add detail in the Description and rally some Votes to boost it."}]},
      {"name": "Approved idea follow-up", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "approved"}],
       "actions": [{"type": "create_task", "title": "Scope the approved idea", "due_days": 5}]}
    ],
    "sample_items": [
      {"title": "Self-serve onboarding checklist", "values": {"idea-title": "Self-serve onboarding checklist", "description": "Add an in-app checklist that walks new users through setup so they don't need a call with support.", "status": "under-review", "idea-category": "product", "impact": "high", "effort": "medium", "votes": 7}},
      {"title": "Weekly customer story email", "values": {"idea-title": "Weekly customer story email", "description": "Short internal email highlighting one customer win each week to keep the team close to users.", "status": "new", "idea-category": "marketing", "impact": "medium", "effort": "low", "votes": 3}},
      {"title": "Automate invoice reminders", "values": {"idea-title": "Automate invoice reminders", "description": "Stop chasing overdue invoices by hand — send an automatic reminder 3 days after the due date.", "status": "approved", "idea-category": "process", "impact": "high", "effort": "low", "votes": 12}}
    ]
  }$id$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Ideas' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Ideas',
       'A platform for keeping track of new ideas — capture them as they come up, review and vote on them as a team, and use Impact and Effort ratings to decide what to build next.',
       'productivity', v_def, 'public', 1);
  end if;
end $$;
