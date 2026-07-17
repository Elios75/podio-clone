-- Podio Clone: Migration 67 - "Milestones" starter pack in the App Market.
-- Track milestones related to your projects: status/due date/owner/progress,
-- deliverables, a file attachment — plus a "Related to" relationship field so
-- each milestone can be linked to the project (or goal) it belongs to in ANY
-- other app, in this or another workspace; the installer points the field at a
-- target app in Modify Template, and linked milestones then appear in that
-- record's Related items section. Platform template: organization_id null,
-- visibility public. Idempotent by name, same as the migration-41 packs.
do $$
declare
  v_def jsonb := $ms${
    "app": {
      "name": "Milestones",
      "icon": "rocket",
      "item_name": "Milestone",
      "description": "Track milestones related to your projects — statuses, due dates, owners and progress, linked to the project each milestone belongs to.",
      "usage_instructions": "After installing, open the wrench menu > Modify Template and point the \"Related to\" field at your Projects app — it can live in this workspace or any other workspace you are a member of. Linked milestones then show up automatically in the Related items section of each project. Use the Board layout to drag milestones between statuses, and the Timeline view to see due dates on a calendar."
    },
    "fields": [
      {"external_id": "milestone-title", "label": "Milestone", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "description", "label": "Description", "type": "text", "position": 1},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "upcoming", "label": "Upcoming", "color": "#CFE8F7"},
        {"id": "in-progress", "label": "In Progress", "color": "#F5EFC8"},
        {"id": "reached", "label": "Reached", "color": "#D9F2E5"},
        {"id": "missed", "label": "Missed", "color": "#F9D7D4"}]}},
      {"external_id": "due-date", "label": "Due date", "type": "date", "position": 3},
      {"external_id": "owner", "label": "Owner", "type": "contact", "position": 4},
      {"external_id": "progress", "label": "Progress", "type": "progress", "position": 5},
      {"external_id": "deliverables", "label": "Deliverables", "type": "text", "position": 6,
       "help_text": "List what must exist for this milestone to count as reached — documents, releases, sign-offs."},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 7,
       "help_text": "Link this milestone to the project or goal it belongs to. Set the target app in Modify Template — it can be in any workspace you belong to."},
      {"external_id": "attachment", "label": "Attachment", "type": "file", "position": 8}
    ],
    "views": [
      {"name": "All milestones", "layout": "table", "is_default": true, "position": 0},
      {"name": "Board", "layout": "kanban", "position": 1},
      {"name": "Timeline", "layout": "calendar", "position": 2},
      {"name": "Cards", "layout": "card", "position": 3}
    ],
    "automations": [
      {"name": "Missed milestone follow-up", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "missed"}],
       "actions": [{"type": "create_task", "title": "Re-plan missed milestone", "due_days": 2}]}
    ],
    "sample_items": [
      {"title": "Beta launch", "values": {"milestone-title": "Beta launch", "description": "Ship the private beta to the first cohort of pilot customers.", "status": "in-progress", "progress": 60, "due-date": {"start": "2026-07-31"}, "deliverables": "Beta build deployed, onboarding guide published, feedback form live."}},
      {"title": "Requirements sign-off", "values": {"milestone-title": "Requirements sign-off", "description": "Scope frozen and requirements document approved by stakeholders.", "status": "reached", "progress": 100, "due-date": {"start": "2026-07-10"}, "deliverables": "Signed requirements document."}},
      {"title": "Public release", "values": {"milestone-title": "Public release", "description": "General availability announcement and marketing push.", "status": "upcoming", "progress": 0, "due-date": {"start": "2026-09-01"}}}
    ]
  }$ms$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Milestones' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Milestones',
       'Track milestones related to your projects — statuses, owners, due dates and progress, with a Related-to field that links each milestone to its project in any workspace.',
       'project_management', v_def, 'public', 1);
  end if;
end $$;
