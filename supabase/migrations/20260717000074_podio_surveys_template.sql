-- Podio Clone: Migration 74 - "Surveys" starter pack in the App Market.
-- A field-survey / interview capture template: one item per collected response,
-- with a survey category (Board groups by it), respondent, collector, location,
-- photo, a 1-10 score and a follow-up flag that spins off a task automatically.
-- A "Related to" relationship field lets each response link to the customer or
-- site record it belongs to in ANY other app (the installer points the field at
-- a target app in Modify Template — works across workspaces). Platform
-- template: organization_id null, visibility public. Idempotent by name.
do $$
declare
  v_def jsonb := $sv${
    "app": {
      "name": "Surveys",
      "icon": "chart",
      "item_name": "Response",
      "description": "Use this as a mobile guide for interviews and field surveys — capture one response per item with score, feedback, photo and location, and flag the ones that need follow-up.",
      "usage_instructions": "Built for capture in the field: open the app on your phone, add a Response per interview or site visit, snap a Photo, let Location pin where you are, score it 1-10 and paste verbatim answers into Feedback. Set \"Follow-up needed\" to Yes and a follow-up task is created for you automatically. After installing, open the wrench menu > Modify Template and point the \"Related to\" field at the app holding your customer or site records — it can live in this workspace or any other workspace you are a member of. To collect responses from people outside the workspace, share the app's webform: anyone with the link can submit a response without a login."
    },
    "fields": [
      {"external_id": "response-title", "label": "Response", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "survey", "label": "Survey", "type": "category", "position": 1, "config": {"options": [
        {"id": "customer-satisfaction", "label": "Customer Satisfaction", "color": "#CFE8F7"},
        {"id": "employee-engagement", "label": "Employee Engagement", "color": "#DCC8F5"},
        {"id": "site-visit", "label": "Site Visit", "color": "#F5EFC8"},
        {"id": "market-research", "label": "Market Research", "color": "#CDEDED"},
        {"id": "other", "label": "Other", "color": "#FBE3C9"}]}},
      {"external_id": "response-date", "label": "Date", "type": "date", "position": 2},
      {"external_id": "respondent", "label": "Respondent", "type": "text", "position": 3,
       "help_text": "The person or site surveyed — external, not a workspace member."},
      {"external_id": "collected-by", "label": "Collected by", "type": "contact", "position": 4},
      {"external_id": "location", "label": "Location", "type": "location", "position": 5},
      {"external_id": "overall-score", "label": "Overall score", "type": "number", "position": 6,
       "help_text": "1-10"},
      {"external_id": "feedback", "label": "Feedback", "type": "text", "position": 7,
       "help_text": "Verbatim answers and observations."},
      {"external_id": "follow-up-needed", "label": "Follow-up needed", "type": "category", "position": 8, "config": {"options": [
        {"id": "yes", "label": "Yes", "color": "#F9D7D4"},
        {"id": "no", "label": "No", "color": "#D9F2E5"}]}},
      {"external_id": "photo", "label": "Photo", "type": "image", "position": 9},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 10,
       "help_text": "Link this response to the customer or site record it belongs to. Set the target app in Modify Template — it can be in any workspace you belong to."}
    ],
    "views": [
      {"name": "All responses", "layout": "table", "is_default": true, "position": 0},
      {"name": "By survey", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2},
      {"name": "Calendar", "layout": "calendar", "position": 3}
    ],
    "automations": [
      {"name": "Follow-up task", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "follow-up-needed", "op": "equals", "value": "yes"}],
       "actions": [{"type": "create_task", "title": "Follow up on survey response", "due_days": 3}]}
    ],
    "sample_items": [
      {"title": "Interview — Maria D., Riverside branch", "values": {"response-title": "Interview — Maria D., Riverside branch", "survey": "customer-satisfaction", "response-date": {"start": "2026-07-20"}, "respondent": "Maria D., Riverside branch", "overall-score": 8, "feedback": "Very happy with the new checkout flow; wait times still an issue on Saturdays.", "follow-up-needed": "no"}},
      {"title": "Site visit — Warehouse 3, Dockside", "values": {"response-title": "Site visit — Warehouse 3, Dockside", "survey": "site-visit", "response-date": {"start": "2026-07-22"}, "respondent": "Warehouse 3, Dockside", "overall-score": 5, "feedback": "Loading bay signage missing; two pallets blocking the fire exit — needs action this week.", "follow-up-needed": "yes"}},
      {"title": "Pulse check — Engineering team", "values": {"response-title": "Pulse check — Engineering team", "survey": "employee-engagement", "response-date": {"start": "2026-07-24"}, "respondent": "Engineering team (anonymous)", "overall-score": 7, "feedback": "Morale up since the release; recurring ask for clearer sprint priorities."}}
    ]
  }$sv$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Surveys' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Surveys',
       'Use this as a mobile guide for interviews and field surveys — one item per collected response, with survey type, respondent, location, photo, a 1-10 score, verbatim feedback and an automatic follow-up task for flagged responses.',
       'productivity', v_def, 'public', 1);
  end if;
end $$;
