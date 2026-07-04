"use client";

import { toCsv, downloadCsv } from "@/lib/csv";

export function ExportAuditButton({
  rows,
}: {
  rows: { when: string; actor: string; action: string; target: string; details: string }[];
}) {
  return (
    <button
      onClick={() =>
        downloadCsv(
          "audit-log.csv",
          toCsv([
            ["When", "Actor", "Action", "Target", "Details"],
            ...rows.map((r) => [r.when, r.actor, r.action, r.target, r.details]),
          ])
        )
      }
      className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
    >
      Export CSV
    </button>
  );
}
