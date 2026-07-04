"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const PLANS = [
  { id: "free", name: "Free", price: "$0", blurb: "5 users · 1k items · 1 GB · 250 automation runs/mo" },
  { id: "team", name: "Team", price: "$99/mo", blurb: "20 users · 20k items · 10 GB · 5k runs/mo" },
  { id: "business", name: "Business", price: "$299/mo", blurb: "100 users · 200k items · 50 GB · 50k runs/mo" },
  { id: "enterprise", name: "Enterprise", price: "Custom", blurb: "Unlimited everything · retention controls" },
];

function Bar({ used, cap }: { used: number; cap: number }) {
  if (cap < 0) return <span className="text-xs text-slate-400">unlimited</span>;
  const pct = Math.min(100, Math.round((used / Math.max(cap, 1)) * 100));
  return (
    <div className="h-2 w-full rounded bg-slate-100">
      <div className={`h-2 rounded ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-blue-500"}`}
        style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BillingSection({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [usage, setUsage] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("org_usage", { p_org: orgId }).then(({ data }) => setUsage(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function upgrade(plan: string) {
    setBusy(plan); setMsg(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, plan }),
    }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    setBusy(null);
    if (res.url) return void (window.location.href = res.url);
    if (res.error?.includes("not configured") && isOwner) {
      // Dev fallback: set the plan directly (audit-logged as manual)
      const ok = confirm("Stripe isn't configured. Set the plan directly? (dev/manual mode)");
      if (ok) {
        const { error } = await supabase.rpc("set_billing_plan", { p_org: orgId, p_plan: plan });
        if (error) return setMsg(error.message);
        setMsg(`Plan set to ${plan} (manual).`);
        supabase.rpc("org_usage", { p_org: orgId }).then(({ data }) => setUsage(data));
        router.refresh();
        return;
      }
    }
    if (res.error) setMsg(res.error);
  }

  const limits = usage?.limits ?? {};
  const rows = usage ? [
    { label: "Members", used: usage.users, cap: Number(limits.users ?? -1) },
    { label: "Items", used: usage.items, cap: Number(limits.items ?? -1) },
    { label: "Storage", used: Math.round(usage.storage_bytes / 1024 / 1024), cap: Number(limits.storage_mb ?? -1), unit: "MB" },
    { label: "Automation runs (this month)", used: usage.automations_this_month, cap: Number(limits.automations_month ?? -1) },
  ] : [];

  return (
    <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium">
        Billing — current plan:{" "}
        <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">{usage?.plan ?? "…"}</span>
      </p>

      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="text-xs">
            <div className="flex justify-between text-slate-600">
              <span>{r.label}</span>
              <span>
                {r.used}{r.unit ? ` ${r.unit}` : ""}{r.cap >= 0 ? ` / ${r.cap}${r.unit ? ` ${r.unit}` : ""}` : ""}
              </span>
            </div>
            <Bar used={r.used} cap={r.cap} />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {PLANS.map((p) => (
          <div key={p.id}
            className={`rounded-lg border p-3 ${usage?.plan === p.id ? "border-blue-400 bg-blue-50/50" : "border-slate-200"}`}>
            <p className="text-sm font-semibold">{p.name}</p>
            <p className="text-sm text-slate-700">{p.price}</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{p.blurb}</p>
            {usage?.plan === p.id ? (
              <p className="mt-2 text-[11px] font-medium text-blue-600">Current plan</p>
            ) : isOwner && p.id !== "free" ? (
              <button onClick={() => upgrade(p.id)} disabled={busy !== null}
                className="mt-2 w-full rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {busy === p.id ? "…" : "Upgrade"}
              </button>
            ) : isOwner && p.id === "free" ? (
              <button
                onClick={async () => {
                  const { error } = await supabase.rpc("set_billing_plan", { p_org: orgId, p_plan: "free" });
                  setMsg(error ? error.message : "Downgraded to free.");
                  router.refresh();
                }}
                className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
                Downgrade
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
      {!isOwner && <p className="mt-2 text-[11px] text-slate-400">Only the org owner can change the plan.</p>}
    </div>
  );
}
