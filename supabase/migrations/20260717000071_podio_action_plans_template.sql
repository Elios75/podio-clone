-- Podio Clone: Migration 71 - "Action Plans" starter pack in the App Market.
-- Departmental action plans that cascade overarching goals into concrete
-- steps: department, objective, status board, owner, start/target dates,
-- progress and key actions — plus a "Related to" relationship field so each
-- plan can roll up to the Annual Goals (or any other) app the installer
-- points it at in Modify Template (works across workspaces).
-- Platform template: organization_id null, visibility public.
-- Idempotent by name, same as the migration-54 pack.
do $$
declare
  v_def jsonb := $apl${
    "app": {
      "name": "Action Plans",
      "icon": "link",
      "item_name": "Action Plan",
      "description": "Set the overarching goals for departments and break them down into concrete, trackable action plans.",
      "usage_instructions": "Create one action plan per department per period (quarter or year). To cascade plans from your company goals, open the wrench menu > Modify Template and point the \"Related to\" field at your Annual Goals app — it can live in this workspace or any other workspace you are a member of; each plan then appears in the Related items section of the goal it delivers. Use the Board layout to move plans between statuses, and review the Progress field with each department owner monthly."
    },
    "fields": [
      {"external_id": "action-plan", "label": "Action plan", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "department", "label": "Department", "type": "text", "position": 1},
      {"external_id": "objective", "label": "Objective", "type": "text", "position": 2,
       "help_text": "The overarching goal this plan delivers."},
      {"external_id": "status", "label": "Status", "type": "category", "position": 3, "config": {"options": [
        {"id": "draft", "label": "Draft", "color": "#CFE8F7"},
        {"id": "active", "label": "Active", "color": "#CDEDED"},
        {"id": "on-track", "label": "On Track", "color": "#D9F2E5"},
        {"id": "behind", "label": "Behind", "color": "#FBE3C9"},
        {"id": "completed", "label": "Completed", "color": "#DCC8F5"}]}},
      {"external_id": "owner", "label": "Owner", "type": "contact", "position": 4},
      {"external_id": "start-date", "label": "Start date", "type": "date", "position": 5},
      {"external_id": "target-date", "label": "Target date", "type": "date", "position": 6},
      {"external_id": "progress", "label": "Progress", "type": "progress", "position": 7},
      {"external_id": "key-actions", "label": "Key actions", "type": "text", "position": 8,
       "help_text": "The concrete steps, owners and deadlines that make up this plan."},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 9,
       "help_text": "Link this plan to the record it rolls up to — e.g. the Annual Goals it delivers. Set the target app in Modify Template; it can be in any workspace you belong to."}
    ],
    "views": [
      {"name": "All plans", "layout": "table", "is_default": true, "position": 0},
      {"name": "Board", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2},
      {"name": "Timeline", "layout": "calendar", "position": 3}
    ],
    "automations": [
      {"name": "Behind-schedule review", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "behind"}],
       "actions": [{"type": "create_task", "title": "Review action plan and unblock", "due_days": 3}]}
    ],
    "sample_items": [
      {"title": "Grow qualified pipeline 30%", "values": {"action-plan": "Grow qualified pipeline 30%", "department": "Sales", "objective": "Hit the FY26 revenue target by widening the top of the funnel.", "status": "on-track", "progress": 55, "start-date": {"start": "2026-07-01"}, "target-date": {"start": "2026-09-30"}, "key-actions": "Launch two outbound sequences (SDR lead, by Jul 31). Refresh pricing page (Marketing, by Aug 15). Weekly pipeline review every Monday."}},
      {"title": "Cut onboarding time to 2 weeks", "values": {"action-plan": "Cut onboarding time to 2 weeks", "department": "People Ops", "objective": "New hires productive within their first sprint.", "status": "behind", "progress": 25, "start-date": {"start": "2026-07-20"}, "target-date": {"start": "2026-10-15"}, "key-actions": "Publish role playbooks (managers, by Aug 30). Automate account provisioning (IT, by Sep 15). Assign onboarding buddies from day one."}},
      {"title": "Ship self-serve reporting", "values": {"action-plan": "Ship self-serve reporting", "department": "Product", "objective": "Reduce ad-hoc reporting requests to support by 50%.", "status": "draft", "progress": 0, "target-date": {"start": "2026-12-18"}}}
    ]
  }$apl$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Action Plans' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Action Plans',
       'Set the overarching goals for departments and cascade them into concrete action plans — with owners, target dates, a status board and a Related-to field that rolls each plan up to your Annual Goals app in any workspace.',
       'hr', v_def, 'public', 1);
  end if;
end $$;
