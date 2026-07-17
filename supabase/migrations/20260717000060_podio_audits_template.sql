-- Podio Clone: Migration 60 - "Audits" starter pack in the App Market.
-- Track audits and relate them to the records they cover: status/type/risk
-- categories, auditor contact, start and target-close dates, findings notes,
-- a report attachment — plus a "Related to" relationship field so each audit
-- can be linked to the department, project or account being audited in ANY
-- other app (installer points the field at a target app in Modify Template).
-- Platform template: organization_id null, visibility public. Idempotent by name.
do $$
declare
  v_def jsonb := $au${
    "app": {
      "name": "Audits",
      "icon": "chart",
      "item_name": "Audit",
      "description": "Track audits and relate them to the records they cover — plan them, log findings and drive remediation to close.",
      "usage_instructions": "After installing, open the wrench menu > Modify Template and point the \"Related to\" field at the app whose records get audited — the department, project or account app — in this workspace or any other workspace you are a member of. Linked audits then appear in the Related items section of those records. Use the Board layout to move audits through Planned, In Progress, Findings Review and Closed; the Schedule layout shows start dates on a calendar. When an audit reaches Findings Review, a follow-up task is created automatically to review findings and assign remediation."
    },
    "fields": [
      {"external_id": "audit-title", "label": "Audit", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "description", "label": "Description", "type": "text", "position": 1},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "planned", "label": "Planned", "color": "#CFE8F7"},
        {"id": "in-progress", "label": "In Progress", "color": "#F5EFC8"},
        {"id": "findings-review", "label": "Findings Review", "color": "#FBE3C9"},
        {"id": "closed", "label": "Closed", "color": "#D9F2E5"}]}},
      {"external_id": "audit-type", "label": "Audit type", "type": "category", "position": 3, "config": {"options": [
        {"id": "internal", "label": "Internal", "color": "#CDEDED"},
        {"id": "external", "label": "External", "color": "#CFE8F7"},
        {"id": "compliance", "label": "Compliance", "color": "#DCC8F5"},
        {"id": "financial", "label": "Financial", "color": "#F5EFC8"}]}},
      {"external_id": "auditor", "label": "Auditor", "type": "contact", "position": 4},
      {"external_id": "start-date", "label": "Start date", "type": "date", "position": 5},
      {"external_id": "target-close-date", "label": "Target close date", "type": "date", "position": 6},
      {"external_id": "risk-rating", "label": "Risk rating", "type": "category", "position": 7, "config": {"options": [
        {"id": "low", "label": "Low", "color": "#CDEDED"},
        {"id": "medium", "label": "Medium", "color": "#F5EFC8"},
        {"id": "high", "label": "High", "color": "#F7941D"}]}},
      {"external_id": "findings", "label": "Findings", "type": "text", "position": 8,
       "help_text": "Document what the audit found and the remediation agreed for each finding — owner, action and deadline."},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 9,
       "help_text": "Link this audit to the record it covers — the department, project or account being audited. Set the target app in Modify Template — it can be in any workspace you belong to."},
      {"external_id": "report", "label": "Report", "type": "file", "position": 10}
    ],
    "views": [
      {"name": "All audits", "layout": "table", "is_default": true, "position": 0},
      {"name": "Board", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2},
      {"name": "Schedule", "layout": "calendar", "position": 3}
    ],
    "automations": [
      {"name": "Findings review follow-up", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "findings-review"}],
       "actions": [{"type": "create_task", "title": "Review findings and assign remediation", "due_days": 5}]}
    ],
    "sample_items": [
      {"title": "Q2 internal controls audit", "values": {"audit-title": "Q2 internal controls audit", "description": "Review of purchasing and expense approval controls across the finance team.", "status": "in-progress", "audit-type": "internal", "risk-rating": "medium", "start-date": {"start": "2026-07-06"}, "target-close-date": {"start": "2026-08-14"}}},
      {"title": "Annual external financial audit", "values": {"audit-title": "Annual external financial audit", "description": "Year-end statutory audit performed by the external firm — fieldwork scheduling and PBC list tracking.", "status": "planned", "audit-type": "external", "risk-rating": "high", "start-date": {"start": "2026-09-01"}, "target-close-date": {"start": "2026-10-30"}}},
      {"title": "GDPR compliance audit", "values": {"audit-title": "GDPR compliance audit", "description": "Data-handling and retention practices review for customer records.", "status": "findings-review", "audit-type": "compliance", "risk-rating": "low", "findings": "Two low-risk gaps: retention schedule not applied to legacy exports; missing processing record for the survey tool. Remediation owners assigned.", "start-date": {"start": "2026-06-08"}, "target-close-date": {"start": "2026-07-24"}}}
    ]
  }$au$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Audits' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Audits',
       'Track audits and relate them to the records they cover — statuses, audit types, risk ratings, auditors, findings and report attachments, with a Related-to field that links each audit to the audited app in any workspace.',
       'accounting', v_def, 'public', 1);
  end if;
end $$;
