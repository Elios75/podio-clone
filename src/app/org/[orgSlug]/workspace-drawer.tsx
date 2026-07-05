"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PodioIcon } from "@/components/podio-icon";
import { CreateWorkspaceForm } from "./create-workspace-form";

type Ws = { id: string; name: string; slug: string; color: string | null };

// Podio keeps workspace navigation behind the ☰ hamburger: a left slide-over
// drawer. The page content (and each app's views pane) owns the full width.
export function WorkspaceDrawer({
  orgId,
  orgName,
  orgSlug,
  workspaces,
}: {
  orgId: string;
  orgName: string;
  orgSlug: string;
  workspaces: Ws[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Workspaces"
        className="flex items-center gap-3 hover:opacity-80"
      >
        <PodioIcon icon="menu" className="h-5 w-5" />
        <span className="truncate text-lg font-semibold text-podio-ink">
          {orgName}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-full w-72 flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-podio-border px-4 py-3.5">
              <Link
                href={`/org/${orgSlug}`}
                onClick={() => setOpen(false)}
                className="truncate text-lg font-semibold text-podio-ink hover:text-podio-teal"
                title="Organization overview"
              >
                {orgName}
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="ml-auto text-2xl leading-none text-podio-disabled hover:text-podio-ink"
              >
                ✕
              </button>
            </div>

            <p className="px-4 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-podio-meta">
              Workspaces
            </p>
            <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
              {workspaces.map((ws) => {
                const href = `/org/${orgSlug}/${ws.slug}`;
                const active = pathname?.startsWith(href);
                return (
                  <Link
                    key={ws.id}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`block truncate rounded px-2 py-1.5 text-[15px] ${
                      active
                        ? "bg-podio-row-hover font-semibold text-podio-teal"
                        : "text-podio-teal hover:bg-podio-row-hover"
                    }`}
                  >
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: ws.color ?? "#8A9494" }}
                    />
                    {ws.name}
                  </Link>
                );
              })}
              {workspaces.length === 0 && (
                <p className="px-2 text-sm text-podio-meta">
                  No workspaces yet.
                </p>
              )}
            </nav>

            <div className="space-y-1 border-t border-podio-border p-3">
              <CreateWorkspaceForm
                orgId={orgId}
                orgSlug={orgSlug}
                trigger="sidebar"
              />
              <Link
                href={`/org/${orgSlug}/admin`}
                onClick={() => setOpen(false)}
                className="block rounded px-2 py-1.5 text-sm text-podio-teal hover:bg-podio-row-hover"
              >
                Administration
              </Link>
              <Link
                href="/home"
                onClick={() => setOpen(false)}
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
