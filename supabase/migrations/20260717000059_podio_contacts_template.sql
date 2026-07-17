-- Podio Clone: Migration 59 - "Contacts" starter pack in the App Market.
-- A shared address book for people and companies: name, company, job title,
-- a Type category (Lead/Customer/Vendor/Partner), email, phone, website,
-- address, photo and notes. No automations — an address book should stay
-- quiet. Other apps can add a relationship field pointing at this app (from
-- any workspace) so their records link to these contacts.
-- Platform template: organization_id null, visibility public.
-- Idempotent by name, same as the migration-41 packs.
do $$
declare
  v_def jsonb := $ct${
    "app": {
      "name": "Contacts",
      "icon": "contact",
      "item_name": "Contact",
      "description": "A great global contact app",
      "usage_instructions": "Use this app as your team's shared address book for people and companies. Set each contact's Type (Lead, Customer, Vendor or Partner) to keep the list easy to filter. To link records in other apps to these contacts, open that app's wrench menu > Modify Template and add a relationship field pointing at this Contacts app — it works from any workspace you are a member of, and linked records then appear in each contact's Related items section. The Badges layout gives you a quick who's-who wall; Cards works well for browsing with photos."
    },
    "fields": [
      {"external_id": "name", "label": "Name", "type": "text", "is_primary": true, "is_required": true, "position": 0},
      {"external_id": "company", "label": "Company", "type": "text", "position": 1},
      {"external_id": "job-title", "label": "Job title", "type": "text", "position": 2},
      {"external_id": "type", "label": "Type", "type": "category", "position": 3, "config": {"options": [
        {"id": "lead", "label": "Lead", "color": "#F5EFC8"},
        {"id": "customer", "label": "Customer", "color": "#D9F2E5"},
        {"id": "vendor", "label": "Vendor", "color": "#CFE8F7"},
        {"id": "partner", "label": "Partner", "color": "#DCC8F5"}]}},
      {"external_id": "email", "label": "Email", "type": "email", "position": 4},
      {"external_id": "phone", "label": "Phone", "type": "phone", "position": 5},
      {"external_id": "website", "label": "Website", "type": "link", "position": 6},
      {"external_id": "address", "label": "Address", "type": "location", "position": 7},
      {"external_id": "photo", "label": "Photo", "type": "image", "position": 8},
      {"external_id": "notes", "label": "Notes", "type": "text", "position": 9}
    ],
    "views": [
      {"name": "All contacts", "layout": "table", "is_default": true, "position": 0},
      {"name": "Cards", "layout": "card", "position": 1},
      {"name": "Badges", "layout": "badge", "position": 2}
    ],
    "automations": [],
    "sample_items": [
      {"title": "Ada Byron", "values": {"name": "Ada Byron", "company": "Example Analytics Ltd", "job-title": "Head of Data", "type": "customer", "email": "ada.byron@example.com", "phone": "+1 555 0142", "website": "https://analytics.example.com", "notes": "Prefers email over phone. Renewal conversation due next quarter."}},
      {"title": "Marco Reyes", "values": {"name": "Marco Reyes", "company": "Example Logistics Co", "job-title": "Operations Manager", "type": "vendor", "email": "marco.reyes@example.com", "phone": "+1 555 0187", "website": "https://logistics.example.com", "notes": "Handles our shipping account. Ask for Marco directly for rush orders."}},
      {"title": "Priya Nair", "values": {"name": "Priya Nair", "company": "Example Studio", "job-title": "Founder", "type": "lead", "email": "priya@example.com", "phone": "+1 555 0119", "website": "https://studio.example.com", "notes": "Met at the spring trade show — interested in a pilot in the autumn."}}
    ]
  }$ct$::jsonb;
begin
  if not exists (
    select 1 from podio.app_templates
    where name = 'Contacts' and organization_id is null
  ) then
    insert into podio.app_templates
      (organization_id, name, description, category, definition, visibility, version)
    values
      (null, 'Contacts',
       'A great global contact app — a shared address book for people and companies, with type chips, email, phone, website, address and photo. Point relationship fields from any other app at it to link records to these contacts.',
       'crm', v_def, 'public', 1);
  end if;
end $$;
