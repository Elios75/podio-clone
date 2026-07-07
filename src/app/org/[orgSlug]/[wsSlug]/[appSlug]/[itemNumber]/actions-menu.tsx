"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type FileRef = { name: string; url: string };

// Record view "Actions ⌄" dropdown (Podio grammar): plain text rows, a divider
// before a red Delete. Print / Download / Email / Developer Info are handled
// client-side; Clone / Refresh Calculations / Delete call the migration-52 RPCs.
export function ActionsMenu({
  itemId,
  appId,
  appSlug,
  itemNumber,
  appHref,
  emailAddress,
  files,
  apiPath,
  createdAt,
  updatedAt,
}: {
  itemId: string;
  appId: string;
  appSlug: string;
  itemNumber: number;
  appHref: string;
  emailAddress: string | null;
  files: FileRef[];
  apiPath: string;
  createdAt: string;
  updatedAt: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "developer" | "email">(null);
  const [emailAddr, setEmailAddr] = useState<string | null>(emailAddress);
  const [copied, setCopied] = useState<string | null>(null);

  const domain = process.env.NEXT_PUBLIC_INBOUND_DOMAIN ?? "inbound.example.com";
  const itemEmail = (base: string) => {
    const [local, dom] = base.split("@");
    return `${local}+i${itemNumber}@${dom}`;
  };

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
  }

  async function clone() {
    setBusy("clone");
    setError(null);
    const { data, error: e } = await supabase.rpc("clone_item", { p_item: itemId });
    if (e || !data) {
      setBusy(null);
      return setError(e?.message ?? "Clone failed");
    }
    const num = Array.isArray(data) ? data[0]?.item_number : (data as any).item_number;
    router.push(`${appHref}/${num}`);
  }

  async function refreshCalcs() {
    setBusy("recalc");
    setError(null);
    const { error: e } = await supabase.rpc("recalc_item", { p_item: itemId });
    setBusy(null);
    setOpen(false);
    if (e) return setError(e.message);
    router.refresh();
  }

  async function del() {
    if (!confirm("Delete this item? It will be removed from all views.")) return;
    setBusy("delete");
    setError(null);
    const { error: e } = await supabase.rpc("delete_item", { p_item: itemId });
    if (e) {
      setBusy(null);
      return setError(e.message);
    }
    router.push(appHref);
  }

  async function emailToItem() {
    setError(null);
    if (emailAddr) {
      setOpen(false);
      return setModal("email");
    }
    // Auto-create an inbound address for the app, then show the item address.
    setBusy("email");
    const addr = `${appSlug}-${Math.random().toString(36).slice(2, 8)}@${domain}`;
    const { error: e } = await supabase
      .from("app_email_addresses")
      .insert({ app_id: appId, address: addr, field_mapping: {} });
    setBusy(null);
    if (e) return setError(e.message);
    setEmailAddr(addr);
    setOpen(false);
    setModal("email");
  }

  function downloadAll() {
    setOpen(false);
    files.forEach((f, i) => {
      setTimeout(() => {
        const sep = f.url.includes("?") ? "&" : "?";
        const a = document.createElement("a");
        a.href = `${f.url}${sep}download=${encodeURIComponent(f.name)}`;
        a.download = f.name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400);
    });
  }

  const row =
    "flex w-full items-center px-4 py-2 text-left text-[15px] text-podio-ink hover:bg-podio-row-hover disabled:cursor-not-allowed disabled:text-podio-disabled disabled:hover:bg-transparent";

  return (
    <div className="relative mb-2 inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 px-1 py-1.5 text-sm text-podio-secondary hover:text-podio-ink"
      >
        Actions ⌄
      </button>

      {open && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute left-0 z-50 mt-1 w-60 rounded-lg border border-podio-border bg-white py-1.5 shadow-xl">
            <button className={row} onClick={() => { setOpen(false); window.print(); }}>
              Print
            </button>
            <button className={row} disabled={busy === "clone"} onClick={clone}>
              {busy === "clone" ? "Cloning…" : "Clone"}
            </button>
            <button className={row} disabled={busy === "email"} onClick={emailToItem}>
              {busy === "email" ? "Creating address…" : "Email to item"}
            </button>
            <button className={row} disabled={files.length === 0} onClick={downloadAll}>
              Download all files{files.length ? ` (${files.length})` : ""}
            </button>
            <button className={row} onClick={() => { setOpen(false); setModal("developer"); }}>
              Developer Info
            </button>
            <button className={row} disabled={busy === "recalc"} onClick={refreshCalcs}>
              {busy === "recalc" ? "Refreshing…" : "Refresh Calculations"}
            </button>
            <div className="my-1 border-t border-podio-border" />
            <button
              className="flex w-full items-center px-4 py-2 text-left text-[15px] text-red-600 hover:bg-red-50 disabled:opacity-60"
              disabled={busy === "delete"}
              onClick={del}
            >
              {busy === "delete" ? "Deleting…" : "Delete"}
            </button>
          </div>
        </>
      )}

      {error && (
        <span className="ml-2 text-xs text-red-600">{error}</span>
      )}

      {/* Developer Info modal */}
      {modal === "developer" && (
        <Modal title="Developer Info" onClose={() => setModal(null)}>
          <dl className="space-y-3 text-sm">
            <InfoRow label="Item ID" value={itemId} onCopy={() => copy(itemId, "item")} copied={copied === "item"} />
            <InfoRow label="App ID" value={appId} onCopy={() => copy(appId, "app")} copied={copied === "app"} />
            <InfoRow label="Item number" value={`#${itemNumber}`} />
            <InfoRow label="Created" value={new Date(createdAt).toLocaleString()} />
            <InfoRow label="Updated" value={new Date(updatedAt).toLocaleString()} />
            <InfoRow
              label="API endpoint"
              value={apiPath}
              onCopy={() =>
                copy(`${typeof window !== "undefined" ? window.location.origin : ""}${apiPath}`, "api")
              }
              copied={copied === "api"}
            />
          </dl>
        </Modal>
      )}

      {/* Email to item modal */}
      {modal === "email" && emailAddr && (
        <Modal title="Email to this item" onClose={() => setModal(null)}>
          <p className="text-sm text-podio-secondary">
            Forward or send an email to the address below and it will be added as
            a comment on this {`item`}. Replies thread onto the item.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-podio-row-alt px-3 py-2 text-sm text-podio-ink">
              {itemEmail(emailAddr)}
            </code>
            <button
              onClick={() => copy(itemEmail(emailAddr), "email")}
              className="rounded-sm bg-podio-teal px-3 py-2 text-sm font-semibold text-white hover:bg-podio-teal-dark"
            >
              {copied === "email" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-podio-meta">
            Requires an inbound email provider pointed at{" "}
            <code>/api/inbound-email</code>.
          </p>
        </Modal>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <dt className="w-28 shrink-0 text-podio-meta">{label}</dt>
      <dd className="min-w-0 flex-1 truncate font-mono text-xs text-podio-ink">{value}</dd>
      {onCopy && (
        <button onClick={onCopy} className="shrink-0 text-xs text-podio-teal hover:underline">
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start">
          <h2 className="text-xl font-semibold text-podio-teal">{title}</h2>
          <button
            onClick={onClose}
            className="ml-auto text-2xl leading-none text-podio-disabled hover:text-podio-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
