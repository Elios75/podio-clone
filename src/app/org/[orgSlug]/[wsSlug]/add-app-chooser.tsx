"use client";

import { useState } from "react";
import Link from "next/link";
import { PodioIcon } from "@/components/podio-icon";
import { CreateAppModal } from "./create-app-modal";

// Podio "Add app" chooser: build your own vs. install from the App Market.
// Shown from the app tab bar's ADD APP tile. "Create your own app" opens the
// Create New App modal; the App Market card stays a link.
// See docs/design/podio-design-skill/references/layouts.md §9.
export function AddAppChooser({
  orgSlug,
  wsSlug,
}: {
  orgSlug: string;
  wsSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const base = `/org/${orgSlug}/${wsSlug}`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-20 shrink-0 flex-col items-center gap-1 px-2 py-3 text-[13px] uppercase text-podio-disabled hover:text-podio-secondary"
      >
        <PodioIcon icon="add" className="h-6 w-6" />
        Add app
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded bg-white p-8 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start">
              <h2 className="text-2xl font-medium text-podio-teal">Add app</h2>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto text-2xl leading-none text-podio-disabled hover:text-podio-ink"
              >
                ✕
              </button>
            </div>

            <div className="mt-8 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
                className="flex flex-1 flex-col items-center gap-4 border border-podio-border bg-podio-row-alt p-10 text-center hover:border-podio-teal"
              >
                <PodioIcon icon="tools" className="h-12 w-12 text-podio-secondary" />
                <span className="text-xl font-semibold text-podio-ink">
                  Create your own app
                </span>
                <span className="text-[15px] text-podio-meta">
                  Go to the app template to create it yourself in minutes.
                </span>
              </button>

              <span className="text-center text-lg text-podio-ink">or</span>

              <Link
                href={`${base}/market`}
                onClick={() => setOpen(false)}
                className="flex flex-1 flex-col items-center gap-4 border border-podio-border bg-podio-row-alt p-10 text-center hover:border-podio-teal"
              >
                <PodioIcon icon="store" className="h-12 w-12 text-podio-secondary" />
                <span className="text-xl font-semibold text-podio-ink">
                  Go to the App Market
                </span>
                <span className="text-[15px] text-podio-meta">
                  Pick one of the predefined app templates made by people who
                  work just like you.
                </span>
              </Link>
            </div>

            <p className="mt-6 text-center text-sm text-podio-meta">
              You can also{" "}
              <Link href={`${base}/ai-builder`} onClick={() => setOpen(false)}
                className="text-podio-teal hover:underline">
                describe it and let AI build it
              </Link>{" "}
              or{" "}
              <Link href={`${base}/new-app-from-csv`} onClick={() => setOpen(false)}
                className="text-podio-teal hover:underline">
                import a CSV
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <CreateAppModal
        orgSlug={orgSlug}
        wsSlug={wsSlug}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
