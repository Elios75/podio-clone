-- Podio Clone: Migration 61 - "Appointments" starter pack in the App Market.
-- Client-facing scheduling: appointment title, start/end date, status chips,
-- client name + phone (external people, not workspace members), an assigned
-- workspace contact, a location, notes — plus a "Related to" relationship
-- field so each appointment can be linked to the property, client or case
-- record it is about, in any other app (the installer points the field at a
-- target app in Modify Template; works across workspaces).
-- Platform template: organization_id null, visibility public. Idempotent by name.
do $$
declare
  v_def jsonb := $ap${
    "app": {
      "name": "Appointments",
      "icon": "event",
      "item_name": "Appointment",
      "description": "Keep track of meetings and appointments with clients — who, when, where, and how it went.",
      "usage_instructions": "The Calendar view is the main surface: open it to see every appointment plotted on its start/end time and click a slot to jump into the record. After installing, open the wrench menu > Modify Template and point the \"Related to\" field at the app whose records your appointments belong to — the property, client or case app — in this workspace or any other workspace you are a member of. Linked appointments then show up in the Related items section of those records. When an appointment is created, an automation adds a follow-up task to confirm it with the client the next day."
    },
    "fields": [
      {"external_id": "appointment-title", "label": "Appointment", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "date", "label": "Date", "type": "date", "position": 1, "config": {"end_date": true}},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "scheduled", "label": "Scheduled", "color": "#CFE8F7"},
        {"id": "confirmed", "label": "Confirmed", "color": "#D9F2E5"},
        {"id": "completed", "label": "Completed", "color": "#DCC8F5"},
        {"id": "no-show", "label": "No-show", "color": "#F9D7D4"},
        {"id": "cancelled", "label": "Cancelled", "color": "#FBE3C9"}]}},
      {"external_id": "client-name", "label": "Client name", "type": "text", "position": 3,
       "help_text": "The external person this appointment is with — not a workspace member."},
      {"external_id": "client-phone", "label": "Client phone", "type": "phone", "position": 4},
      {"external_id": "assigned-to", "label": "Assigned to", "type": "contact", "position": 5},
      {"external_id": "location", "label": "Location", "type": "location", "position": 6},
      {"external_id": "notes", "label": "Notes", "type": "text", "position": 7},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 8,
       "help_text": "Link this appointment to the property, client or case record it is about. Set the target app in Modify Template — it can be in any workspace you belong to."}
    ],
    "views": [
      {"name": "All appointments", "layout": "table", "is_default": true, "position": 0},
      {"name": "Calendar", "layout": "calendar", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2}
    ],
    "automations": [
      {"name": "Confirm new appointment", "trigger": {"type": "item_created"},
       "actions": [{"type": "create_task", "title": "Confirm appointment with client", "due_days": 1}]}
    ],
    "sample_items": [
      {"title": "Kitchen remodel walkthrough", "values": {"appointment-title": "Kitchen remodel walkthrough", "date": {"start": "2026-07-20T14:30:00Z", "end": "2026-07-20T15:30:00Z"}, "status": "confirmed", "client-name": "Maria Duarte", "client-phone": "+1 555 014 2298", "notes": "Bring the revised cabinet quote and tile samples."}},
      {"title": "Initial consultation - Nguyen file", "values": {"appointment-title": "Initial consultation - Nguyen file", "date": {"start": "2026-07-22T09:00:00Z", "end": "2026-07-22T09:45:00Z"}, "status": "scheduled", "client-name": "Peter Nguyen", "client-phone": "+1 555 031 8874"}},
      {"title": "Quarterly portfolio review", "values": {"appointment-title": "Quarterly portfolio review", "date": {"start": "2026-07-15T11:00:00Z", "end": "2026-07-15T12:00:00Z"}, "status": "completed", "client-name": "Sandra Okafor", "notes": "Went well — client asked for a follow-up proposal by end of month."}}
    ]
  }$ap$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Appointments' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Appointments',
       'Keep track of meetings and appointments — start/end times on a calendar, status from Scheduled to Completed, client contact details, an assigned owner and a Related-to link to the record each appointment is about.',
       'scheduling', v_def, 'public', 1);
  end if;
end $$;
