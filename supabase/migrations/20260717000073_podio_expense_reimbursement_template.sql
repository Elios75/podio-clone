-- Podio Clone: Migration 73 - "Expense Reimbursement" starter pack in the App Market.
-- The employee-claim sibling of the general Expenses app: an employee submits a
-- claim with a receipt photo, a manager reviews it on the Approval board, and
-- finance marks it Paid. Status sits before Claim category in position order so
-- the kanban Approval board auto-groups by Status. Includes a "Related to"
-- relationship field the installer points at a project/client app via Modify
-- Template (works across workspaces). Platform template: organization_id null,
-- visibility public. Idempotent by name, same as the migration-41 packs.
do $$
declare
  v_def jsonb := $er${
    "app": {
      "name": "Expense Reimbursement",
      "icon": "cart",
      "item_name": "Reimbursement",
      "description": "Expense Reimbursement — track employee expense claims from submission through approval to payout.",
      "usage_instructions": "Employees submit a claim with the amount, expense date, claim category and a photo or scan of the receipt in the Receipt field. Managers review claims on the Approval board and drag them from Submitted through Manager Review to Approved (or Rejected); when a claim hits Approved, an automation creates an \"Issue reimbursement payment\" task so finance can pay it out and drag the card to Paid. After installing, open the wrench menu > Modify Template and point the \"Related to\" field at your Projects or Clients app — it can live in this workspace or any other workspace you are a member of — so each claim links back to the work it was for."
    },
    "fields": [
      {"external_id": "reimbursement", "label": "Reimbursement", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "employee", "label": "Employee", "type": "contact", "position": 1},
      {"external_id": "amount", "label": "Amount", "type": "money", "position": 2},
      {"external_id": "expense-date", "label": "Expense date", "type": "date", "position": 3},
      {"external_id": "status", "label": "Status", "type": "category", "position": 4, "config": {"options": [
        {"id": "submitted", "label": "Submitted", "color": "#CFE8F7"},
        {"id": "manager-review", "label": "Manager Review", "color": "#F5EFC8"},
        {"id": "approved", "label": "Approved", "color": "#D9F2E5"},
        {"id": "paid", "label": "Paid", "color": "#DCC8F5"},
        {"id": "rejected", "label": "Rejected", "color": "#F9D7D4"}]}},
      {"external_id": "claim-category", "label": "Claim category", "type": "category", "position": 5, "config": {"options": [
        {"id": "mileage", "label": "Mileage", "color": "#CFE8F7"},
        {"id": "travel", "label": "Travel", "color": "#CDEDED"},
        {"id": "meals", "label": "Meals", "color": "#F5EFC8"},
        {"id": "supplies", "label": "Supplies", "color": "#D9F2E5"},
        {"id": "other", "label": "Other", "color": "#FBE3C9"}]}},
      {"external_id": "receipt", "label": "Receipt", "type": "image", "position": 6,
       "help_text": "Photo or scan of the receipt."},
      {"external_id": "manager", "label": "Manager", "type": "contact", "position": 7,
       "help_text": "Who approves this claim."},
      {"external_id": "notes", "label": "Notes", "type": "text", "position": 8},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 9,
       "help_text": "Link this claim to the project or client the expense was for. Set the target app in Modify Template — it can be in any workspace you belong to."}
    ],
    "views": [
      {"name": "All claims", "layout": "table", "is_default": true, "position": 0},
      {"name": "Approval board", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2}
    ],
    "automations": [
      {"name": "Approved payout task", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "approved"}],
       "actions": [{"type": "create_task", "title": "Issue reimbursement payment", "due_days": 3}]}
    ],
    "sample_items": [
      {"title": "Client visit mileage — July", "values": {"reimbursement": "Client visit mileage — July", "amount": {"amount": "86.40", "currency": "USD"}, "expense-date": {"start": "2026-07-10"}, "status": "manager-review", "claim-category": "mileage", "notes": "144 miles round trip at the standard rate for the on-site kickoff."}},
      {"title": "Team lunch with vendor", "values": {"reimbursement": "Team lunch with vendor", "amount": {"amount": "62.15", "currency": "USD"}, "expense-date": {"start": "2026-07-14"}, "status": "submitted", "claim-category": "meals", "notes": "Working lunch to review the delivery schedule; receipt attached."}},
      {"title": "Conference flight to Denver", "values": {"reimbursement": "Conference flight to Denver", "amount": {"amount": "418.90", "currency": "USD"}, "expense-date": {"start": "2026-06-30"}, "status": "approved", "claim-category": "travel"}}
    ]
  }$er$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Expense Reimbursement' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Expense Reimbursement',
       'Expense Reimbursement — employee expense claims from submission to payout: submit with a receipt, route through manager approval, and track payment.',
       'accounting', v_def, 'public', 1);
  end if;
end $$;
