"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { readTabular } from "@/lib/spreadsheet";
import { slugify } from "@/lib/slug";
import { CATEGORY_COLORS, type CategoryOption } from "@/lib/fields";

type InferredType = "text" | "number" | "date" | "category" | "email" | "phone" | "link";

type Column = {
  index: number;
  header: string;
  type: InferredType;
  include: boolean;
  options: CategoryOption[]; // category only
  samples: string[];
};

const TYPE_OPTIONS: { value: InferredType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "category", label: "Category" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "link", label: "Link" },
];

const DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_RE = /^https?:\/\/\S+$/i;
const PHONE_RE = /^[+()\-\s\d.]{7,20}$/;

function inferType(values: string[]): InferredType {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return "text";
  const all = (fn: (v: string) => boolean) => nonEmpty.every(fn);

  if (all((v) => !isNaN(Number(v.replace(/,/g, ""))) && v.trim() !== "")) return "number";
  if (all((v) => DATE_RE.test(v.trim()) && !isNaN(Date.parse(v)))) return "date";
  if (all((v) => EMAIL_RE.test(v.trim()))) return "email";
  if (all((v) => URL_RE.test(v.trim()))) return "link";
  if (all((v) => PHONE_RE.test(v.trim()) && /\d{6,}/.test(v.replace(/\D/g, ""))))
    return "phone";

  const distinct = new Set(nonEmpty.map((v) => v.trim().toLowerCase()));
  const avgLen = nonEmpty.reduce((a, v) => a + v.length, 0) / nonEmpty.length;
  if (
    distinct.size >= 2 &&
    distinct.size <= Math.min(12, Math.max(3, Math.floor(nonEmpty.length / 3))) &&
    avgLen < 30
  ) {
    return "category";
  }
  return "text";
}

