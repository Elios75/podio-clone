// Display label for a template category slug: "client_onboarding" →
// "Client Onboarding", with acronym categories fully uppercased ("crm" →
// "CRM"). Slugs stay lowercase+underscore in the DB (they're stable keys);
// only the presentation changes.
const ACRONYMS = new Set(["crm", "hr"]);

export function categoryLabel(slug: string) {
  return slug
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) =>
      ACRONYMS.has(w.toLowerCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}
