-- Podio Clone: Migration 64 - "Cases" starter pack in the App Market.
-- Legal case tracking: case number, status/practice-area categories, a Client
-- relationship field the installer points at their Contacts/CRM app, lead
-- attorney, key dates (opened / next hearing), court location, notes and
-- documents. Platform template: organization_id null, visibility public.
-- Idempotent by name, same as the migration-54 pack.
do $$
declare
  v_def jsonb := $cs${
    "app": {
      "name": "Cases",
      "icon": "doc",
      "item_name": "Case",
      "description": "Track the details of your cases in one place — status, hearings, clients, attorneys and documents.",
      "usage_instructions": "After installing, open the wrench menu > Modify Template and point the \"Client\" field at your Contacts or CRM app — it can live in this workspace or any other workspace you are a member of, and each case then appears in the Related items section of the linked client. Use the Hearings calendar to keep upcoming court dates in view, drag cases across the Board as they move from Open to Closed, and keep every filing and exhibit attached to its case in the Documents field so nothing lives in email."
    },
    "fields": [
      {"external_id": "case-title", "label": "Case", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "case-number", "label": "Case number", "type": "text", "position": 1},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "open", "label": "Open", "color": "#CFE8F7"},
        {"id": "discovery", "label": "Discovery", "color": "#F5EFC8"},
        {"id": "hearing", "label": "Hearing", "color": "#FBE3C9"},
        {"id": "settlement", "label": "Settlement", "color": "#DCC8F5"},
        {"id": "closed", "label": "Closed", "color": "#D9F2E5"}]}},
      {"external_id": "practice-area", "label": "Practice area", "type": "category", "position": 3, "config": {"options": [
        {"id": "civil", "label": "Civil", "color": "#CDEDED"},
        {"id": "criminal", "label": "Criminal", "color": "#F9D7D4"},
        {"id": "family", "label": "Family", "color": "#DCC8F5"},
        {"id": "corporate", "label": "Corporate", "color": "#CFE8F7"}]}},
      {"external_id": "client", "label": "Client", "type": "relationship", "position": 4,
       "help_text": "Link the case to a client record. Point this field at your Contacts or CRM app in Modify Template — it can be in any workspace you belong to."},
      {"external_id": "lead-attorney", "label": "Lead attorney", "type": "contact", "position": 5},
      {"external_id": "opened", "label": "Opened", "type": "date", "position": 6},
      {"external_id": "next-hearing", "label": "Next hearing", "type": "date", "position": 7},
      {"external_id": "court", "label": "Court", "type": "location", "position": 8},
      {"external_id": "case-notes", "label": "Case notes", "type": "text", "position": 9},
      {"external_id": "documents", "label": "Documents", "type": "file", "position": 10}
    ],
    "views": [
      {"name": "All cases", "layout": "table", "is_default": true, "position": 0},
      {"name": "Board", "layout": "kanban", "position": 1},
      {"name": "Hearings", "layout": "calendar", "position": 2},
      {"name": "Cards", "layout": "card", "position": 3}
    ],
    "automations": [
      {"name": "New case intake", "trigger": {"type": "item_created"},
       "actions": [{"type": "create_task", "title": "Open case file and conflict check", "due_days": 2}]}
    ],
    "sample_items": [
      {"title": "Acme Corp v. Example Industries", "values": {"case-title": "Acme Corp v. Example Industries", "case-number": "CV-2026-00123", "status": "discovery", "practice-area": "corporate", "opened": {"start": "2026-05-04"}, "next-hearing": {"start": "2026-08-12"}, "case-notes": "Fictional contract dispute over a widget supply agreement. Document requests served; responses due end of month."}},
      {"title": "In re Doe Family Trust", "values": {"case-title": "In re Doe Family Trust", "case-number": "PR-2026-00456", "status": "hearing", "practice-area": "family", "opened": {"start": "2026-03-17"}, "next-hearing": {"start": "2026-07-28"}, "case-notes": "Fictional probate matter. Prepare trustee accounting exhibits before the status hearing."}},
      {"title": "State v. J. Placeholder", "values": {"case-title": "State v. J. Placeholder", "case-number": "CR-2026-00789", "status": "open", "practice-area": "criminal", "opened": {"start": "2026-06-22"}, "case-notes": "Fictional misdemeanor defense. Awaiting discovery packet from the prosecution; arraignment complete."}}
    ]
  }$cs$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Cases' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Cases',
       'Track the details of your cases in one place — statuses from Open through Closed, practice areas, hearing dates on a calendar, court locations, and a Client field that links each case to your Contacts app in any workspace.',
       'legal', v_def, 'public', 1);
  end if;
end $$;
