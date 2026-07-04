// Shared field typing for the app builder and item forms.

export type FieldType = "text" | "number" | "date" | "category" | "contact";

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "category", label: "Category" },
  { value: "contact", label: "Contact (member)" },
];

export type CategoryOption = { id: string; label: string; color: string };

export type AppField = {
  id: string;
  label: string;
  type: FieldType;
  is_required: boolean;
  is_primary: boolean;
  position: number;
  help_text: string | null;
  config: { options?: CategoryOption[]; multiline?: boolean };
};

export const CATEGORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b",
];
