import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExportAuditButton } from "./export-button";

const PAGE_SIZE = 50;

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ action?: string; days?: string; page?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations").select("id, name, slug").eq("slug", orgSlug).single();
  if (!org) notFound();

  const days = ["7", "30", "90", "all"].includes(sp.days ?? "") ? sp.days! : "30";
  const page = Math.max(0, Number(sp.page ?? 0) || 0);

  let query = supabase
    .from("audit_logs")
    .select("id, action, actor_id, target_type, target_id, metadata, created_at", {
      count: "exact",
    })
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (sp.action) query = query.eq("action", sp.action);
  if (days !== "all") {
    const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();
    query = query.gte("created_at", since);
  }
  const { data: logs, count } = await query;

  // Distinct actions for the filter (from a wider unfiltered slice)
  const { data: actionRows } = await supabase
    .from("audit_logs")
    .select("action")
    .eq("organization_id", org.id)
    .limit(500);
  const actions = [...new Set((actionRows ?? []).map((a) => a.action))].sort();

  const actorIds = [...new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean))];
  const { data: profiles } = actorIds.length
    ? await supabase.from("user_profiles").select("user_id, full_name").in("user_id", actorIds)
    : { data: [] as any[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));

  const qs = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ days, ...(sp.action ? { action: sp.action } : {}), ...patch });
    return `/org/${orgSlug}/audit?${q}`;
  };

  const total = count ?? 0;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit log — {org.name}</h1>
        <Link href={`/org/${orgSlug}`} className="text-sm text-slate-500 hover:underline">
          ← Back
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {total.toLocaleString()} entries · role changes, keys, webhooks, shares,
        automations, workspaces. Visible to org admins only.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {["7", "30", "90", "all"].map((d) => (
          <Link key={d} href={qs({ days: d, page: "0" })}
            className={`rounded-lg px-3 py-1 text-xs ${
              days === d ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-100"}`}>
            {d === "all" ? "All time" : `${d}d`}
          </Link>
        ))}
        <form method="GET" className="ml-auto flex items-center gap-1">
          <input type="hidden" name="days" value={days} />
          <select name="action" defaultValue={sp.action ?? ""}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
            Filter
          </button>
        </form>
        <ExportAuditButton
          rows={(logs ?? []).map((l) => ({
            when: l.created_at,
            actor: l.actor_id ? nameOf.get(l.actor_id) ?? l.actor_id : "system",
            action: l.action,
            target: l.target_id ?? "",
            details: JSON.stringify(l.metadata ?? {}),
          }))}
        />
      </div>

      <ul className="mt-4 space-y-1.5">
        {(logs ?? []).map((l) => (
          <li key={l.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {l.actor_id ? nameOf.get(l.actor_id) ?? "Member" : "System"}
              </span>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {l.action}
              </code>
              <span className="ml-auto text-xs text-slate-400">
                {new Date(l.created_at).toLocaleString()}
              </span>
            </div>
            {l.metadata && Object.keys(l.metadata).length > 0 && (
              <pre className="mt-1 max-h-24 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-500">
                {JSON.stringify(l.metadata, null, 1)}
              </pre>
            )}
          </li>
        ))}
        {(logs ?? []).length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            No audit entries for this filter — or you're not an org admin.
          </li>
        )}
      </ul>

      <div className="mt-4 flex items-center justify-between text-sm">
        {page > 0 ? (
          <Link href={qs({ page: String(page - 1) })} className="text-blue-600 hover:underline">
            ← Newer
          </Link>
        ) : <span />}
        {(page + 1) * PAGE_SIZE < total ? (
          <Link href={qs({ page: String(page + 1) })} className="text-blue-600 hover:underline">
            Older →
          </Link>
        ) : <span />}
      </div>
    </main>
  );
}
