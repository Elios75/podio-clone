"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parseCsv } from "@/lib/csv";
import { slugify } from "@/lib/slug";
import type { CategoryOption } from "@/lib/fields";

type Field = { id: string; label: string; type: string; config: { options?: CategoryOption[] } };

const IMPORTABLE = [
  "text","number","date","category","phone","email","link",
  "location","organization","money","progress","duration",
];

// Types offered when creating a new field from a column
const NEW_TYPES = ["text", "number", "date", "email", "phone", "link"];

const DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_RE = /^https?:\/\/\S+$/i;

// Lightweight type guess for auto-creating a field from a column's sample data
function guessType(samples: string[]): string {
  const vals = samples.map((s) => s.trim()).filter(Boolean).slice(0, 50);
  if (vals.length === 0) return "text";
  const all = (fn: (v: string) => boolean) => vals.every(fn);
  if (all((v) => !isNaN(Number(v.replace(/,/g, ""))))) return "number";
  if (all((v) => DATE_RE.test(v) && !isNaN(Date.parse(v)))) return "date";
  if (all((v) => EMAIL_RE.test(v))) return "email";
  if (all((v) => URL_RE.test(v))) return "link";
  return "text";
}

export function ImportCsv({
  appId,
  fields,
  backHref,
}: {
  appId: string;
  fields: Field[];
  backHref: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const importable = fields.filter((f) => IMPORTABLE.includes(f.type));

  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({}); // col index -> field id
  const [progress, setProgress] = useState<{ done: number; errors: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result));
      if (parsed.length < 2) return setError("CSV needs a header row plus at least one data row.");
      setRows(parsed);
      // Auto-match to an existing field by label; otherwise default to
      // "create a new field", type-inferred from the column data.
      const dataRows = parsed.slice(1);
      const auto: Record<number, string> = {};
      parsed[0].forEach((header, i) => {
        const match = importable.find(
          (f) => f.label.toLowerCase().trim() === header.toLowerCase().trim()
        );
        if (match) {
          auto[i] = match.id;
        } else {
          const samples = dataRows.map((r) => r[i] ?? "");
          auto[i] = `new:${guessType(samples)}`;
        }
      });
      setMapping(auto);
      setError(null);
    };
    reader.readAsText(file);
  }

  function shapeValue(field: Field, raw: string): any {
    const v = raw.trim();
    if (v === "") return null;
    switch (field.type) {
      case "number":
      case "progress":
        return isNaN(Number(v)) ? null : Number(v);
      case "duration":
        return isNaN(Number(v)) ? null : Number(v); // seconds
      case "money":
        return isNaN(Number(v)) ? null : { amount: Number(v), currency: "USD" };
      case "date": {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : { start: d.toISOString().slice(0, 10) };
      }
      case "category": {
        const opt = (field.config.options ?? []).find(
          (o) => o.label.toLowerCase().trim() === v.toLowerCase()
        );
        return opt ? opt.id : null;
      }
      default:
        return v;
    }
  }

  // Shape a raw string for a given field TYPE (used for both existing + new fields)
  function shapeByType(type: string, raw: string): any {
    const v = (raw ?? "").trim();
    if (v === "") return null;
    switch (type) {
      case "number":
      case "progress":
        return isNaN(Number(v.replace(/,/g, ""))) ? null : Number(v.replace(/,/g, ""));
      case "duration":
        return isNaN(Number(v)) ? null : Number(v);
      case "money":
        return isNaN(Number(v)) ? null : { amount: Number(v), currency: "USD" };
      case "date": {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : { start: d.toISOString().slice(0, 10) };
      }
      default:
        return v;
    }
  }

  async function runImport() {
    setRunning(true);
    setError(null);
    const dataRows = rows.slice(1);
    setProgress({ done: 0, errors: 0 });

    // 1. Create any "new:<type>" columns as real fields, then treat them as mapped
    const resolved: Record<number, { fieldId: string; type: string }> = {};
    const toCreate = Object.entries(mapping)
      .filter(([, val]) => val?.startsWith("new:"))
      .map(([colStr, val]) => ({
        col: Number(colStr),
        type: val.slice(4),
        label: rows[0][Number(colStr)]?.trim() || `Column ${Number(colStr) + 1}`,
      }));

    if (toCreate.length > 0) {
      const hasPrimary = fields.some((f) => f.type === "text"); // existing title?
      const newRows = toCreate.map((c, i) => ({
        app_id: appId,
        external_id: `${slugify(c.label)}-${Date.now()}-${i}`,
        label: c.label,
        type: c.type,
        is_primary: !hasPrimary && i === 0 && c.type === "text",
        position: fields.length + i,
        config: {},
      }));
      const { data: created, error: createErr } = await supabase
        .from("app_fields")
        .insert(newRows)
        .select("id, external_id");
      if (createErr) {
        setRunning(false);
        return setError(`Couldn't create fields: ${createErr.message}`);
      }
      toCreate.forEach((c, i) => {
        resolved[c.col] = { fieldId: created![i].id, type: c.type };
      });
    }

    // Existing-field mappings
    for (const [colStr, val] of Object.entries(mapping)) {
      if (!val || val.startsWith("new:")) continue;
      const field = importable.find((f) => f.id === val);
      if (field) resolved[Number(colStr)] = { fieldId: field.id, type: field.type };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: job } = await supabase
      .from("import_jobs")
      .insert({
        app_id: appId,
        user_id: user!.id,
        status: "running",
        total_rows: dataRows.length,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Shape all rows up front, then send in batches (one transaction per batch)
    const shaped: Record<string, any>[] = [];
    let errors = 0;
    for (const row of dataRows) {
      const values: Record<string, any> = {};
      for (const [colStr, r] of Object.entries(resolved)) {
        const existing = importable.find((f) => f.id === r.fieldId);
        const sv =
          existing?.type === "category"
            ? shapeValue(existing, row[Number(colStr)] ?? "")
            : shapeByType(r.type, row[Number(colStr)] ?? "");
        if (sv !== null && sv !== undefined) values[r.fieldId] = sv;
      }
      if (Object.keys(values).length === 0) errors++;
      else shaped.push(values);
    }

    let done = 0;
    const CHUNK = 250;
    for (let i = 0; i < shaped.length; i += CHUNK) {
      const batch = shaped.slice(i, i + CHUNK);
      const { data: res, error: rpcError } = await supabase.rpc(
        "bulk_import_items",
        { p_app: appId, p_rows: batch }
      );
      if (rpcError) errors += batch.length;
      else done += res?.imported ?? batch.length;
      setProgress({ done, errors });
    }

    if (job) {
      await supabase
        .from("import_jobs")
        .update({
          status: errors === dataRows.length ? "failed" : "success",
          processed_rows: done,
          error_rows: errors,
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }

    setRunning(false);
  }

  if (progress && !running) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-sm text-green-800">
          Import finished: {progress.done} imported, {progress.errors} skipped.
        </p>
        <Link
          href={backHref}
          className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          View items
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <label className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 hover:border-blue-400">
          Click to choose a .csv file
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      ) : (
        <>
          {(() => {
            const mappedCount = Object.values(mapping).filter(Boolean).length;
            return (
              <p className="text-sm">
                <span className="text-slate-500">{rows.length - 1} rows detected · </span>
                <span className={mappedCount === 0 ? "font-medium text-red-600" : "font-medium text-green-700"}>
                  {mappedCount} of {rows[0].length} column{rows[0].length === 1 ? "" : "s"} mapped
                </span>
                {mappedCount === 0 && (
                  <span className="text-slate-500"> — pick a field for each column below, or the import will be empty.</span>
                )}
              </p>
            );
          })()}
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            {rows[0].map((header, i) => {
              const unmapped = !mapping[i];
              return (
              <div key={i} className={`flex items-center gap-3 rounded px-1 text-sm ${unmapped ? "bg-amber-50" : ""}`}>
                <span className="w-40 truncate font-medium">{header}</span>
                <span className="text-xs text-slate-400">
                  e.g. “{rows[1]?.[i]?.slice(0, 25) ?? ""}”
                </span>
                {unmapped && <span className="text-xs text-amber-600">will be skipped</span>}
                {mapping[i]?.startsWith("new:") && (
                  <span className="text-xs text-green-600">new field</span>
                )}
                <select
                  value={mapping[i] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })}
                  className={`ml-auto rounded border px-2 py-1 text-sm ${unmapped ? "border-amber-300" : "border-slate-300"}`}
                >
                  <option value="">— skip —</option>
                  <optgroup label="Create new field">
                    {NEW_TYPES.map((t) => (
                      <option key={t} value={`new:${t}`}>
                        ＋ New {t} field
                      </option>
                    ))}
                  </optgroup>
                  {importable.length > 0 && (
                    <optgroup label="Existing fields">
                      {importable.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              );
            })}
            {importable.length === 0 && (
              <p className="text-sm text-amber-600">
                This app has no importable fields yet. Add fields via “Edit app”
                first, or use “From CSV” on the workspace to build the app from
                this file.
              </p>
            )}
          </div>

          {(() => {
            // Only existing-field mappings can collide; "new:" columns each make their own field
            const used = Object.values(mapping).filter((v) => v && !v.startsWith("new:"));
            const dupes = used.filter((v, i) => used.indexOf(v) !== i);
            if (dupes.length === 0) return null;
            const names = [...new Set(dupes)]
              .map((id) => importable.find((f) => f.id === id)?.label)
              .filter(Boolean);
            return (
              <p className="text-sm text-amber-600">
                ⚠ Multiple columns are mapped to the same existing field ({names.join(", ")}).
                Only one will be kept per row — give each its own field.
              </p>
            );
          })()}
          <div className="flex items-center gap-3">
            <button
              onClick={runImport}
              disabled={running || Object.values(mapping).every((v) => !v)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {running
                ? `Importing… ${(progress?.done ?? 0) + (progress?.errors ?? 0)}/${rows.length - 1}`
                : `Import ${rows.length - 1} rows`}
            </button>
            <button
              onClick={() => {
                setRows([]);
                setMapping({});
                setProgress(null);
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            >
              Start over
            </button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
