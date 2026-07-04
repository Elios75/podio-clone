"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toCsv, downloadCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/spreadsheet";
import { formatDuration, type CategoryOption } from "@/lib/fields";

type Field = { id: string; label: string; type: string; config: { options?: CategoryOption[] } };

export function ExportButton({
  appId,
  appName,
  fields,
}: {
  appId: string;
  appName: string;
  fields: Field[];
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function buildRows(): Promise<string[][]> {
    const { data: items } = await supabase
      .from("items")
      .select("id, item_number, title, created_at")
      .eq("app_id", appId)
      .eq("is_deleted", false)
      .order("item_number")
      .limit(1000);

    const itemIds = (items ?? []).map((i) => i.id);
    const { data: values } = itemIds.length
      ? await supabase
          .from("item_field_values")
          .select("item_id, field_id, value, value_text, value_number, value_date")
          .in("item_id", itemIds)
      : { data: [] as any[] };

    const byItem = new Map<string, Map<string, any>>();
    for (const v of values ?? []) {
      if (!byItem.has(v.item_id)) byItem.set(v.item_id, new Map());
      byItem.get(v.item_id)!.set(v.field_id, v);
    }

    const exportFields = fields.filter((f) => !["separator", "calculation"].includes(f.type));

    function cell(field: Field, itemId: string): string {
      const v = byItem.get(itemId)?.get(field.id);
      if (!v) return "";
      switch (field.type) {
        case "category": {
          const opt = (field.config.options ?? []).find((o) => o.id === v.value_text);
          return opt?.label ?? "";
        }
        case "date":
          return v.value_date ? new Date(v.value_date).toISOString().slice(0, 10) : "";
        case "money":
          return v.value_number != null
            ? `${v.value_number} ${v.value?.currency ?? ""}`.trim()
            : "";
        case "duration":
          return v.value_number != null ? formatDuration(Number(v.value_number)) : "";
        case "number":
        case "progress":
          return v.value_number != null ? String(v.value_number) : "";
        default:
          return v.value_text ?? "";
      }
    }

    const header = ["#", ...exportFields.map((f) => f.label), "Created"];
    const rows = (items ?? []).map((it) => [
      String(it.item_number),
      ...exportFields.map((f) => cell(f, it.id)),
      new Date(it.created_at).toISOString().slice(0, 10),
    ]);
    return [header, ...rows];
  }

  const baseName = () => appName.toLowerCase().replace(/\s+/g, "-");

  async function exportCsv() {
    setBusy(true);
    try {
      downloadCsv(`${baseName()}-export.csv`, toCsv(await buildRows()));
    } finally {
      setBusy(false);
    }
  }

  async function exportXlsx() {
    setBusy(true);
    try {
      await downloadXlsx(`${baseName()}-export.xlsx`, await buildRows(), appName.slice(0, 31));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex overflow-hidden rounded-lg border border-slate-300">
      <button
        onClick={exportCsv}
        disabled={busy}
        className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        {busy ? "Exporting…" : "Export CSV"}
      </button>
      <button
        onClick={exportXlsx}
        disabled={busy}
        className="border-l border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        XLSX
      </button>
    </span>
  );
}
