"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PodioIcon } from "@/components/podio-icon";

export type PickerWorkspace = { id: string; name: string; slug: string };
export type PickerOrg = {
  id: string;
  name: string;
  slug: string;
  role: string;
  workspaces: PickerWorkspace[];
};

// Long workspace lists collapse behind "MORE WORKSPACES ⌄" (Podio does the
// same in its org drawer) — client toggle state per org.
const COLLAPSE_AFTER = 10;

// The cross-org twin of WorkspaceDrawer (src/app/org/[orgSlug]/workspace-drawer.tsx):
// on pages with no org context (/home, /tasks, /calendar, …) the global bar's
// ☰ opens THIS left slide-over listing every organization with its
// workspaces, instead of navigating away. Same slide-over mechanics as the
// org drawer: fixed backdrop (click closes), ESC closes, white w-80 panel.
export function OrgPickerDrawer({ orgs }: { orgs: PickerOrg[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Choose a workspace or app"
        className="flex min-w-0 items-center gap-3 hover:opacity-80"
      >
        <PodioIcon icon="menu" className="h-5 w-5 shrink-0" />
        <span className="truncate text-[15px] font-semibold text-podio-ink">
          Choose a workspace or app
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30" onClick={close}>
          <div
            className="flex h-full w-80 flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-podio-border px-4 py-3.5">
              <span className="text-lg font-semibold text-podio-ink">
                Workspaces
              </span>
              <button
                onClick={close}
                aria-label="Close"
                className="ml-auto text-2xl leading-none text-podio-disabled hover:text-podio-ink"
              >
                ✕
              </button>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {orgs.map((org) => {
                const showAll = !!expanded[org.id];
                const visible = showAll
                  ? org.workspaces
                  : org.workspaces.slice(0, COLLAPSE_AFTER);
                const hiddenCount = org.workspaces.length - COLLAPSE_AFTER;
                return (
                  <section
                    key={org.id}
                    className="border-b border-podio-border pb-2 pt-2 first:pt-1 last:border-b-0"
                  >
                    {/* Org header row: logo square (initial) + semibold name */}
                    <Link
                      href={`/org/${org.slug}`}
                      onClick={close}
                      title="Organization overview"
                      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-podio-row-hover"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-podio-chrome text-xs font-semibold text-podio-ink">
                        {org.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate font-semibold text-podio-ink">
                        {org.name}
                      </span>
                    </Link>

                    <ul className="mt-0.5 space-y-0.5">
                      {visible.map((ws) => (
                        <li key={ws.id}>
                          <Link
                            href={`/org/${org.slug}/${ws.slug}`}
                            onClick={close}
                            className="flex items-center gap-2 rounded py-1.5 pl-4 pr-2 text-[15px] text-podio-teal hover:bg-podio-row-hover"
                          >
                            <PodioIcon
                              icon="brick"
                              className="h-4 w-4 shrink-0 text-podio-secondary"
                            />
                            <span className="truncate">{ws.name}</span>
                          </Link>
                        </li>
                      ))}
                      {org.workspaces.length === 0 && (
                        <li className="py-1 pl-4 text-sm text-podio-meta">
                          No workspaces yet.
                        </li>
                      )}
                    </ul>

                    {!showAll && hiddenCount > 0 && (
                      <button
                        onClick={() =>
                          setExpanded((s) => ({ ...s, [org.id]: true }))
                        }
                        className="flex w-full items-center gap-1.5 rounded py-1.5 pl-4 pr-2 text-xs font-semibold uppercase tracking-wide text-podio-meta hover:bg-podio-row-hover"
                      >
                        More workspaces ({hiddenCount})
                        <span aria-hidden className="leading-none">
                          ⌄
                        </span>
                      </button>
                    )}

                    <div className="mt-0.5 space-y-0.5">
                      <Link
                        href={`/org/${org.slug}`}
                        onClick={close}
                        className="block rounded py-1 pl-4 pr-2 text-sm text-podio-teal hover:bg-podio-row-hover"
                      >
                        + Create a workspace
                      </Link>
                      <Link
                        href={`/org/${org.slug}/admin`}
                        onClick={close}
                        className="block rounded py-1 pl-4 pr-2 text-sm text-podio-teal hover:bg-podio-row-hover"
                      >
                        Manage workspaces
                      </Link>
                    </div>
                  </section>
                );
              })}
              {orgs.length === 0 && (
                <p className="px-2 py-2 text-sm text-podio-meta">
                  No organizations yet.
                </p>
              )}
            </nav>

            <div className="border-t border-podio-border p-3">
              <Link
                href="/home"
                onClick={close}
                className="block rounded px-2 py-1.5 text-sm text-podio-secondary hover:bg-podio-row-hover"
              >
                ← All organizations
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
