import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const KIND_ICON: Record<string, string> = {
  item: "📄",
  task: "✓",
  comment: "💬",
  file: "📎",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: results } = q?.trim()
    ? await supabase.rpc("search_all", { p_query: q.trim() })
    : { data: null };

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Search</h1>
        <Link href="/home" className="text-sm text-slate-500 hover:underline">← Home</Link>
      </div>

      <form method="GET" className="mt-4 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search items, tasks, comments, files…"
          autoFocus
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Search
        </button>
      </form>

      {q && (
        <ul className="mt-6 space-y-2">
          {(results ?? []).map((r: any, i: number) => (
            <li key={i}>
              <Link
                href={r.href}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-blue-400"
              >
                <span>{KIND_ICON[r.kind] ?? "•"}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.label}</span>
                  <span className="block truncate text-xs text-slate-400">{r.context}</span>
                </span>
              </Link>
            </li>
          ))}
          {(results ?? []).length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              No results for “{q}”.
            </li>
          )}
        </ul>
      )}
    </main>
  );
}
