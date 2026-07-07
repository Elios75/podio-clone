import Link from "next/link";
import { redirect } from "next/navigation";
import { GlobalBar } from "@/components/global-bar";
import { OrgPickerDrawer } from "@/components/org-picker-drawer";
import { PodioIcon } from "@/components/podio-icon";
import { getGlobalChrome } from "@/lib/global-chrome";

// Standalone global search. The global chrome NEVER disappears: the shared
// GlobalBar renders here with the search tool active and the ☰ org/workspace
// picker drawer in its left slot (design skill layouts.md §1).

// Monochrome PodioIcon per result kind — never colorful emoji (tokens.md).
const KIND_ICON: Record<string, string> = {
  item: "brick",
  task: "check-square",
  comment: "chat",
  file: "paperclip",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const chrome = await getGlobalChrome();
  if (!chrome) redirect("/login");
  const { supabase } = chrome;

  const { data: results } = q?.trim()
    ? await supabase.rpc("search_all", { p_query: q.trim() })
    : { data: null };

  return (
    <div className="flex min-h-screen flex-col bg-podio-page">
      <GlobalBar
        left={<OrgPickerDrawer orgs={chrome.pickerOrgs} />}
        activeTool="search"
        user={chrome.barUser}
        initialUnread={chrome.unread}
      />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold text-podio-ink">Search</h1>

        <form method="GET" className="mt-4 flex gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search items, tasks, comments, files…"
            autoFocus
            className="flex-1 rounded-sm border border-podio-border bg-white px-3 py-2 text-sm text-podio-ink outline-none placeholder:text-podio-meta focus:border-podio-teal"
          />
          <button className="rounded-sm bg-podio-teal px-4 py-2 text-sm font-semibold text-white hover:bg-podio-teal-dark">
            Search
          </button>
        </form>

        {q && (
          <ul className="mt-6 space-y-2">
            {(results ?? []).map((r: any, i: number) => (
              <li key={i}>
                <Link
                  href={r.href}
                  className="flex items-center gap-3 rounded border border-podio-border bg-white px-4 py-3 shadow-sm hover:border-podio-teal"
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
              </li>
            ))}
            {(results ?? []).length === 0 && (
              <li className="rounded border border-dashed border-podio-border bg-white p-8 text-center text-sm text-podio-meta">
                No results for “{q}”.
              </li>
            )}
          </ul>
        )}
      </main>
    </div>
  );
}
