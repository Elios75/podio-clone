// Podio -> podio-clone mapping layer (pure, no I/O).
//
// Translates real Podio API JSON (apps, items, comments, tasks) into the
// shapes our schema consumes:
//   - apps / app_fields rows (mapApp)
//   - write_values-ready value maps keyed by field external_id (mapItemValues)
//   - comments / tasks (mapComment / mapTask)
//
// Everything that cannot be mapped faithfully is DROPPED (never invented) and
// reported through the `notes` channels so the import report can surface it.

// ---------------------------------------------------------------------------
// Helpers

// Mirror of src/lib/slug.ts slugify().
export function slugify(name) {
  return String(name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Podio timestamps are UTC strings like "2015-03-12 03:32:15" (or date-only).
function podioDateToIso(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t; // date-only: keep as-is
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(t)) {
    return t.replace(" ", "T") + (t.length === 16 ? ":00Z" : "Z");
  }
  return t; // already ISO or unknown — pass through
}

// Minimal HTML -> plain text (Podio "html" format text fields).
function stripHtml(html) {
  return String(html ?? "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Icons: our 16 PodioIcon names, keyword-matched against app name + Podio
// icon id. Default "brick".

const ICON_KEYWORDS = [
  ["task", ["task", "todo", "to-do", "action"]],
  ["rocket", ["project", "launch", "campaign", "sprint"]],
  ["meeting", ["meeting", "standup", "agenda"]],
  ["contact", ["lead", "client", "contact", "customer", "people", "member", "employee", "candidate"]],
  ["idea", ["idea", "inspiration", "brainstorm", "innovation"]],
  ["cart", ["expense", "purchase", "order", "invoice", "budget", "sale", "product", "inventory"]],
  ["event", ["event", "calendar", "conference", "webinar"]],
  ["doc", ["doc", "document", "note", "report", "wiki", "content", "article"]],
  ["chart", ["chart", "metric", "kpi", "goal", "analytic", "survey", "grant"]],
  ["mail", ["mail", "email", "newsletter", "message"]],
  ["phone", ["phone", "call"]],
  ["map", ["map", "location", "site", "property", "venue", "travel"]],
  ["link", ["link", "bookmark", "resource", "url"]],
  ["gear", ["setting", "config", "asset", "equipment", "machine", "tool"]],
  ["tray", ["inbox", "request", "ticket", "queue", "intake"]],
];

// Podio numeric icon ids we can recognize from the fixture set.
const PODIO_ICON_IDS = {
  55: "contact",  // Leads & Clients
  265: "rocket",  // Projects
  105: "idea",    // Inspiration
  44: "meeting",  // Meetings
  170: "cart",    // Expenses
};

function pickIcon(name, podioIconId) {
  const n = String(name ?? "").toLowerCase();
  for (const [icon, words] of ICON_KEYWORDS) {
    if (words.some((w) => n.includes(w))) return icon;
  }
  if (podioIconId != null && PODIO_ICON_IDS[podioIconId]) {
    return PODIO_ICON_IDS[podioIconId];
  }
  return "brick";
}

// ---------------------------------------------------------------------------
// Category colors: Podio option colors (hex words, no '#') -> our pastel set.
// Unknown colors fall back to a stable palette keyed by option index.

const PASTELS = {
  blue: "#CFE8F7",
  yellow: "#F5EFC8",
  purple: "#DCC8F5",
  green: "#D9F2E5",
  red: "#F9D7D4",
  teal: "#CDEDED",
  orange: "#FBE3C9",
};

const PODIO_COLOR_MAP = {
  // Observed / documented Podio category palette
  D2E4EB: PASTELS.blue,    DCEBD8: PASTELS.green,   F7D1D0: PASTELS.red,
  F7F0C5: PASTELS.yellow,  E1D8ED: PASTELS.purple,  D1E9E9: PASTELS.teal,
  F9DBC8: PASTELS.orange,  FFD5C8: PASTELS.orange,  DDDDDD: PASTELS.blue,
  // Color-word variants some Podio endpoints return
  blue: PASTELS.blue, lightblue: PASTELS.blue, green: PASTELS.green,
  lightgreen: PASTELS.green, red: PASTELS.red, pink: PASTELS.red,
  yellow: PASTELS.yellow, purple: PASTELS.purple, violet: PASTELS.purple,
  orange: PASTELS.orange, teal: PASTELS.teal, cyan: PASTELS.teal,
  grey: PASTELS.blue, gray: PASTELS.blue, white: PASTELS.blue,
};

const FALLBACK_PALETTE = [
  PASTELS.blue, PASTELS.yellow, PASTELS.purple, PASTELS.green,
  PASTELS.red, PASTELS.teal, PASTELS.orange,
];

function mapCategoryColor(podioColor, index) {
  const key = String(podioColor ?? "").replace(/^#/, "");
  return (
    PODIO_COLOR_MAP[key.toUpperCase()] ||
    PODIO_COLOR_MAP[key.toLowerCase()] ||
    FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]
  );
}

// ---------------------------------------------------------------------------
// mapApp: Podio app JSON (apps.json entry) -> our app + fields.

const PODIO_TO_OUR_TYPE = {
  text: "text", category: "category", date: "date", contact: "contact",
  app: "relationship", money: "money", progress: "progress", image: "image",
  embed: "link", number: "number", duration: "duration",
  calculation: "calculation", phone: "phone", email: "email",
  location: "location",
};

export function mapApp(podioApp) {
  const cfg = podioApp?.config ?? {};
  const notes = [];
  const name = cfg.name || `Podio app ${podioApp?.app_id ?? "?"}`;

  const app = {
    name,
    slug: slugify(name) || `app-${podioApp?.app_id ?? "x"}`,
    icon: pickIcon(name, cfg.icon_id),
    item_name: cfg.item_name || "Item",
    description: cfg.description || null,
  };

  const rawFields = Array.isArray(podioApp?.fields) ? podioApp.fields : [];
  const active = rawFields.filter((f) => f.status === "active");
  const skipped = rawFields.length - active.length;
  if (skipped > 0) {
    notes.push(`${name}: skipped ${skipped} non-active (deleted) Podio field(s)`);
  }
  active.sort((a, b) => (a.config?.delta ?? 0) - (b.config?.delta ?? 0));

  const fields = [];
  let position = 0;
  let primaryAssigned = false;

  for (const pf of active) {
    const settings = pf.config?.settings ?? {};
    const ourType = PODIO_TO_OUR_TYPE[pf.type];
    if (!ourType) {
      notes.push(`${name}.${pf.external_id}: unsupported Podio field type "${pf.type}" — field dropped`);
      continue;
    }

    const field = {
      podio_field_id: pf.field_id,
      external_id: pf.external_id, // Podio external_ids are already kebab-case
      label: pf.label || pf.config?.label || pf.external_id,
      type: ourType,
      position: position++,
      is_primary: false,
      is_required: !!pf.config?.required,
      config: {},
    };

    switch (pf.type) {
      case "text": {
        if (settings.format === "html") {
          field.note = "html text converted to plain text";
          notes.push(`${name}.${pf.external_id}: Podio rich-text (html) field — values stripped to plain text`);
        }
        if (settings.size) field.config.size = settings.size;
        break;
      }
      case "category": {
        const options = Array.isArray(settings.options) ? settings.options : [];
        const activeOpts = options.filter((o) => o.status === "active");
        if (activeOpts.length < options.length) {
          notes.push(`${name}.${pf.external_id}: dropped ${options.length - activeOpts.length} inactive category option(s)`);
        }
        field.config = {
          options: activeOpts.map((o, i) => ({
            id: String(o.id),
            label: o.text,
            color: mapCategoryColor(o.color, i),
          })),
          multiple: !!settings.multiple,
        };
        break;
      }
      case "date": {
        field.config = { end_date: settings.end !== "disabled" };
        break;
      }
      case "app": {
        const refs = settings.referenced_apps ?? settings.apps ?? [];
        const appIds = refs
          .map((r) => r?.app_id ?? r?.app?.app_id)
          .filter((id) => id != null);
        field.config = { podio_referenced_apps: appIds };
        if (appIds.length > 1) {
          notes.push(`${name}.${pf.external_id}: references ${appIds.length} Podio apps — only the first is wired as related_app_id`);
        }
        break;
      }
      case "money": {
        const currencies = settings.allowed_currencies ?? settings.currencies ?? [];
        field.config = { currency: currencies[0] || "USD" };
        if (currencies.length > 1) {
          notes.push(`${name}.${pf.external_id}: multiple allowed currencies (${currencies.join(", ")}) — field pinned to ${currencies[0]}`);
        }
        break;
      }
      case "calculation": {
        field.config = { formula: "", podio_script: settings.script ?? "" };
        field.note = "calculation needs manual conversion";
        notes.push(`${name}.${pf.external_id}: calculation needs manual conversion (Podio script preserved in config.podio_script)`);
        break;
      }
      case "embed": {
        notes.push(`${name}.${pf.external_id}: Podio embed field imported as plain link (URL only)`);
        break;
      }
      case "contact": {
        if (Array.isArray(settings.valid_types) && settings.valid_types.includes("space")) {
          notes.push(`${name}.${pf.external_id}: Podio contact field allows space contacts — only workspace members can be mapped`);
        }
        break;
      }
      default:
        break;
    }

    // Primary: first text field (Podio derives item titles the same way).
    if (!primaryAssigned && pf.type === "text") {
      field.is_primary = true;
      primaryAssigned = true;
    }

    fields.push(field);
  }

  if (!primaryAssigned) {
    notes.push(`${name}: no text field found to mark as primary — item titles carried over verbatim only`);
  }

  return { app, fields, notes };
}

// ---------------------------------------------------------------------------
// mapItemValues: Podio item JSON -> write_values shapes keyed by external_id.

export function mapItemValues(podioItem, mappedFields, ctx = {}) {
  const memberMap = ctx.memberMap instanceof Map ? ctx.memberMap : new Map();
  const notes = [];
  const values = {};
  const refs = [];
  const files = [];

  const byFieldId = new Map();
  const byExternalId = new Map();
  for (const f of mappedFields ?? []) {
    if (f.podio_field_id != null) byFieldId.set(f.podio_field_id, f);
    byExternalId.set(f.external_id, f);
  }

  const itemLabel = `item ${podioItem?.item_id ?? "?"}`;

  for (const pf of podioItem?.fields ?? []) {
    const field = byFieldId.get(pf.field_id) ?? byExternalId.get(pf.external_id);
    if (!field) {
      notes.push(`${itemLabel}: value for unmapped Podio field "${pf.external_id}" dropped`);
      continue;
    }
    const vals = Array.isArray(pf.values) ? pf.values : [];
    if (vals.length === 0) continue;
    const ext = field.external_id;
    const v0 = vals[0];

    switch (pf.type) {
      case "text": {
        let text = v0?.value ?? "";
        if (typeof text !== "string") text = String(text);
        if (/<[a-z][\s\S]*>/i.test(text)) text = stripHtml(text);
        if (text) values[ext] = text;
        break;
      }
      case "category": {
        const ids = vals
          .map((v) => v?.value?.id)
          .filter((id) => id != null)
          .map((id) => String(id));
        if (ids.length === 0) break;
        if (field.config?.multiple) {
          values[ext] = ids;
        } else {
          values[ext] = ids[0];
          if (ids.length > 1) {
            notes.push(`${itemLabel}.${ext}: ${ids.length - 1} extra category value(s) dropped (single-select field)`);
          }
        }
        break;
      }
      case "date": {
        const start = v0?.start_utc ?? v0?.start_date ?? v0?.start ?? null;
        const end = v0?.end_utc ?? v0?.end_date ?? v0?.end ?? null;
        if (!start) break;
        const out = { start: podioDateToIso(start) };
        if (end) out.end = podioDateToIso(end);
        values[ext] = out;
        break;
      }
      case "contact": {
        const mapped = [];
        let droppedUnmapped = 0;
        for (const v of vals) {
          const userId = v?.value?.user_id;
          const uuid = userId != null ? memberMap.get(userId) : null;
          if (uuid) mapped.push(uuid);
          else droppedUnmapped++;
        }
        if (droppedUnmapped > 0) {
          notes.push(`${itemLabel}.${ext}: ${droppedUnmapped} contact(s) dropped (no matching workspace member — space contacts or unmapped users)`);
        }
        if (mapped.length > 0) {
          values[ext] = mapped[0];
          if (mapped.length > 1) {
            notes.push(`${itemLabel}.${ext}: ${mapped.length - 1} extra contact(s) dropped (single-contact field)`);
          }
        }
        break;
      }
      case "app": {
        const ids = vals
          .map((v) => v?.value?.item_id)
          .filter((id) => id != null);
        if (ids.length > 0) refs.push({ external_id: ext, podio_item_ids: ids });
        break;
      }
      case "money": {
        const amount = Number(v0?.value);
        if (!Number.isFinite(amount)) break;
        values[ext] = {
          amount,
          currency: v0?.currency || field.config?.currency || "USD",
        };
        break;
      }
      case "progress":
      case "number":
      case "duration": {
        const n = Number(v0?.value);
        if (Number.isFinite(n)) values[ext] = n;
        if (vals.length > 1) {
          notes.push(`${itemLabel}.${ext}: ${vals.length - 1} extra ${pf.type} value(s) dropped`);
        }
        break;
      }
      case "image": {
        for (const v of vals) {
          const f = v?.value;
          if (!f) continue;
          files.push({
            podio_file_id: f.file_id ?? null,
            name: f.name ?? "image",
            link: f.link ?? null,
            mimetype: f.mimetype ?? null,
          });
        }
        break;
      }
      case "embed": {
        const url = v0?.embed?.url ?? v0?.embed?.original_url ?? null;
        if (url) values[ext] = url;
        if (vals.length > 1) {
          notes.push(`${itemLabel}.${ext}: ${vals.length - 1} extra embed(s) dropped (single link field)`);
        }
        break;
      }
      case "phone":
      case "email": {
        const entries = vals
          .map((v) => (typeof v?.value === "string" ? v.value : v?.value?.value))
          .filter(Boolean);
        if (entries.length > 0) {
          values[ext] = entries[0];
          if (entries.length > 1) {
            notes.push(`${itemLabel}.${ext}: ${entries.length - 1} extra ${pf.type} value(s) dropped (single-value field)`);
          }
        }
        break;
      }
      case "location": {
        const formatted =
          typeof v0?.value === "string" ? v0.value : v0?.formatted ?? null;
        if (formatted) values[ext] = formatted;
        break;
      }
      case "calculation": {
        // Computed in Podio; our field re-computes (after manual conversion).
        break;
      }
      default: {
        notes.push(`${itemLabel}.${ext}: value of unsupported Podio type "${pf.type}" dropped`);
        break;
      }
    }
  }

  // Item-level file attachments ride the same external-link channel.
  for (const f of podioItem?.files ?? []) {
    files.push({
      podio_file_id: f.file_id ?? null,
      name: f.name ?? "file",
      link: f.link ?? null,
      mimetype: f.mimetype ?? null,
    });
  }

  return {
    title: podioItem?.title ?? null,
    values,
    refs,
    files,
    notes,
  };
}

// ---------------------------------------------------------------------------
// mapComment / mapTask

export function mapComment(podioComment, ctx = {}) {
  const memberMap = ctx.memberMap instanceof Map ? ctx.memberMap : new Map();
  const rich = podioComment?.rich_value ?? null;
  let body = podioComment?.value ?? "";
  if (!body && rich) body = stripHtml(rich);
  const createdBy = podioComment?.created_by ?? {};
  const userId =
    createdBy.type === "user" ? createdBy.id ?? createdBy.user_id ?? null : null;

  const out = {
    body,
    created_at: podioDateToIso(podioComment?.created_on) ?? null,
    podio_user_id: userId,
  };
  if (userId == null) {
    out.note = "comment author is not a Podio user (app/system) — imported without an author";
  } else if (!memberMap.get(userId)) {
    out.note = `comment author (Podio user ${userId}) has no mapped workspace member`;
  }
  return out;
}

export function mapTask(podioTask, ctx = {}) {
  const memberMap = ctx.memberMap instanceof Map ? ctx.memberMap : new Map();
  const responsible = podioTask?.responsible ?? null;
  const responsibleId = responsible?.user_id ?? responsible?.id ?? null;

  // due_on is the full UTC timestamp; due_date is date-only.
  const dueAt = podioTask?.due_on ?? podioTask?.due_date ?? null;

  const out = {
    title: podioTask?.text ?? "",
    description: podioTask?.description || null,
    due_at: dueAt ? podioDateToIso(dueAt) : null,
    completed_at: podioTask?.completed_on
      ? podioDateToIso(podioTask.completed_on)
      : null,
    podio_responsible_user_id: responsibleId,
  };
  if (responsibleId != null && !memberMap.get(responsibleId)) {
    out.note = `task assignee (Podio user ${responsibleId}) has no mapped workspace member — imported unassigned`;
  }
  return out;
}