function buildOptions(values: string[]): CategoryOption[] {
  const distinct = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return distinct.slice(0, 200).map((label, i) => ({
    id: crypto.randomUUID(),
    label,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));
}

export function AppFromCsv({
  wsId,
  orgSlug,
  wsSlug,
}: {
  wsId: string;
  orgSlug: string;
  wsSlug: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState<string[][]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [appName, setAppName] = useState("");
  const [itemName, setItemName] = useState("Item");
  const [icon, setIcon] = useState("📋");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; errors: number } | null>(null);
  const [running, setRunning] = useState(false);

  function handleFile(file: File) {
    readTabular(file).then((parsed) => {
      if (parsed.length < 2)
        return setError("The file needs a header row plus at least one data row.");
      const dataRows = parsed.slice(1, 201); // sample up to 200 rows for inference
      const cols: Column[] = parsed[0].map((header, i) => {
        const samples = dataRows.map((r) => r[i] ?? "");
        const type = inferType(samples);
        return {
          index: i,
          header: header.trim() || `Column ${i + 1}`,
          type,
          include: true,
          options: type === "category"
            ? buildOptions(parsed.slice(1).map((r) => r[i] ?? ""))
            : [],
          samples: samples.filter((s) => s.trim()).slice(0, 3),
        };
      });
      setColumns(cols);
      setRows(parsed);
      setAppName(file.name.replace(/\.(csv|xlsx|xls)$/i, "").replace(/[_-]+/g, " "));
      setError(null);
    }).catch((e) => setError(String(e?.message ?? e)));
  }

  function updCol(i: number, patch: Partial<Column>) {
    setColumns(columns.map((c, ci) => {
      if (ci !== i) return c;
      const next = { ...c, ...patch };
      // Recompute options when switching to category
      if (patch.type === "category" && next.options.length === 0) {
        next.options = buildOptions(rows.slice(1).map((r) => r[c.index] ?? ""));
      }
      return next;
    }));
  }

  function shapeValue(col: Column, raw: string): any {
    const v = (raw ?? "").trim();
    if (v === "") return null;
    switch (col.type) {
      case "number": {
        const n = Number(v.replace(/,/g, ""));
        return isNaN(n) ? null : n;
      }
      case "date": {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : { start: d.toISOString().slice(0, 10) };
      }
      case "category": {
        const opt = col.options.find(
          (o) => o.label.toLowerCase() === v.toLowerCase()
        );
        return opt ? opt.id : null;
      }
      default:
        return v;
    }
  }

  async function create() {
    setError(null);
    const included = columns.filter((c) => c.include);
    if (!appName.trim()) return setError("App name required.");
    if (included.length === 0) return setError("Include at least one column.");
    setRunning(true);

    // 1. App
    const { data: app, error: appError } = await supabase
      .from("apps")
      .insert({
        workspace_id: wsId,
        name: appName,
        slug: `${slugify(appName)}-${Math.random().toString(36).slice(2, 6)}`,
        icon,
        item_name: itemName || "Item",
      })
      .select()
      .single();
    if (appError) {
      setRunning(false);
      return setError(appError.message);
    }

    // 2. Fields: first included text-ish column becomes the title
    const primaryIdx = included.findIndex((c) =>
      ["text", "email", "phone", "link"].includes(c.type)
    );
    const fieldRows = included.map((c, i) => ({
      app_id: app.id,
      external_id: `${slugify(c.header)}-${i}`,
      label: c.header,
      type: c.type,
      is_primary: i === (primaryIdx === -1 ? 0 : primaryIdx),
      position: i,
      config: c.type === "category" ? { options: c.options } : {},
    }));
    const { data: createdFields, error: fieldsError } = await supabase
      .from("app_fields")
      .insert(fieldRows)
      .select("id, external_id");
    if (fieldsError) {
      setRunning(false);
      return setError(fieldsError.message);
    }
    const fieldIdByExt = new Map(
      (createdFields ?? []).map((f) => [f.external_id, f.id])
    );

    // 3. Shape all rows, then batch through bulk_import_items
    const shapedRows: Record<string, any>[] = [];
    let errors = 0;
    for (const row of rows.slice(1)) {
      const values: Record<string, any> = {};
      included.forEach((c, i) => {
        const fid = fieldIdByExt.get(`${slugify(c.header)}-${i}`);
        if (!fid) return;
        const shaped = shapeValue(c, row[c.index] ?? "");
        if (shaped !== null) values[fid] = shaped;
      });
      if (Object.keys(values).length === 0) errors++;
      else shapedRows.push(values);
    }

    let done = 0;
    setProgress({ done, errors });
    const CHUNK = 250;
    for (let i = 0; i < shapedRows.length; i += CHUNK) {
      const batch = shapedRows.slice(i, i + CHUNK);
      const { data: res, error: rpcError } = await supabase.rpc(
        "bulk_import_items",
        { p_app: app.id, p_rows: batch }
      );
      if (rpcError) errors += batch.length;
      else done += res?.imported ?? batch.length;
      setProgress({ done, errors });
    }

    setRunning(false);
    router.push(`/org/${orgSlug}/${wsSlug}/${app.slug}`);
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div>
        <label className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 hover:border-blue-400">
          Choose a .csv file — columns become fields, rows become items
          <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
        <p className="mt-2 text-xs text-slate-400">
          Excel file? Save it as CSV first (File → Save As → CSV). Native .xlsx
          support is on the roadmap.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={icon} onChange={(e) => setIcon(e.target.value)}
          className="w-16 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm" />
        <input value={appName} onChange={(e) => setAppName(e.target.value)}
          placeholder="App name"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        <input value={itemName} onChange={(e) => setItemName(e.target.value)}
          placeholder="Item name"
          className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <p className="text-sm text-slate-500">
        {rows.length - 1} rows · {columns.filter((c) => c.include).length} of{" "}
        {columns.length} columns included
      </p>

      <div className="space-y-2">
        {columns.map((c, i) => (
          <div key={i}
            className={`rounded-lg border p-3 ${c.include ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={c.include}
                onChange={(e) => updCol(i, { include: e.target.checked })} />
              <input value={c.header}
                onChange={(e) => updCol(i, { header: e.target.value })}
                className="w-48 rounded border border-slate-300 px-2 py-1.5 text-sm font-medium" />
              <select value={c.type}
                onChange={(e) => updCol(i, { type: e.target.value as InferredType })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {c.type === "category" && (
                <span className="text-xs text-slate-400">
                  {c.options.length} options
                </span>
              )}
              <span className="ml-auto truncate text-xs text-slate-400"
                title={c.samples.join(" · ")}>
                e.g. {c.samples.slice(0, 2).join(" · ").slice(0, 40)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={create} disabled={running}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {running
            ? `Creating… ${(progress?.done ?? 0) + (progress?.errors ?? 0)}/${rows.length - 1}`
            : `Create app + import ${rows.length - 1} rows`}
        </button>
        <button onClick={() => { setRows([]); setColumns([]); setProgress(null); }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
          Start over
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
      <p className="text-xs text-slate-400">
        The first text-like column becomes the item title. Category options are
        collected from the column's distinct values.
      </p>
    </div>
  );
}
