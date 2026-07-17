-- Podio Clone: Migration 69 - "Events" starter pack in the App Market.
-- Event planning template: status/type categories, start-end date, venue
-- location, organizer contact, attendee count, budget, file attachment — plus
-- a "Related to" relationship field so events can link to speakers, sponsors
-- or campaign records in any other app (the installer points the field at a
-- target app in Modify Template; works across workspaces). Platform template:
-- organization_id null, visibility public. Idempotent by name.
do $$
declare
  v_def jsonb := $ev${
    "app": {
      "name": "Events",
      "icon": "event",
      "item_name": "Event",
      "description": "Organize and manage all your events — from first planning steps through confirmation, the live day and wrap-up.",
      "usage_instructions": "Use the Calendar view as your planning surface: every event with a date shows up there, and end dates are supported so multi-day events span their full range. Drag events through the Board (Planning > Confirmed > Live > Completed) as they progress, or park them in Cancelled. After installing, open the wrench menu > Modify Template and point the \"Related to\" field at the app your events should link to — for example a Speakers, Sponsors or Campaigns app — in this workspace or any other workspace you are a member of; linked events then appear in the Related items section of those records. When a new event is created, an automation adds a follow-up task to book the venue and confirm the date within a week."
    },
    "fields": [
      {"external_id": "event-title", "label": "Event", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "description", "label": "Description", "type": "text", "position": 1},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "planning", "label": "Planning", "color": "#CFE8F7"},
        {"id": "confirmed", "label": "Confirmed", "color": "#CDEDED"},
        {"id": "live", "label": "Live", "color": "#F5EFC8"},
        {"id": "completed", "label": "Completed", "color": "#D9F2E5"},
        {"id": "cancelled", "label": "Cancelled", "color": "#F9D7D4"}]}},
      {"external_id": "event-type", "label": "Event type", "type": "category", "position": 3, "config": {"options": [
        {"id": "conference", "label": "Conference", "color": "#DCC8F5"},
        {"id": "webinar", "label": "Webinar", "color": "#CFE8F7"},
        {"id": "workshop", "label": "Workshop", "color": "#F5EFC8"},
        {"id": "social", "label": "Social", "color": "#FBE3C9"}]}},
      {"external_id": "event-date", "label": "Date", "type": "date", "position": 4, "config": {"end_date": true}},
      {"external_id": "venue", "label": "Venue", "type": "location", "position": 5},
      {"external_id": "organizer", "label": "Organizer", "type": "contact", "position": 6},
      {"external_id": "expected-attendees", "label": "Expected attendees", "type": "number", "position": 7},
      {"external_id": "budget", "label": "Budget", "type": "money", "position": 8},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 9,
       "help_text": "Link this event to records in another app — speakers, sponsors or campaign records. Set the target app in Modify Template — it can be in any workspace you belong to."},
      {"external_id": "attachment", "label": "Attachment", "type": "file", "position": 10}
    ],
    "views": [
      {"name": "All events", "layout": "table", "is_default": true, "position": 0},
      {"name": "Calendar", "layout": "calendar", "position": 1},
      {"name": "Board", "layout": "kanban", "position": 2},
      {"name": "Cards", "layout": "card", "position": 3}
    ],
    "automations": [
      {"name": "New event checklist", "trigger": {"type": "item_created"},
       "actions": [{"type": "create_task", "title": "Book venue and confirm date", "due_days": 7}]}
    ],
    "sample_items": [
      {"title": "Annual customer conference", "values": {"event-title": "Annual customer conference", "description": "Two-day flagship conference with keynotes, breakout tracks and an evening reception.", "status": "planning", "event-type": "conference", "event-date": {"start": "2026-09-15", "end": "2026-09-16"}, "expected-attendees": 350, "budget": {"amount": "45000", "currency": "USD"}}},
      {"title": "Product launch webinar", "values": {"event-title": "Product launch webinar", "description": "Live walkthrough of the new release with Q&A. Recording shared afterwards.", "status": "confirmed", "event-type": "webinar", "event-date": {"start": "2026-08-05T16:00:00Z", "end": "2026-08-05T17:00:00Z"}, "expected-attendees": 500, "budget": {"amount": "2000", "currency": "USD"}}},
      {"title": "Summer team offsite", "values": {"event-title": "Summer team offsite", "status": "completed", "event-type": "social", "event-date": {"start": "2026-07-10"}, "expected-attendees": 40, "budget": {"amount": "8000", "currency": "USD"}}}
    ]
  }$ev$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Events' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Events',
       'Organize and manage all your events: statuses, event types, start-end dates, venues, organizers, attendee counts and budgets — with a Related-to field that links events to speakers, sponsors or campaigns in any other app.',
       'events', v_def, 'public', 1);
  end if;
end $$;
