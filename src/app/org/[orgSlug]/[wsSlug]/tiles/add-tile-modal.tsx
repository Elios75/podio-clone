"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PodioIcon } from "@/components/podio-icon";

// Podio's "Add tile" picker for the workspace dashboard. A centered modal
// with a left tab rail (Overviews / Apps / Reports & Charts) and a right
// pane of picker rows, matching the real Podio tile picker's layout.

export type TileSpec = {
  title: string;
  kind:
    | "count"
    | "sum"
    | "avg"
    | "grouped"
    | "app"
    | "tasks"
    | "calendar"
    | "files"
    | "contacts"
    | "text"
    | "iframe"
    | "youtube";
  appId: string | null;
  config: Record<string, any>;
};

export type TileApp = {
  id: string;
  name: string;
  icon: string | null;
  // may contain composite ids "fieldId:columnId" (numeric columns inside table fields)
  numberFields: { id: string; label: string }[];
  categoryFields: { id: string; label: string }[];
};

type Tab = "overviews" | "apps" | "reports";
// Second-step screens inside the Overviews tab, or the report config step.
type Step =
  | { kind: "list" }
  | { kind: "text" }
  | { kind: "iframe" }
  | { kind: "youtube" }
  | { kind: "report"; app: TileApp };

const inputCls =
  "w-full rounded border border-podio-border bg-white px-3 py-2 text-[15px] text-podio-ink outline-none placeholder:text-podio-disabled focus:border-podio-teal";

function PickerRow({
  icon,
  iconName,
  title,
  subtitle,
  disabled,
  onClick,
}: {
  icon: string | null;
  iconName?: string;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-podio-row-hover disabled:opacity-60"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-podio-border bg-white">
        <PodioIcon
          icon={icon}
          name={iconName}
          className="h-6 w-6 text-podio-secondary"
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold text-podio-ink">
          {title}
        </span>
        <span className="block truncate text-xs text-podio-secondary">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="mb-3 flex items-center gap-2 rounded border border-podio-border bg-white px-3 py-2">
      <PodioIcon icon="search" className="h-4 w-4 shrink-0 text-podio-meta" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[15px] text-podio-ink outline-none placeholder:text-podio-disabled"
      />
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-semibold text-podio-secondary">{label}</p>
      {children}
    </div>
  );
}

