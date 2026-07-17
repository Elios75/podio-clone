"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";

// Global-bar inline search (design skill layouts.md §1). Real Podio never
// leaves the page to search: the magnifier expands into a white rounded pill
// in the top bar, scoped to the app you are inside — placeholder "Search in
// <AppName>" — with live results in a dropdown. Outside an app context it
// searches everything (search_all). The /search page remains as the
// "Search everywhere" deep-search surface.
//
// App context comes from the URL (/org/:org/:ws/:appSlug/...) confirmed by an
// RLS-filtered lookup of the app's display name; workspace-level routes that
// share the segment shape (ai-builder, map, …) simply fail the lookup and
// fall back to global scope.

type Result = {
  kind: string;
  label: string;
  context: string;
  href: string;
  rank: number;
};

type AppCtx = { org: string; ws: string; app: string; name: string };

// Monochrome PodioIcon per result kind — never colorful emoji (tokens.md).
const KIND_ICON: Record<string, string> = {
  item: "brick",
  task: "check-square",
  comment: "chat",
  file: "paperclip",
};

export function GlobalSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [appCtx, setAppCtx] = useState<AppCtx | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);

  function close() {
    setOpen(false);
    setQ("");
    setResults(null);
  }

  // Resolve the current app (if any) whenever the route changes; navigating
  // away also dismisses an open search.
  useEffect(() => {
    close();
    const m = pathname?.match(/^\/org\/([^/]+)\/([^/]+)\/([^/]+)/);
    if (!m) {
      setAppCtx(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("apps")
        .select("name, workspaces!inner(slug, organizations!inner(slug))")
        .eq("slug", m[3])
        .eq("workspaces.slug", m[2])
        .eq("workspaces.organizations.slug", m[1])
        .limit(1);
      if (!cancelled) {
        setAppCtx(
          data?.[0]
            ? { org: m[1], ws: m[2], app: m[3], name: (data[0] as any).name }
            : null
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Debounced live search; a sequence counter drops stale responses.
  useEffect(() => {
    const query = q.trim();
    if (!open || !query) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      const seq = ++seqRef.current;
      const { data } = appCtx
        ? await supabase.rpc("search_app", {
            p_query: query,
            p_org: appCtx.org,
            p_ws: appCtx.ws,
            p_app: appCtx.app,
          })
        : await supabase.rpc("search_all", { p_query: query, p_limit: 8 });
      if (seq === seqRef.current) setResults((data as Result[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, appCtx]);

  const query = q.trim();

  return (
    <div ref={rootRef} className="relative">
      {!open ? (
        <button
          type="button"
          title="Search"
          onClick={() => setOpen(true)}
          className="block hover:opacity-80"
        >
          <PodioIcon icon="search" className="h-5 w-5" />
        </button>
      ) : (
        <div className="flex h-9 w-80 items-center gap-2 rounded-full bg-white pl-3 pr-2">
          <PodioIcon
            icon="search"
            className="h-4 w-4 shrink-0 text-podio-meta"
          />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "Enter" && results?.[0]) {
                const href = results[0].href;
                close();
                router.push(href);
              }
            }}
            placeholder={
              appCtx ? `Search in ${appCtx.name}` : "Search Podio Clone"
            }
            className="min-w-0 flex-1 bg-transparent text-sm text-podio-ink outline-none placeholder:text-podio-meta"
          />
          <button
            type="button"
            title="Close search"
            onClick={close}
            className="text-podio-meta hover:text-podio-ink"
          >
            <PodioIcon icon="x" className="h-4 w-4" />
          </button>
        </div>
      )}

      {open && query && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-96 w-96 overflow-y-auto rounded border border-podio-border bg-white py-1 shadow-md">
          {results === null ? (
            <div className="px-4 py-3 text-sm text-podio-meta">Searching…</div>
          ) : (
            <>
              {results.map((r, i) => (
                <Link
                  key={i}
                  href={r.href}
                  onClick={close}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-podio-row-hover"
                >
                  <PodioIcon
                    icon={KIND_ICON[r.kind] ?? "doc"}
                    className="h-5 w-5 shrink-0 text-podio-secondary"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-podio-ink">
                      {r.label}
                    </span>
                    <span className="block truncate text-xs text-podio-meta">
                      {r.context}
                    </span>
                  </span>
                </Link>
              ))}
              {results.length === 0 && (
                <div className="px-4 py-3 text-sm text-podio-meta">
                  No results for “{query}”.
                </div>
              )}
              <Link
                href={`/search?q=${encodeURIComponent(query)}`}
                onClick={close}
                className="mt-1 block border-t border-podio-border px-4 py-2 text-sm text-podio-teal hover:bg-podio-row-hover"
              >
                {appCtx ? "Search everywhere" : "Open full search"}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
