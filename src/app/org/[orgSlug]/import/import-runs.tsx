"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export type ImportRun = {
  id: string;
  organization_id: string;
  source_space_id: number;
  source_space_name: string | null;
  workspace_id: string | null;
  status: "queued" | "running" | "completed" | "failed";
  phase: string | null;
  counts: Record<string, number> | null;
  notes: string[] | null;
  error: string | null;
  started_at: string;
  updated_at: string;
};

type WorkspaceInfo = { slug: string; name: string };

const CHIP_STYLES: Record<ImportRun["status"], { bg: string; label: string }> = {
  queued: { bg: "#CFE8F7", label: "Queued" },
  running: { bg: "#F5EFC8", label: "Running" },
  completed: { bg: "#D9F2E5", label: "Completed" },
  failed: { bg: "#F9D7D4", label: "Failed" },
};

// Preferred display order for count keys; anything else follows alphabetically.
const COUNT_ORDER = [
  "apps",
  "items",
  "comments",
  "files",
  "contacts",
  "members",
  "views",
  "flows",
  "hooks",
];

function formatCounts(counts: Record<string, number> | null): string {
  if (!counts) return "";
  const keys = Object.keys(counts).sort((a, b) => {
    const ia = COUNT_ORDER.indexOf(a);
    const ib = COUNT_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return keys.map((k) => `${counts[k]} ${k}`).join(" · ");
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function ImportRuns({
  orgId,
  orgSlug,
  initialRuns,
  workspaceSlugs,
}: {
  orgId: string;
  orgSlug: string;
  initialRuns: ImportRun[];
  workspaceSlugs: Record<string, WorkspaceInfo>;
}) {
  const [runs, setRuns] = useState<ImportRun[]>(initialRuns);
  const [wsMap, setWsMap] =
    useState<Record<string, WorkspaceInfo>>(workspaceSlugs);
  const wsMapRef = useRef(wsMap);
  wsMapRef.current = wsMap;

  // Pick up fresh server data after router.refresh() (e.g. a newly queued run).
  useEffect(() => {
    setRuns(initialRuns);
  }, [initialRuns]);

  const anyActive = runs.some(
    (r) => r.status === "queued" || r.status === "running"
  );

  useEffect(() => {
    if (!anyActive) return;
    const supabase = createClient();

    const tick = async () => {
      const { data } = await supabase
        .from("import_runs")
        .select(
          "id, organization_id, source_space_id, source_space_name, workspace_id, status, phase, counts, notes, error, started_at, updated_at"
        )
        .eq("organization_id", orgId)
        .order("started_at", { ascending: false })
        .limit(20);
      if (!data) return;
      setRuns(data as ImportRun[]);

      // Resolve slugs for any newly linked workspaces.
      const missing = [
        ...new Set(
          data
            .map((r) => r.workspace_id)
            .filter((id): id is string => !!id && !wsMapRef.current[id])
        ),
      ];
      if (missing.length) {
        const { data: wss } = await supabase
          .from("workspaces")
          .select("id, slug, name")
          .in("id", missing);
        if (wss?.length) {
          setWsMap((prev) => {
            const next = { ...prev };
            for (const ws of wss) next[ws.id] = { slug: ws.slug, name: ws.name };
            return next;
          });
        }
      }
    };

    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [anyActive, orgId]);

  if (runs.length === 0) {
    return (
      <div className="mt-3 rounded border border-dashed border-podio-border bg-white p-8 text-center text-sm text-podio-meta">
        No imports yet.
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded border border-podio-border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-podio-row-alt text-left text-xs text-podio-secondary">
            <th className="px-3 py-2 font-medium">Space</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Phase</th>
            <th className="px-3 py-2 font-medium">Progress</th>
            <th className="px-3 py-2 font-medium">Updated</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const chip = CHIP_STYLES[run.status];
            const ws = run.workspace_id ? wsMap[run.workspace_id] : undefined;
            const notes = run.notes ?? [];
            const hasDetails = notes.length > 0 || !!run.error;
            return (
              <tr
                key={run.id}
                className="border-t border-podio-border align-top hover:bg-podio-row-hover"
              >
                <td className="px-3 py-2.5">
                  <div className="font-medium text-podio-ink">
                    {run.source_space_name ?? "Untitled space"}
                  </div>
                  <div className="text-xs text-podio-meta">
                    #{run.source_space_id}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="rounded px-2 py-0.5 text-sm font-medium text-podio-ink"
                    style={{ backgroundColor: chip.bg }}
                  >
                    {chip.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-podio-secondary">
                  {run.phase ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-podio-secondary">
                    {formatCounts(run.counts) || "—"}
                  </span>
                  {hasDetails && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-podio-teal">
                        Notes ({notes.length + (run.error ? 1 : 0)})
                      </summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-podio-secondary">
                        {notes.map((n, i) => (
                          <li key={i}>· {n}</li>
                        ))}
                        {run.error && (
                          <li className="text-[#A33B33]">Error: {run.error}</li>
                        )}
                      </ul>
                    </details>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-podio-meta">
                  {relativeTime(run.updated_at)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {ws && (
                    <Link
                      href={`/org/${orgSlug}/${ws.slug}`}
                      className="text-podio-teal hover:underline"
                    >
                      Open workspace
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
