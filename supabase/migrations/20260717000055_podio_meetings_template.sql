-- Podio Clone: Migration 55 - "Meetings" starter pack in the App Market.
-- A meeting tracker: schedule, run and document meetings — start/end times,
-- status, organizer, location, agenda and minutes, plus a "Related to"
-- relationship field so meetings can be linked to records in ANY other app
-- (the installer points the field at a target app in Modify Template).
-- Platform template: organization_id null, visibility public.
-- Idempotent by name, same as the migration-54 pack.
do $$
declare
  v_def jsonb := $mt${
    "app": {
      "name": "Meetings",
      "icon": "meeting",
      "item_name": "Meeting",
      "description": "Schedule, run and document meetings — agendas, minutes, organizers and locations in one place.",
      "usage_instructions": "After installing, open the wrench menu > Modify Template and point the \"Related to\" field at the app whose records your meetings belong to (a project, client or deal app) — it can live in this workspace or any other workspace you are a member of. Linked meetings then show up in the Related items section of those records. Use the Calendar view to see meetings by date, capture decisions and action points in the Minutes field, and set Status to Held once the meeting is over."
    },
    "fields": [
      {"external_id": "meeting-title", "label": "Meeting", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "meeting-date", "label": "Date", "type": "date", "position": 1, "config": {"end_date": true}},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "scheduled", "label": "Scheduled", "color": "#CFE8F7"},
        {"id": "held", "label": "Held", "color": "#D9F2E5"},
        {"id": "cancelled", "label": "Cancelled", "color": "#F9D7D4"}]}},
      {"external_id": "organizer", "label": "Organizer", "type": "contact", "position": 3},
      {"external_id": "location", "label": "Location", "type": "location", "position": 4},
      {"external_id": "agenda", "label": "Agenda", "type": "text", "position": 5},
      {"external_id": "minutes", "label": "Minutes", "type": "text", "position": 6,
       "help_text": "Capture the decisions made, action points and their owners while the meeting is fresh."},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 7,
       "help_text": "Link this meeting to a record in another app. Set the target app in Modify Template — it can be in any workspace you belong to."},
      {"external_id": "attachment", "label": "Attachment", "type": "file", "position": 8}
    ],
    "views": [
      {"name": "All meetings", "layout": "table", "is_default": true, "position": 0},
      {"name": "Calendar", "layout": "calendar", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2}
    ],
    "automations": [
      {"name": "Agenda reminder", "trigger": {"type": "item_created"},
       "actions": [{"type": "create_task", "title": "Send agenda to attendees", "due_days": 1}]}
    ],
    "sample_items": [
      {"title": "Weekly team sync", "values": {"meeting-title": "Weekly team sync", "meeting-date": {"start": "2026-07-20"}, "status": "scheduled", "agenda": "1. Progress since last week 2. Blockers 3. Priorities for the coming week"}},
      {"title": "Q3 planning kickoff", "values": {"meeting-title": "Q3 planning kickoff", "meeting-date": {"start": "2026-07-13"}, "status": "held", "agenda": "Review Q2 results and agree the top three Q3 initiatives.", "minutes": "Decided to prioritise the mobile launch and the reporting revamp. Action: draft the roadmap by Friday (owner: PM)."}},
      {"title": "Vendor demo", "values": {"meeting-title": "Vendor demo", "meeting-date": {"start": "2026-07-27"}, "status": "scheduled", "agenda": "Product walkthrough and pricing discussion."}}
    ]
  }$mt$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Meetings' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Meetings',
       'A meeting tracker: schedule meetings with start and end times, capture agendas and minutes, track organizers and locations — with a Related-to field that links meetings to records in any other app.',
       'productivity', v_def, 'public', 1);
  end if;
end $$;
