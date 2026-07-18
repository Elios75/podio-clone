"use client";

import { useState } from "react";

// Web Embed dashboard tile — shows an external website / Google Doc / Sheet
// inside an iframe. Google SHEETS get two embeddable views: the full
// interactive grid (/htmlembed — sheet tabs along the bottom, closest to
// "open in Google Sheets") and the paginated /preview. htmlembed is the
// default but is less reliable for private sheets, and a blocked iframe is
// undetectable cross-origin — so a Grid | Preview toggle under the frame is
// the fallback.

// Matches docs.google.com/(document|spreadsheets|presentation)/d/<id>/edit...
const GOOGLE_DOCS_EDIT_RE =
  /^\/(document|spreadsheets|presentation)\/d\/([^/]+)\/edit.*$/;

// Matches drive.google.com/file/d/<id>/view...
const DRIVE_FILE_VIEW_RE = /^\/file\/d\/([^/]+)\/view.*$/;

// Google Sheets get a Grid/Preview choice: /htmlembed renders the full
// interactive grid with sheet tabs; /preview is the paginated read-only
// view. Returns null for anything that isn't a Sheets link.
export function sheetVariants(
  raw: string
): { grid: string; preview: string } | null {
  const normalized = normalizeEmbedUrl(raw);
  if (!normalized.url) return null;
  let url: URL;
  try {
    url = new URL(normalized.url);
  } catch {
    return null;
  }
  if (url.hostname !== "docs.google.com") return null;
  const m = url.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
  if (!m) return null;
  return {
    grid: `https://docs.google.com/spreadsheets/d/${m[1]}/htmlembed`,
    preview: `https://docs.google.com/spreadsheets/d/${m[1]}/preview`,
  };
}

// Normalize a user-pasted URL into an embeddable one.
// Returns { url: string } on success or { url: null, reason: string } when
// the input can't be embedded (non-http(s), unparseable).
export function normalizeEmbedUrl(raw: string): {
  url: string | null;
  reason?: string;
} {
  let input = raw.trim();
  if (input === "") {
    return { url: null, reason: "Only http(s) links can be embedded." };
  }

  // If there's no scheme but it looks like a domain, assume https.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input) && /^[\w-]+(\.[\w-]+)+/.test(input)) {
    input = `https://${input}`;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { url: null, reason: "Only http(s) links can be embedded." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { url: null, reason: "Only http(s) links can be embedded." };
  }

  // The app is served over https; an http frame would be blocked as mixed
  // content anyway, so upgrade it.
  if (url.protocol === "http:") {
    url.protocol = "https:";
  }

  // Google Docs/Sheets/Slides "edit" links → /preview (embeddable read-only view).
  if (url.hostname === "docs.google.com") {
    const match = url.pathname.match(GOOGLE_DOCS_EDIT_RE);
    if (match) {
      url.pathname = `/${match[1]}/d/${match[2]}/preview`;
    }
  }

  // Google Drive file links → /preview.
  if (url.hostname === "drive.google.com") {
    const match = url.pathname.match(DRIVE_FILE_VIEW_RE);
    if (match) {
      url.pathname = `/file/d/${match[1]}/preview`;
    }
  }

  return { url: url.toString() };
}

export function IframeTile({
  url,
  height,
  fill = false,
}: {
  url: string;
  height?: number;
  fill?: boolean; // canvas tabs: fill the viewport instead of a fixed height
}) {
  const variants = sheetVariants(url);
  const [sheetView, setSheetView] = useState<"grid" | "preview">("grid");
  const normalized = normalizeEmbedUrl(url);

  const src = variants
    ? sheetView === "grid"
      ? variants.grid
      : variants.preview
    : normalized.url;

  if (!src) {
    return (
      <div className="rounded border border-podio-border bg-podio-row-alt p-4 text-sm text-podio-meta">
        {normalized.reason ?? "This link can't be embedded."}
      </div>
    );
  }

  const hostname = new URL(src).hostname;

  return (
    <div>
      <iframe
        // Key remount per src so switching Grid/Preview reloads cleanly.
        key={src}
        src={src}
        title="Embedded content"
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        className={
          fill
            ? "h-[calc(100dvh_-_13rem)] min-h-[420px] w-full rounded border border-podio-border bg-white"
            : "w-full rounded border border-podio-border bg-white"
        }
        style={fill ? undefined : { height: height && height >= 120 ? height : 320 }}
      />
      {/* Some sites send X-Frame-Options / CSP frame-ancestors and render as an
          empty frame. We can't detect that client-side (the load failure is
          opaque cross-origin), so always offer the view toggle for Sheets and
          the open-in-new-tab escape hatch. */}
      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-podio-meta">
        <span className="min-w-0 truncate" title={hostname}>
          {hostname}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {variants && (
            <span className="flex items-center gap-1.5">
              {(["grid", "preview"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSheetView(v)}
                  title={
                    v === "grid"
                      ? "Full grid with sheet tabs (may not load for private sheets)"
                      : "Read-only preview"
                  }
                  className={
                    sheetView === v
                      ? "font-semibold text-podio-ink"
                      : "text-podio-teal hover:underline"
                  }
                >
                  {v === "grid" ? "Grid" : "Preview"}
                </button>
              ))}
            </span>
          )}
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-podio-teal hover:underline"
          >
            Open ↗
          </a>
        </span>
      </div>
    </div>
  );
}
