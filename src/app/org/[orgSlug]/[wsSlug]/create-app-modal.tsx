"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PodioIcon, PODIO_ICONS } from "@/components/podio-icon";

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

  // Fresh form every time the modal opens.
  useEffect(() => {
    if (open) {
      setName("");
      setItemName("");
      setType("standard");
      setIcon("brick");
      setIconOpen(false);
    }
  }, [open]);

  if (!open) return null;

  const canCreate = name.trim().length > 0 && itemName.trim().length > 0;

  function create() {
    if (!canCreate) return;
    const params = new URLSearchParams({
      name: name.trim(),
      item: itemName.trim(),
      type,
      icon,
    });
    onClose();
    router.push(`/org/${orgSlug}/${wsSlug}/new-app?${params.toString()}`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: ink title on white, bottom border, grey ✕ */}
        <div className="flex items-center border-b border-podio-border bg-white px-6 py-4">
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

        <div className="flex">
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

            <div className="relative">
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
              {iconOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 grid w-72 grid-cols-8 gap-1 rounded border border-podio-border bg-white p-2 shadow-lg">
                  {PODIO_ICONS.map((i) => (
                    <button
                      key={i.key}
                      type="button"
                      title={i.label}
                      onClick={() => {
                        setIcon(i.key);
                        setIconOpen(false);
                      }}
                      className={`flex h-8 w-8 items-center justify-center rounded ${
                        icon === i.key
                          ? "bg-podio-row-hover ring-1 ring-podio-teal"
                          : "hover:bg-podio-row-alt"
                      }`}
                    >
                      <PodioIcon
                        icon={i.key}
                        className="h-5 w-5 text-podio-secondary"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer: grey Cancel + teal Create App, touching */}
        <div className="flex justify-end border-t border-podio-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-sm bg-podio-row-hover px-6 py-2.5 font-semibold text-podio-ink hover:bg-[#E0E0E0]"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={!canCreate}
            className="rounded-sm bg-podio-teal px-6 py-2.5 font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50"
          >
            Create App
          </button>
        </div>
      </div>
    </div>
  );
}
