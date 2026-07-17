-- Podio Clone: Migration 65 - "Annual Goals" starter pack in the App Market.
-- Plan and track annual goals: status/year/owner, target date, progress and
-- key results — plus a "Related to" relationship field so each goal can be
-- linked to the quarterly goals or projects that roll up to it (installer
-- points the field at a target app via Modify Template; works across
-- workspaces). Platform template: organization_id null, visibility public.
-- Idempotent by name, same as the migration-41 packs.
do $$
declare
  v_def jsonb := $ag${
    "app": {
      "name": "Annual Goals",
      "icon": "map",
      "item_name": "Goal",
      "description": "Plan and track your annual goals",
      "usage_instructions": "Set your goals at the start of the year, one item per goal, and give each a Year, an Owner and a Target date. Write 2-4 measurable outcomes in Key results so you can tell whether the goal was achieved. Check in quarterly: update Progress and move the goal between statuses on the Board (Not Started, On Track, At Risk, Achieved, Missed). To connect goals to the work that delivers them, open the wrench menu > Modify Template and point the \"Related to\" field at a Quarterly Goals or Projects app — it can live in this workspace or any other workspace you are a member of; linked records then show this goal in their Related items section."
    },
    "fields": [
      {"external_id": "goal-title", "label": "Goal", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "description", "label": "Description", "type": "text", "position": 1},
      {"external_id": "status", "label": "Status", "type": "category", "position": 2, "config": {"options": [
        {"id": "not-started", "label": "Not Started", "color": "#CFE8F7"},
        {"id": "on-track", "label": "On Track", "color": "#D9F2E5"},
        {"id": "at-risk", "label": "At Risk", "color": "#FBE3C9"},
        {"id": "achieved", "label": "Achieved", "color": "#DCC8F5"},
        {"id": "missed", "label": "Missed", "color": "#F9D7D4"}]}},
      {"external_id": "year", "label": "Year", "type": "number", "position": 3},
      {"external_id": "owner", "label": "Owner", "type": "contact", "position": 4},
      {"external_id": "target-date", "label": "Target date", "type": "date", "position": 5},
      {"external_id": "progress", "label": "Progress", "type": "progress", "position": 6},
      {"external_id": "key-results", "label": "Key results", "type": "text", "position": 7,
       "help_text": "List 2-4 measurable outcomes that define success for this goal — numbers you can check at year end."},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 8,
       "help_text": "Link the quarterly goals or projects that roll up to this goal. Set the target app in Modify Template — it can be in any workspace you belong to."}
    ],
    "views": [
      {"name": "All goals", "layout": "table", "is_default": true, "position": 0},
      {"name": "Board", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2},
      {"name": "Target dates", "layout": "calendar", "position": 3}
    ],
    "automations": [
      {"name": "Goal achieved", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "achieved"}],
       "actions": [{"type": "add_comment", "body": "Goal achieved — congratulations! Take a moment to capture what worked and any learnings for next year's planning."}]}
    ],
    "sample_items": [
      {"title": "Grow annual revenue 20%", "values": {"goal-title": "Grow annual revenue 20%", "description": "Expand into two new regions and increase renewals to hit the growth target.", "status": "on-track", "year": 2026, "progress": 55, "target-date": {"start": "2026-12-31"}, "key-results": "1) $6M ARR by Q4. 2) Two new regions live. 3) Renewal rate above 92%."}},
      {"title": "Launch the mobile app", "values": {"goal-title": "Launch the mobile app", "description": "Ship v1 of the mobile app on both stores with feature parity for core workflows.", "status": "at-risk", "year": 2026, "progress": 30, "target-date": {"start": "2026-10-15"}, "key-results": "1) Beta with 200 users by August. 2) App Store + Play Store launch by mid-October. 3) 4.5+ average rating."}},
      {"title": "Achieve SOC 2 Type II", "values": {"goal-title": "Achieve SOC 2 Type II", "description": "Complete the observation window and audit to unlock enterprise deals.", "status": "not-started", "year": 2026, "progress": 0, "target-date": {"start": "2026-11-30"}, "key-results": "1) Controls implemented by Q3. 2) Six-month observation window completed. 3) Clean audit report delivered."}}
    ]
  }$ag$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Annual Goals' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Annual Goals',
       'Plan and track your annual goals',
       'productivity', v_def, 'public', 1);
  end if;
end $$;
