"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";

// Podio's app admin wrench mega-menu (see layouts.md §8b). Clicking the 🔧 in
// the views pane opens a wide white panel (w-[560px], rounded, shadow, caret
// pointing at the wrench) with a solid-teal "Modify Template" button on top
// and three uppercase sections — APP / DATA / ACTIONS — each a two-column
// grid of icon + label rows. Interactive tools that carry their own client
// logic (Excel export, share/publish to market) are passed in as named slots
// and rendered in their Podio positions (DATA → Excel Export, ACTIONS →
// Share app).

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 mt-4 border-b border-podio-border pb-1 text-[11px] font-semibold uppercase tracking-wider text-podio-meta">
      {children}
    </p>
  );
}

function Row({
  icon,
  label,
  href,
  tone = "ink",
  onNavigate,
}: {
  icon: string;
  label: string;
  href: string;
  tone?: "ink" | "danger";
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 rounded px-2 py-2 text-[14px] hover:bg-podio-row-hover ${
        tone === "danger" ? "text-red-600" : "text-podio-ink"
      }`}
    >
      <PodioIcon icon={icon} className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function InertRow({ icon, label }: { icon: string; label: string }) {
  return (
    <span
      title="Coming soon"
      className="flex cursor-default items-center gap-2.5 rounded px-2 py-2 text-[14px] text-podio-disabled"
    >
      <PodioIcon icon={icon} className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function AppToolsMenu({
  baseHref,
  appId,
  appName,
  wsId,
  exportSlot,
  shareSlot,
}: {
  baseHref: string; // /org/<org>/<ws>/<app>
  appId: string;
  appName: string;
  wsId: string;
  exportSlot?: ReactNode; // ExportButton (CSV / XLSX)
  shareSlot?: ReactNode; // SaveTemplateButton (publish to App Market)
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const close = () => setOpen(false);
  // Workspace path = app path minus its last segment (for the cloned app's slug)
  const wsHref = baseHref.slice(0, baseHref.lastIndexOf("/"));

  // Clone = snapshot the app as a private org template, then install that
  // template back into the same workspace (install suffixes the slug).
  async function cloneApp() {
    if (cloning) return;
    setCloning(true);
    setCloneError(null);
    const supabase = createClient();
    const { data: tpl, error: saveError } = await supabase.rpc(
      "save_app_template",
      {
        p_app: appId,
        p_name: `${appName} (clone)`,
        p_visibility: "private",
        p_include_samples: false,
      }
    );
    if (saveError || !tpl?.id) {
      setCloneError(saveError?.message ?? "Could not snapshot the app.");
      setCloning(false);
      return;
    }
    const { data: installed, error: installError } = await supabase.rpc(
      "install_app_template",
      { p_template: tpl.id, p_workspace: wsId, p_with_samples: false }
    );
    setCloning(false);
    if (installError) {
      setCloneError(installError.message);
      return;
    }
    setOpen(false);
    if (installed?.slug) router.push(`${wsHref}/${installed.slug}`);
    router.refresh();
  }

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
        <>
          {/* click-away layer */}
          <span className="fixed inset-0 z-20" onClick={close} />

          <div className="absolute -left-6 top-8 z-30 w-[560px] rounded-lg border border-podio-border bg-white p-4 shadow-xl">
            {/* caret pointing up at the wrench */}
            <span className="absolute -top-1.5 left-9 h-3 w-3 rotate-45 border-l border-t border-podio-border bg-white" />

            <Link
              href={`${baseHref}/edit`}
              onClick={close}
              className="block w-full rounded bg-podio-teal px-4 py-2 text-center text-[15px] font-semibold text-white hover:opacity-90"
            >
              Modify Template
            </Link>

            <SectionLabel>App</SectionLabel>
            <div className="grid grid-flow-col grid-rows-3 gap-x-6">
              <Row icon="gear" label="App settings" href={`${baseHref}/edit`} onNavigate={close} />
              <InertRow icon="layout" label="Layout options" />
              <Row icon="key" label="Developer" href="/developers" onNavigate={close} />
              <Row icon="bolt" label="Workflows" href={`${baseHref}/automations`} onNavigate={close} />
              <Row icon="activity" label="Workflow automation" href={`${baseHref}/automations`} onNavigate={close} />
              <Row icon="calendar" label="Add to calendar" href="/calendar" onNavigate={close} />
            </div>

            <SectionLabel>Data</SectionLabel>
            <div className="grid grid-flow-col grid-rows-3 gap-x-6">
              <Row icon="tray" label="Excel Import" href={`${baseHref}/import`} onNavigate={close} />
              {/* Excel Export: the interactive control itself */}
              <div className="flex items-center gap-2.5 rounded px-2 py-1.5">
                <PodioIcon icon="doc" className="h-[18px] w-[18px] shrink-0 text-podio-secondary" />
                <div className="min-w-0">{exportSlot}</div>
              </div>
              <Row icon="share-out" label="Webform" href={`${baseHref}/form`} onNavigate={close} />
              <Row icon="mail" label="Email to app" href={`${baseHref}/form#email-to-app`} onNavigate={close} />
              <Row icon="chain" label="Integration" href="/developers" onNavigate={close} />
              <InertRow icon="broom" label="Cleanup deleted field values" />
            </div>

            <SectionLabel>Actions</SectionLabel>
            <div className="grid grid-flow-col grid-rows-2 gap-x-6">
              <button
                onClick={cloneApp}
                disabled={cloning}
                className="flex items-center gap-2.5 rounded px-2 py-2 text-left text-[14px] text-podio-ink hover:bg-podio-row-hover disabled:opacity-60"
              >
                <PodioIcon icon="clone" className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{cloning ? "Cloning…" : "Clone app"}</span>
              </button>
              <Row icon="trash" label="Delete app" href={`${baseHref}/edit`} tone="danger" onNavigate={close} />
              {/* Share app: publish this app to the App Market */}
              <div className="flex items-center gap-2.5 rounded px-2 py-1.5">
                <PodioIcon icon="share-out" className="h-[18px] w-[18px] shrink-0 text-podio-secondary" />
                <div className="min-w-0">{shareSlot}</div>
              </div>
              <Row icon="archive" label="Archive app" href={`${baseHref}/edit`} onNavigate={close} />
            </div>

            {cloneError && (
              <p className="mt-2 text-xs text-red-600">{cloneError}</p>
            )}
          </div>
        </>
      )}
    </span>
  );
}
