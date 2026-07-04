"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parseCsv } from "@/lib/csv";
import type { CategoryOption } from "@/lib/fields";

type Field = { id: string; label: string; type: string; config: { options?: CategoryOption[] } };

const IMPORTABLE = [
  "text","number","date","category","phone","email","link",
  "location","organization","money","progress","duration",
];

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
      // Auto-match headers to field labels
      const auto: Record<number, string> = {};
      parsed[0].forEach((header, i) => {
        const match = importable.find(
          (f) => f.label.toLowerCase().trim() === header.toLowerCase().trim()
        );
        if (match) auto[i] = match.id;
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

  async function runImport() {
    setRunning(true);
    setError(null);
    const dataRows = rows.slice(1);
    setProgress({ done: 0, errors: 0 });

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
      for (const [colStr, fieldId] of Object.entries(mapping)) {
        if (!fieldId) continue;
        const field = importable.find((f) => f.id === fieldId);
        if (!field) continue;
        const sv = shapeValue(field, row[Number(colStr)] ?? "");
        if (sv !== null) values[fieldId] = sv;
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
        <button
          onClick={() => {
            router.push(backHref);
            router.refresh();
          }}
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          View items
        </button>
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
          <p className="text-sm text-slate-500">
            {rows.length - 1} rows detected. Map columns to fields:
          </p>
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            {rows[0].map((header, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate font-medium">{header}</span>
                <span className="text-xs text-slate-400">
                  e.g. “{rows[1]?.[i]?.slice(0, 25) ?? ""}”
                </span>
                <select
                  value={mapping[i] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })}
                  className="ml-auto rounded border border-slate-300 px-2 py-1 text-sm"
                >
                  <option value="">— skip —</option>
                  {importable.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

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
