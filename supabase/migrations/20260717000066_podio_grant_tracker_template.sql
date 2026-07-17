-- Podio Clone: Migration 66 - "Grant Tracker" starter pack in the App Market.
-- Grant application pipeline for nonprofits: status-driven kanban (Researching
-- through Awarded/Declined), requested vs awarded amounts, deadline calendar,
-- funder-side program officer, owner contact, application file attachment, and
-- a "Related to" relationship field so each grant can be linked to the program
-- or project it funds in any other app. Platform template: organization_id
-- null, visibility public. Idempotent by name, same as the migration-41 packs.
do $$
declare
  v_def jsonb := $gt${
    "app": {
      "name": "Grant Tracker",
      "icon": "doc",
      "item_name": "Grant",
      "description": "Design and track grant applications from research to award — amounts, deadlines, funder contacts and the programs each grant funds.",
      "usage_instructions": "Work the Pipeline board left to right: drag each grant from Researching to Preparing, Submitted, and finally Awarded or Declined — moving a card to Submitted or Awarded automatically creates a follow-up task. Keep every application's due date in the Deadline field so the Deadlines calendar shows what is coming up. After installing, open the wrench menu > Modify Template and point the \"Related to\" field at the app that holds your programs or projects — it can live in this workspace or any other workspace you are a member of — so each grant links to the work it funds and shows up in that record's Related items."
    },
    "fields": [
      {"external_id": "grant-title", "label": "Grant", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "funder", "label": "Funder", "type": "text", "position": 1},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "researching", "label": "Researching", "color": "#CFE8F7"},
        {"id": "preparing", "label": "Preparing", "color": "#F5EFC8"},
        {"id": "submitted", "label": "Submitted", "color": "#CDEDED"},
        {"id": "awarded", "label": "Awarded", "color": "#D9F2E5"},
        {"id": "declined", "label": "Declined", "color": "#F9D7D4"}]}},
      {"external_id": "amount-requested", "label": "Amount requested", "type": "money", "position": 3},
      {"external_id": "amount-awarded", "label": "Amount awarded", "type": "money", "position": 4},
      {"external_id": "deadline", "label": "Deadline", "type": "date", "position": 5},
      {"external_id": "program-officer", "label": "Program officer", "type": "text", "position": 6,
       "help_text": "Your contact on the funder's side — the program officer handling this application."},
      {"external_id": "owner", "label": "Owner", "type": "contact", "position": 7},
      {"external_id": "application", "label": "Application", "type": "file", "position": 8},
      {"external_id": "notes", "label": "Notes", "type": "text", "position": 9},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 10,
       "help_text": "Link this grant to the program or project it funds. Set the target app in Modify Template — it can be in any workspace you belong to."}
    ],
    "views": [
      {"name": "All grants", "layout": "table", "is_default": true, "position": 0},
      {"name": "Pipeline", "layout": "kanban", "position": 1},
      {"name": "Deadlines", "layout": "calendar", "position": 2},
      {"name": "Cards", "layout": "card", "position": 3}
    ],
    "automations": [
      {"name": "Submitted follow-up", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "submitted"}],
       "actions": [{"type": "create_task", "title": "Confirm receipt with funder", "due_days": 3}]},
      {"name": "Award follow-up", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "awarded"}],
       "actions": [{"type": "create_task", "title": "Send thank-you and set up reporting schedule", "due_days": 5}]}
    ],
    "sample_items": [
      {"title": "Youth literacy program grant", "values": {"grant-title": "Youth literacy program grant", "funder": "Example Community Foundation (fictional)", "status": "preparing", "amount-requested": {"amount": "25000", "currency": "USD"}, "deadline": {"start": "2026-08-14"}, "program-officer": "J. Rivera", "notes": "Second draft of the narrative in progress; budget worksheet still needs board sign-off."}},
      {"title": "Community garden expansion", "values": {"grant-title": "Community garden expansion", "funder": "Fictional Green Futures Fund", "status": "submitted", "amount-requested": {"amount": "12000", "currency": "USD"}, "deadline": {"start": "2026-07-20"}, "program-officer": "A. Okafor", "notes": "Submitted via the funder portal; decision expected within 8 weeks."}},
      {"title": "After-school arts initiative", "values": {"grant-title": "After-school arts initiative", "funder": "Sample Arts Trust (demo)", "status": "awarded", "amount-requested": {"amount": "40000", "currency": "USD"}, "amount-awarded": {"amount": "35000", "currency": "USD"}, "deadline": {"start": "2026-06-30"}, "notes": "Awarded at reduced amount — first report due six months after funds are received."}}
    ]
  }$gt$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Grant Tracker' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Grant Tracker',
       'Design and track grant applications from first research to final award: a status pipeline, requested and awarded amounts, deadlines on a calendar, funder contacts, the application file — and a Related-to field linking each grant to the program it funds in any other app.',
       'nonprofit', v_def, 'public', 1);
  end if;
end $$;
