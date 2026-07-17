// Web Embed dashboard tile — shows an external website / Google Doc / Sheet
// inside an iframe. Server component; no state needed for a plain iframe.

// Matches docs.google.com/(document|spreadsheets|presentation)/d/<id>/edit...
const GOOGLE_DOCS_EDIT_RE =
  /^\/(document|spreadsheets|presentation)\/d\/([^/]+)\/edit.*$/;

// Matches drive.google.com/file/d/<id>/view...
const DRIVE_FILE_VIEW_RE = /^\/file\/d\/([^/]+)\/view.*$/;

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
}: {
  url: string;
  height?: number;
}) {
  const normalized = normalizeEmbedUrl(url);

  if (normalized.url === null) {
    return (
      <div className="rounded border border-podio-border bg-podio-row-alt p-4 text-sm text-podio-meta">
        {normalized.reason ?? "This link can't be embedded."}
      </div>
    );
  }

  const src = normalized.url;
  const hostname = new URL(src).hostname;

  return (
    <div>
      <iframe
        src={src}
        title="Embedded content"
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        className="w-full rounded border border-podio-border bg-white"
        style={{ height: height && height >= 120 ? height : 320 }}
      />
      {/* Some sites send X-Frame-Options / CSP frame-ancestors and render as an
          empty frame. We can't detect that client-side (the load failure is
          opaque cross-origin), so always offer the open-in-new-tab escape hatch. */}
      <div className="mt-1 flex items-center justify-between text-xs text-podio-meta">
        <span className="min-w-0 truncate" title={hostname}>
          {hostname}
        </span>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="ml-2 shrink-0 text-podio-teal hover:underline"
        >
          Open ↗
        </a>
      </div>
    </div>
  );
}
