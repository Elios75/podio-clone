-- Podio Clone: Migration 62 - "Communication Log" starter pack in the App Market.
-- One log for every call, email and message: type/direction categories, dates,
-- the person who handled it, a summary, follow-up tracking with an automation
-- that creates a task when follow-up is needed, and a "Related to" relationship
-- field so each entry can be linked to the client, deal or case it belongs to
-- (installer points the field at a target app via Modify Template — works
-- across workspaces). Platform template: organization_id null, visibility
-- public. Idempotent by name, same as the migration-54 pack.
do $$
declare
  v_def jsonb := $cl${
    "app": {
      "name": "Communication Log",
      "icon": "mail",
      "item_name": "Entry",
      "description": "Centralize your communications — one log for every call, email and message.",
      "usage_instructions": "Log every touchpoint — calls, emails, texts, meetings and letters — as an Entry so the whole team can see the history in one place. After installing, open the wrench menu > Modify Template and point the \"Related to\" field at your client, deal or case app — it can live in this workspace or any other workspace you are a member of; entries then appear in that record's Related items section. Set \"Follow-up needed\" to Yes on any entry that needs action and a follow-up task is created automatically. Use the \"By type\" board to see communications grouped by channel, and \"Timeline\" to browse them by date."
    },
    "fields": [
      {"external_id": "subject", "label": "Subject", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "type", "label": "Type", "type": "category", "position": 1, "config": {"options": [
        {"id": "call", "label": "Call", "color": "#CFE8F7"},
        {"id": "email", "label": "Email", "color": "#CDEDED"},
        {"id": "text-message", "label": "Text message", "color": "#DCC8F5"},
        {"id": "meeting", "label": "Meeting", "color": "#F5EFC8"},
        {"id": "letter", "label": "Letter", "color": "#FBE3C9"}]}},
      {"external_id": "direction", "label": "Direction", "type": "category", "position": 2, "config": {"options": [
        {"id": "inbound", "label": "Inbound", "color": "#D9F2E5"},
        {"id": "outbound", "label": "Outbound", "color": "#CFE8F7"}]}},
      {"external_id": "date", "label": "Date", "type": "date", "position": 3},
      {"external_id": "contact-person", "label": "Contact person", "type": "text", "position": 4,
       "help_text": "The external party you communicated with."},
      {"external_id": "handled-by", "label": "Handled by", "type": "contact", "position": 5},
      {"external_id": "summary", "label": "Summary", "type": "text", "position": 6,
       "help_text": "Capture what was discussed and anything that was agreed or promised, so the next person picking up the thread has the full picture."},
      {"external_id": "follow-up-needed", "label": "Follow-up needed", "type": "category", "position": 7, "config": {"options": [
        {"id": "yes", "label": "Yes", "color": "#F9D7D4"},
        {"id": "no", "label": "No", "color": "#D9F2E5"}]}},
      {"external_id": "follow-up-date", "label": "Follow-up date", "type": "date", "position": 8},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 9,
       "help_text": "Link this entry to the client, deal or case it belongs to. Set the target app in Modify Template — it can be in any workspace you belong to."},
      {"external_id": "attachment", "label": "Attachment", "type": "file", "position": 10}
    ],
    "views": [
      {"name": "All entries", "layout": "table", "is_default": true, "position": 0},
      {"name": "By type", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2},
      {"name": "Timeline", "layout": "calendar", "position": 3}
    ],
    "automations": [
      {"name": "Follow-up task", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "follow-up-needed", "op": "equals", "value": "yes"}],
       "actions": [{"type": "create_task", "title": "Follow up on communication", "due_days": 2}]}
    ],
    "sample_items": [
      {"title": "Intro call with Acme Corp", "values": {"subject": "Intro call with Acme Corp", "type": "call", "direction": "outbound", "date": {"start": "2026-07-20"}, "contact-person": "Jane Miller (Acme Corp)", "summary": "Walked through our onboarding offer. Jane wants a written proposal covering the premium tier before their board meeting.", "follow-up-needed": "yes", "follow-up-date": {"start": "2026-07-22"}}},
      {"title": "Contract questions", "values": {"subject": "Contract questions", "type": "email", "direction": "inbound", "date": {"start": "2026-07-21"}, "contact-person": "Tom Reyes (Northwind)", "summary": "Tom asked about the renewal clause and data-processing terms. Replied with the standard addendum and offered a call if anything is unclear.", "follow-up-needed": "no"}},
      {"title": "Quarterly review meeting", "values": {"subject": "Quarterly review meeting", "type": "meeting", "direction": "outbound", "date": {"start": "2026-07-24"}, "contact-person": "Priya Shah (Globex)", "summary": "Reviewed Q2 usage and agreed to pilot the reporting add-on next month.", "follow-up-needed": "no"}}
    ]
  }$cl$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Communication Log' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Communication Log',
       'Centralize your communications — one shared log for every call, email, text, meeting and letter, with follow-up tracking and a Related-to field that links each entry to the client, deal or case it belongs to.',
       'crm', v_def, 'public', 1);
  end if;
end $$;
