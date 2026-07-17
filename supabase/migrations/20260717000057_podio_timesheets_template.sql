-- Podio Clone: Migration 57 - "Timesheets" starter pack in the App Market.
-- Employee time tracking: what was worked on, who worked, when, for how long
-- (duration), work type and billable status, hourly rate, plus a "Project"
-- relationship field the installer points at their Projects app in Modify
-- Template (works across workspaces). Platform template: organization_id null,
-- visibility public. Idempotent by name, same as the migration-54 pack.
do $$
declare
  v_def jsonb := $ts${
    "app": {
      "name": "Timesheets",
      "icon": "chart",
      "item_name": "Entry",
      "description": "Keep track of employee work.",
      "usage_instructions": "Log one entry per person per task or day: what was worked on, the date, and the hours as a duration. After installing, open the wrench menu > Modify Template and point the \"Project\" field at your Projects app — it can live in this workspace or any other workspace you are a member of — so entries roll up under each project's Related items. Use the Calendar view to see logged days and the Work type chips to separate Regular, Overtime and PTO time."
    },
    "fields": [
      {"external_id": "entry", "label": "Entry", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "person", "label": "Person", "type": "contact", "position": 1},
      {"external_id": "date", "label": "Date", "type": "date", "position": 2},
      {"external_id": "hours", "label": "Hours", "type": "duration", "position": 3},
      {"external_id": "work-type", "label": "Work type", "type": "category", "position": 4, "config": {"options": [
        {"id": "regular", "label": "Regular", "color": "#CFE8F7"},
        {"id": "overtime", "label": "Overtime", "color": "#FBE3C9"},
        {"id": "pto", "label": "PTO", "color": "#DCC8F5"}]}},
      {"external_id": "billable", "label": "Billable", "type": "category", "position": 5, "config": {"options": [
        {"id": "billable", "label": "Billable", "color": "#D9F2E5"},
        {"id": "non-billable", "label": "Non-billable", "color": "#F9D7D4"}]}},
      {"external_id": "project", "label": "Project", "type": "relationship", "position": 6,
       "help_text": "Link this entry to the project it was worked on. Point this field at your Projects app in Modify Template — it can be in any workspace you belong to."},
      {"external_id": "hourly-rate", "label": "Hourly rate", "type": "money", "position": 7},
      {"external_id": "notes", "label": "Notes", "type": "text", "position": 8}
    ],
    "views": [
      {"name": "All entries", "layout": "table", "is_default": true, "position": 0},
      {"name": "Calendar", "layout": "calendar", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2}
    ],
    "automations": [
      {"name": "Project link reminder", "trigger": {"type": "item_created"},
       "actions": [{"type": "add_comment", "body": "Entry logged — remember to link it to a project so the hours roll up under the right record."}]}
    ],
    "sample_items": [
      {"title": "Homepage redesign build-out", "values": {"entry": "Homepage redesign build-out", "date": {"start": "2026-07-20"}, "hours": 14400, "work-type": "regular", "billable": "billable", "hourly-rate": {"amount": "95", "currency": "USD"}, "notes": "Implemented the new hero section and responsive nav."}},
      {"title": "Late deploy support", "values": {"entry": "Late deploy support", "date": {"start": "2026-07-21"}, "hours": 7200, "work-type": "overtime", "billable": "billable", "hourly-rate": {"amount": "120", "currency": "USD"}, "notes": "Stayed on after hours to monitor the release and roll back one migration."}},
      {"title": "Vacation day", "values": {"entry": "Vacation day", "date": {"start": "2026-07-22"}, "hours": 28800, "work-type": "pto", "billable": "non-billable"}}
    ]
  }$ts$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Timesheets' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Timesheets',
       'Keep track of employee work.',
       'productivity', v_def, 'public', 1);
  end if;
end $$;
