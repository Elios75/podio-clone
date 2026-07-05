"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { PodioIcon } from "@/components/podio-icon";

// App admin wrench menu for the left views pane. Mirrors the workspace
// header's wrench dropdown (w-64 white rounded-lg shadow, icon + label rows) —
// see workspace-header.tsx and layouts.md §8. Interactive tools that carry
// their own client logic (export, save as template) are passed in as
// `children` and rendered in a bordered footer section of the menu.
export function AppToolsMenu({
  links,
  children,
}: {
  links: { label: string; href: string; icon: string }[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        title="App admin"
        className={`${open ? "text-podio-teal" : "text-podio-meta"} hover:text-podio-teal`}
      >
        <PodioIcon icon="wrench" className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-20 w-64 rounded-lg border border-podio-border bg-white py-1 shadow-lg">
          {links.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-[15px] text-podio-ink hover:bg-podio-row-hover"
            >
              <PodioIcon icon={m.icon} className="h-5 w-5 shrink-0" />
              {m.label}
            </Link>
          ))}
          {children && (
            <div className="mt-1 flex flex-col items-start gap-2 border-t border-podio-border px-4 py-2.5">
              {children}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
