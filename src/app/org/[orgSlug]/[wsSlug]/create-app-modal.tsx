"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/slug";
import { PodioIcon } from "@/components/podio-icon";
import { IconPicker } from "@/components/icon-picker";

// Podio "Create New App" modal: ink title on a white header row, General /
// Advanced left rail, App Name + Item Name + App Type + App Icon, and a
// grey Cancel + teal Create App footer. Creating does not hit the DB — it
// hands the choices to the existing app builder via URL params.
// See docs/design/podio-design-skill/references/layouts.md §9.

const APP_TYPES = [
  {
    value: "standard",
    name: "Standard",
    desc: "– the Podio default, useful for all types of apps",
  },
  {
    value: "event",
    name: "Event",
    desc: "– enables RSVP, event notifications and online meeting tools",
  },
  {
    value: "contact",
    name: "Contact",
    desc: "– manage your contacts in this app",
  },
] as const;

type AppType = (typeof APP_TYPES)[number]["value"];

export function CreateAppModal({
  orgSlug,
  wsSlug,
  open,
  onClose,
}: {
  orgSlug: string;
  wsSlug: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [itemName, setItemName] = useState("");
  const [type, setType] = useState<AppType>("standard");
  const [icon, setIcon] = useState("brick");
  const [iconOpen, setIconOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iconPanelRef = useRef<HTMLDivElement>(null);

  // The App Icon button sits at the bottom of the scrollable body, so the
  // picker can open below the fold — scroll it into view when it appears.
  useEffect(() => {
    if (iconOpen) {
      iconPanelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [iconOpen]);

  // Fresh form every time the modal opens.
  useEffect(() => {
    if (open) {
      setName("");
      setItemName("");
      setType("standard");
      setIcon("brick");
      setIconOpen(false);
      setSaving(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const canCreate = name.trim().length > 0 && itemName.trim().length > 0;

  // Create the app immediately (one required Title field, like real Podio)
  // and drop the user into the Modify Template editor to build the rest with
  // the fields palette — no intermediate builder page, no surprise fields.
  async function create() {
    if (!canCreate || saving) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const { data: ws, error: wsError } = await supabase
      .from("workspaces")
      .select("id, organizations!inner(slug)")
      .eq("slug", wsSlug)
      .eq("organizations.slug", orgSlug)
      .single();
    if (wsError || !ws) {
      setSaving(false);
      setError(wsError?.message ?? "Workspace not found.");
      return;
    }

    const { data: app, error: appError } = await supabase
      .from("apps")
      .insert({
        workspace_id: ws.id,
        name: name.trim(),
        slug: slugify(name.trim()),
        icon,
        item_name: itemName.trim() || "Item",
      })
      .select()
      .single();
    if (appError) {
      setSaving(false);
      setError(
        appError.message.includes("duplicate key")
          ? "An app with that name already exists in this workspace."
          : appError.message
      );
      return;
    }

    const { error: fieldError } = await supabase.from("app_fields").insert({
      app_id: app.id,
      external_id: "title-0",
      label: "Title",
      type: "text",
      is_required: true,
      is_primary: true,
      position: 0,
      config: {},
    });
    setSaving(false);
    if (fieldError) {
      setError(fieldError.message);
      return;
    }

    onClose();
    router.push(`/org/${orgSlug}/${wsSlug}/${app.slug}/edit`);
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100vh_-_6.5rem)] w-full max-w-2xl flex-col rounded bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: ink title on white, bottom border, grey ✕ */}
        <div className="flex shrink-0 items-center border-b border-podio-border bg-white px-6 py-4">
          <h2 className="text-xl font-semibold text-podio-ink">
            Create New App
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto text-2xl leading-none text-podio-disabled hover:text-podio-ink"
          >
            ✕
          </button>
        </div>

        {/* Body scrolls when the viewport is short; header/footer stay pinned */}
        <div className="flex min-h-0 flex-1 overflow-y-auto">
          {/* Left rail tabs */}
          <aside className="w-36 shrink-0 border-r border-podio-border bg-podio-row-alt">
            <div className="relative z-10 -mr-px border-b border-podio-border bg-white px-4 py-3 text-[15px] font-semibold text-podio-ink">
              General
            </div>
            <div
              aria-disabled="true"
              title="Coming soon"
              className="cursor-not-allowed border-b border-podio-border px-4 py-3 text-[15px] text-podio-meta"
            >
              Advanced
            </div>
          </aside>

          {/* Form */}
          <div className="min-w-0 flex-1 space-y-5 p-6">
            <label className="block">
              <span className="text-[15px] font-semibold text-podio-ink">
                App Name <span className="text-[#E5484D]">*</span>
              </span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Projects"
                className="mt-1.5 w-full rounded-sm border border-podio-border px-3 py-2 text-[15px] text-podio-ink focus:border-podio-teal focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="text-[15px] font-semibold text-podio-ink">
                Item Name <span className="text-[#E5484D]">*</span>
              </span>
              <input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Project"
                className="mt-1.5 w-full rounded-sm border border-podio-border px-3 py-2 text-[15px] text-podio-ink focus:border-podio-teal focus:outline-none"
              />
              <p className="mt-1 text-sm text-podio-meta">
                The type of record this app holds, e.g. Customer, Job.
              </p>
            </label>

            <fieldset>
              <legend className="text-[15px] font-semibold text-podio-ink">
                App Type
              </legend>
              <div className="mt-1.5 space-y-1.5">
                {APP_TYPES.map((t) => (
                  <label
                    key={t.value}
                    className="flex cursor-pointer items-baseline gap-2 text-[15px]"
                  >
                    <input
                      type="radio"
                      name="app-type"
                      checked={type === t.value}
                      onChange={() => setType(t.value)}
                      className="translate-y-0.5 accent-podio-teal"
                    />
                    <span>
                      <span className="font-semibold text-podio-ink">
                        {t.name}
                      </span>{" "}
                      <span className="text-podio-meta">{t.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <span className="text-[15px] font-semibold text-podio-ink">
                App Icon
              </span>
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={() => setIconOpen(!iconOpen)}
                  className="flex items-stretch rounded-sm border border-podio-border bg-white hover:border-podio-teal"
                >
                  <span className="flex h-11 w-11 items-center justify-center">
                    <PodioIcon
                      icon={icon}
                      className="h-6 w-6 text-podio-secondary"
                    />
                  </span>
                  <span className="flex w-7 items-center justify-center border-l border-podio-border bg-podio-row-alt text-podio-secondary">
                    ⌄
                  </span>
                </button>
              </div>
              {/* Inline (in-flow) picker: the modal body scrolls, so this is
                  always reachable. Picking keeps it open for browsing; the
                  button above toggles it closed. */}
              {iconOpen && (
                <div ref={iconPanelRef} className="mt-2">
                  <IconPicker value={icon} onChange={setIcon} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer: grey Cancel + teal Create App, touching */}
        <div className="flex shrink-0 items-center justify-end gap-4 border-t border-podio-border px-6 py-4">
          {error && <span className="mr-auto text-sm text-red-600">{error}</span>}
          <button
            onClick={onClose}
            className="rounded-sm bg-podio-row-hover px-6 py-2.5 font-semibold text-podio-ink hover:bg-[#E0E0E0]"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={!canCreate || saving}
            className="rounded-sm bg-podio-teal px-6 py-2.5 font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create App"}
          </button>
        </div>
      </div>
    </div>
  );
}