export function AddTileModal({
  open,
  onClose,
  onAdd,
  apps,
  wsName,
}: {
  open: boolean;
  onClose: () => void;
  // resolves to an error message, or null on success (parent closes the modal)
  onAdd: (spec: TileSpec) => Promise<string | null>;
  apps: TileApp[];
  wsName: string;
}) {
  const [tab, setTab] = useState<Tab>("overviews");
  const [step, setStep] = useState<Step>({ kind: "list" });
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Second-step form fields (shared across text / iframe / youtube / report).
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [height, setHeight] = useState(320);
  const [reportKind, setReportKind] = useState<
    "count" | "sum" | "avg" | "grouped"
  >("count");
  const [numberField, setNumberField] = useState("");
  const [groupField, setGroupField] = useState("");

  // Reset everything whenever the modal (re)opens.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setTab("overviews");
      setStep({ kind: "list" });
      setSearch("");
      setPending(false);
      setError(null);
      setTitle("");
      setText("");
      setUrl("");
      setHeight(320);
      setReportKind("count");
      setNumberField("");
      setGroupField("");
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(spec: TileSpec) {
    if (pending) return;
    setPending(true);
    setError(null);
    const err = await onAdd(spec);
    setPending(false);
    if (err) {
      setError(err);
    } else {
      // Parent closes/refreshes on success — reset our step state so a
      // reopened modal (or a kept-open one) starts clean.
      setStep({ kind: "list" });
      setTitle("");
      setText("");
      setUrl("");
      setHeight(320);
    }
  }

  function switchTab(t: Tab) {
    setTab(t);
    setStep({ kind: "list" });
    setSearch("");
    setError(null);
  }

  function openStep(s: Step, defaultTitle = "") {
    setStep(s);
    setError(null);
    setTitle(defaultTitle);
    setText("");
    setUrl("");
    setHeight(320);
    setReportKind("count");
    setNumberField("");
    setGroupField("");
  }

  const q = search.trim().toLowerCase();
  const filteredApps = q
    ? apps.filter((a) => a.name.toLowerCase().includes(q))
    : apps;

  const backLink = (
    <button
      type="button"
      onClick={() => {
        setStep({ kind: "list" });
        setError(null);
      }}
      className="mb-3 text-[13px] text-podio-teal hover:underline"
    >
      &lsaquo; back
    </button>
  );

  const errorLine = error ? (
    <p className="mb-2 text-xs text-red-600">{error}</p>
  ) : null;

  const cancelAdd = (onAddClick: () => void, addLabel = "Add") => (
    <div className="mt-4 flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => {
          setStep({ kind: "list" });
          setError(null);
        }}
        className="rounded border border-podio-border bg-white px-4 py-2 text-[14px] text-podio-secondary hover:bg-podio-row-hover"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onAddClick}
        disabled={pending}
        className="rounded bg-podio-teal px-4 py-2 text-[14px] font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-60"
      >
        {pending ? "Adding…" : addLabel}
      </button>
    </div>
  );

  let pane: ReactNode;

  if (step.kind === "text") {
    pane = (
      <div>
        {backLink}
        <Field label="Title">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Welcome"
          />
        </Field>
        <Field label="Text">
          <textarea
            className={`${inputCls} min-h-[120px] resize-y`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Greeting or instruction to members of ${wsName}`}
          />
        </Field>
        {errorLine}
        {cancelAdd(() => {
          if (!text.trim()) {
            setError("Write some text for the tile.");
            return;
          }
          void submit({
            title: title.trim() || "Text",
            kind: "text",
            appId: null,
            config: { text },
          });
        })}
      </div>
    );
  } else if (step.kind === "iframe") {
    pane = (
      <div>
        {backLink}
        <Field label="Title">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Web Embed"
          />
        </Field>
        <Field label="URL">
          <input
            className={inputCls}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>
        <Field label="Height (px)">
          <input
            type="number"
            className={`${inputCls} w-32`}
            value={height}
            min={80}
            onChange={(e) => setHeight(Number(e.target.value) || 0)}
          />
        </Field>
        {errorLine}
        {cancelAdd(() => {
          const u = url.trim();
          if (!u.startsWith("http")) {
            setError("Enter a URL starting with http(s)://");
            return;
          }
          void submit({
            title: title.trim() || "Web Embed",
            kind: "iframe",
            appId: null,
            config: { url: u, height: height || 320 },
          });
        })}
      </div>
    );
  } else if (step.kind === "youtube") {
    pane = (
      <div>
        {backLink}
        <Field label="Title (optional)">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Video"
          />
        </Field>
        <Field label="URL">
          <input
            className={inputCls}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="YouTube link"
          />
        </Field>
        {errorLine}
        {cancelAdd(() => {
          const u = url.trim();
          if (!u) {
            setError("Paste a YouTube link.");
            return;
          }
          void submit({
            title: title.trim() || "Video",
            kind: "youtube",
            appId: null,
            config: { url: u },
          });
        })}
      </div>
    );
  } else if (step.kind === "report") {
    const app = step.app;
    const needsNumber = reportKind === "sum" || reportKind === "avg";
    const showNumber = needsNumber || reportKind === "grouped";
    pane = (
      <div>
        {backLink}
        <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-podio-ink">
          <PodioIcon
            icon={app.icon}
            name={app.name}
            className="h-5 w-5 text-podio-secondary"
          />
          {app.name}
        </div>
        <Field label="Title">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`${app.name} report`}
          />
        </Field>
        <Field label="Report type">
          <select
            className={inputCls}
            value={reportKind}
            onChange={(e) => setReportKind(e.target.value as typeof reportKind)}
          >
            <option value="count">Count</option>
            <option value="sum">Sum</option>
            <option value="avg">Average</option>
            <option value="grouped">Grouped chart</option>
          </select>
        </Field>
        {showNumber && (
          <Field
            label={
              needsNumber ? "Number field" : "Number field (optional)"
            }
          >
            <select
              className={inputCls}
              value={numberField}
              onChange={(e) => setNumberField(e.target.value)}
            >
              <option value="">
                {needsNumber ? "Pick a number field…" : "Count of items"}
              </option>
              {app.numberFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {reportKind === "grouped" && (
          <Field label="Group by">
            <select
              className={inputCls}
              value={groupField}
              onChange={(e) => setGroupField(e.target.value)}
            >
              <option value="">Pick a category field…</option>
              {app.categoryFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {errorLine}
        {cancelAdd(() => {
          if (!title.trim()) {
            setError("Give the report a title.");
            return;
          }
          if (needsNumber && !numberField) {
            setError("Pick a number field to aggregate.");
            return;
          }
          if (reportKind === "grouped" && !groupField) {
            setError("Pick a field to group by.");
            return;
          }
          // numberField may be a composite "fieldId:columnId" for numeric
          // columns inside table fields — split it into its two parts.
          const [nf, col] = numberField.split(":");
          void submit({
            title: title.trim(),
            kind: reportKind,
            appId: app.id,
            config: {
              number_field_id: nf || null,
              table_column_id: col || null,
              group_field_id: groupField || null,
            },
          });
        })}
      </div>
    );
  } else if (tab === "overviews") {
    pane = (
      <div className="space-y-1">
        {errorLine}
        <PickerRow
          icon="check-square"
          title="Workspace Tasks"
          subtitle={`Uncompleted tasks in ${wsName}`}
          disabled={pending}
          onClick={() =>
            void submit({ title: "Tasks", kind: "tasks", appId: null, config: {} })
          }
        />
        <PickerRow
          icon="calendar"
          title="Workspace Calendar"
          subtitle={`Meetings and events in ${wsName}`}
          disabled={pending}
          onClick={() =>
            void submit({
              title: "Calendar",
              kind: "calendar",
              appId: null,
              config: {},
            })
          }
        />
        <PickerRow
          icon="doc"
          title="Workspace Files"
          subtitle={`Recent files in ${wsName}`}
          disabled={pending}
          onClick={() =>
            void submit({ title: "Files", kind: "files", appId: null, config: {} })
          }
        />
        <PickerRow
          icon="contact"
          title="Workspace Contacts"
          subtitle={`Members of ${wsName}`}
          disabled={pending}
          onClick={() =>
            void submit({
              title: "Contacts",
              kind: "contacts",
              appId: null,
              config: {},
            })
          }
        />
        <PickerRow
          icon="pencil"
          title="Text"
          subtitle="Greeting or instruction to members"
          onClick={() => openStep({ kind: "text" }, "Text")}
        />
        <PickerRow
          icon="link"
          title="Web Embed"
          subtitle="A website, Google Doc or Sheet shown inside a tile"
          onClick={() => openStep({ kind: "iframe" }, "Web Embed")}
        />
        <PickerRow
          icon="link"
          title="YouTube"
          subtitle="A YouTube video player"
          onClick={() => openStep({ kind: "youtube" }, "")}
        />
      </div>
    );
  } else {
    // "apps" and "reports" tabs share the search + app-row list; they differ
    // in the placeholder and in what a click does.
    const isReports = tab === "reports";
    pane = (
      <div>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder={
            isReports
              ? "Pick the app to base your report on"
              : "Pick the app to show content from"
          }
        />
        {errorLine}
        <div className="space-y-1">
          {filteredApps.map((a) => (
            <PickerRow
              key={a.id}
              icon={a.icon}
              iconName={a.name}
              title={a.name}
              subtitle={wsName}
              disabled={pending}
              onClick={() => {
                if (isReports) {
                  openStep({ kind: "report", app: a }, a.name);
                } else {
                  void submit({
                    title: a.name,
                    kind: "app",
                    appId: a.id,
                    config: {},
                  });
                }
              }}
            />
          ))}
          {filteredApps.length === 0 && (
            <p className="px-2 py-4 text-[14px] text-podio-meta">
              No apps match &ldquo;{search}&rdquo;.
            </p>
          )}
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overviews", label: "Overviews" },
    { key: "apps", label: "Apps" },
    { key: "reports", label: "Reports & Charts" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-[640px] max-w-full flex-col rounded border border-podio-border bg-white shadow-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-podio-border px-4 py-3">
          <h2 className="text-[17px] font-semibold text-podio-teal">Add tile</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="text-podio-meta hover:text-podio-ink"
          >
            <PodioIcon icon="x" className="h-4 w-4" />
          </button>
        </div>

        {/* Body: left tab rail + right pane */}
        <div className="flex min-h-0 flex-1">
          <div className="w-[200px] shrink-0 divide-y divide-podio-border border-r border-podio-border bg-podio-row-alt">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => switchTab(t.key)}
                className={`block w-full px-4 py-3 text-left text-[15px] ${
                  tab === t.key
                    ? "bg-white font-semibold text-podio-ink"
                    : "text-podio-secondary hover:bg-podio-row-hover hover:text-podio-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{pane}</div>
        </div>
      </div>
    </div>
  );
}
