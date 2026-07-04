// Shared field typing for the app builder and item forms.

export type FieldType =
  | "text" | "category" | "date" | "relationship" | "contact"
  | "phone" | "email" | "organization" | "number" | "money"
  | "progress" | "calculation" | "location" | "duration"
  | "image" | "file" | "link" | "separator";

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "category", label: "Category" },
  { value: "contact", label: "Contact (member)" },
  { value: "relationship", label: "Relationship (link items)" },
  { value: "money", label: "Money" },
  { value: "progress", label: "Progress (0–100%)" },
  { value: "duration", label: "Duration" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "link", label: "Link (URL)" },
  { value: "location", label: "Location (address)" },
  { value: "organization", label: "Organization (company)" },
  { value: "image", label: "Image" },
  { value: "file", label: "File" },
  { value: "calculation", label: "Calculation (formula)" },
  { value: "separator", label: "Separator (section divider)" },
];

export type CategoryOption = { id: string; label: string; color: string };

export const CATEGORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b",
];

export const CURRENCIES = ["USD", "EUR", "GBP", "MXN", "CAD"];

export function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function publicFileUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/podio-files/${path}`;
}
