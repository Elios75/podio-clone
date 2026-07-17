-- Podio Clone: Migration 58 - "Expenses" starter pack in the App Market.
-- Track, submit and approve business expenses: amount, date, approval status,
-- spend category, payer, receipt image — plus a "Related to" relationship
-- field so expenses can be linked to a project or client record in ANY other
-- app (same or other workspace; the installer points the field at a target
-- app in Modify Template). Status is the first single-select category field,
-- so the "Approval board" kanban groups by it. Platform template:
-- organization_id null, visibility public. Idempotent by name.
do $$
declare
  v_def jsonb := $ex${
    "app": {
      "name": "Expenses",
      "icon": "cart",
      "item_name": "Expense",
      "description": "Track, submit and approve business expenses — from receipt to reimbursement.",
      "usage_instructions": "Log each expense with its amount, date and category, and snap the receipt into the Receipt field. Use the Approval board to drag expenses through the flow: Submitted > Approved > Reimbursed (or Rejected). When an expense is marked Approved, an automation creates a \"Process reimbursement\" task due in 3 days. To link expenses to a project or client, open the wrench menu > Modify Template and point the \"Related to\" field at the target app — it can live in this workspace or any other workspace you are a member of; linked expenses then appear in that record's Related items section."
    },
    "fields": [
      {"external_id": "expense-title", "label": "Expense", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "amount", "label": "Amount", "type": "money", "position": 1},
      {"external_id": "expense-date", "label": "Date", "type": "date", "position": 2},
      {"external_id": "status", "label": "Status", "type": "category", "position": 3, "config": {"options": [
        {"id": "submitted", "label": "Submitted", "color": "#CFE8F7"},
        {"id": "approved", "label": "Approved", "color": "#D9F2E5"},
        {"id": "reimbursed", "label": "Reimbursed", "color": "#DCC8F5"},
        {"id": "rejected", "label": "Rejected", "color": "#F9D7D4"}]}},
      {"external_id": "expense-category", "label": "Expense category", "type": "category", "position": 4, "config": {"options": [
        {"id": "travel", "label": "Travel", "color": "#CFE8F7"},
        {"id": "meals", "label": "Meals", "color": "#F5EFC8"},
        {"id": "supplies", "label": "Supplies", "color": "#D9F2E5"},
        {"id": "software", "label": "Software", "color": "#CDEDED"},
        {"id": "other", "label": "Other", "color": "#FBE3C9"}]}},
      {"external_id": "paid-by", "label": "Paid by", "type": "contact", "position": 5},
      {"external_id": "receipt", "label": "Receipt", "type": "image", "position": 6,
       "help_text": "Snap or upload the receipt."},
      {"external_id": "related-to", "label": "Related to", "type": "relationship", "position": 7,
       "help_text": "Link this expense to a project or client record in another app. Set the target app in Modify Template — it can be in any workspace you belong to."},
      {"external_id": "notes", "label": "Notes", "type": "text", "position": 8}
    ],
    "views": [
      {"name": "All expenses", "layout": "table", "is_default": true, "position": 0},
      {"name": "Approval board", "layout": "kanban", "position": 1},
      {"name": "Cards", "layout": "card", "position": 2}
    ],
    "automations": [
      {"name": "Reimbursement follow-up", "trigger": {"type": "item_updated"},
       "conditions": [{"field_external_id": "status", "op": "equals", "value": "approved"}],
       "actions": [{"type": "create_task", "title": "Process reimbursement", "due_days": 3}]}
    ],
    "sample_items": [
      {"title": "Client lunch — Riverside Cafe", "values": {"expense-title": "Client lunch — Riverside Cafe", "amount": {"amount": "86.40", "currency": "USD"}, "expense-date": {"start": "2026-07-14"}, "status": "submitted", "expense-category": "meals", "notes": "Lunch with the Acme team to review the Q3 renewal."}},
      {"title": "Flight to Denver — sales kickoff", "values": {"expense-title": "Flight to Denver — sales kickoff", "amount": {"amount": "412.90", "currency": "USD"}, "expense-date": {"start": "2026-07-08"}, "status": "approved", "expense-category": "travel", "notes": "Round trip, economy. Booked through the company portal."}},
      {"title": "Figma annual license", "values": {"expense-title": "Figma annual license", "amount": {"amount": "144.00", "currency": "USD"}, "expense-date": {"start": "2026-07-01"}, "status": "reimbursed", "expense-category": "software"}}
    ]
  }$ex$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Expenses' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Expenses',
       'Track, submit and approve business expenses: amounts, dates, spend categories, receipts and an approval Board — with a Related-to field that links each expense to a project or client record in any other app.',
       'accounting', v_def, 'public', 1);
  end if;
end $$;
