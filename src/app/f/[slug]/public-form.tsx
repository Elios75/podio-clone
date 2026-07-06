"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES } from "@/lib/fields";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

export function PublicForm({
  slug, form, prefill, accent,
}: {
  slug: string; form: any; prefill?: Record<string, any>; accent?: string;
}) {
  const supabase = createClient();
  const [values, setValues] = useState<Record<string, any>>(prefill ?? {});
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const captchaToken = useRef<string | null>(null);
  const captchaRef = useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const useCaptcha = Boolean(form.captcha_enabled && siteKey);

  useEffect(() => {
    if (!useCaptcha || !captchaRef.current) return;
    const render = () => {
      const t = (window as any).turnstile;
      if (t && captchaRef.current && !captchaRef.current.hasChildNodes()) {
        t.render(captchaRef.current, {
          sitekey: siteKey,
          callback: (token: string) => { captchaToken.current = token; },
        });
      }
    };
    if ((window as any).turnstile) return render();
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [useCaptcha, siteKey]);

  const set = (id: string, v: any) => setValues((p) => ({ ...p, [id]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    let submitError: string | null = null;
    if (useCaptcha) {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, values, email: email || null,
          captcha_token: captchaToken.current,
        }),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
      submitError = res?.error ?? null;
    } else {
      const { error: rpcError } = await supabase.rpc("submit_webform", {
        p_slug: slug,
        p_values: values,
        p_submitter_email: email || null,
      });
      submitError = rpcError?.message ?? null;
    }
    setSending(false);
    if (submitError) return setError(submitError);
    if (form.redirect_url && /^https?:\/\//i.test(form.redirect_url)) {
      window.location.href = form.redirect_url;
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-lg bg-green-50 p-6 text-center">
        <p className="text-2xl">✅</p>
        <p className="mt-2 text-sm text-green-800">{form.success_message}</p>
      </div>
    );
  }

  function input(f: any) {
    switch (f.type) {
      case "number":
        return (
          <input type="number" step="any" required={f.is_required}
            value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value === "" ? null : Number(e.target.value))}
            className={inputCls} />
        );
      case "date":
        return (
          <input type="date" required={f.is_required}
            value={values[f.id]?.start ?? ""}
            onChange={(e) => set(f.id, e.target.value ? { start: e.target.value } : null)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        );
      case "category":
        return (
          <select required={f.is_required} value={values[f.id] ?? ""}
            onChange={(e) => set(f.id, e.target.value || null)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— Select —</option>
            {(f.config?.options ?? []).map((o: any) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        );
      case "money": {
        const v = values[f.id] ?? {};
        return (
          <div className="flex gap-2">
            <input type="number" step="0.01" required={f.is_required} placeholder="Amount"
              value={v.amount ?? ""}
              onChange={(e) =>
                set(f.id, e.target.value === "" ? null : { ...v, amount: Number(e.target.value), currency: v.currency ?? "USD" })}
              className={inputCls} />
            <select value={v.currency ?? "USD"}
              onChange={(e) => set(f.id, { ...v, currency: e.target.value })}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        );
      }
      case "progress":
        return (
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={100} value={values[f.id] ?? 0}
              onChange={(e) => set(f.id, Number(e.target.value))} className="flex-1" />
            <span className="w-12 text-right text-sm text-slate-600">{values[f.id] ?? 0}%</span>
          </div>
        );
      case "duration": {
        const total = values[f.id] ?? 0;
        const h = Math.floor(total / 3600);
        const m = Math.round((total % 3600) / 60);
        return (
          <div className="flex items-center gap-2">
            <input type="number" min={0} value={h || ""} placeholder="0"
              onChange={(e) => set(f.id, Number(e.target.value || 0) * 3600 + m * 60)}
              className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <span className="text-sm text-slate-500">h</span>
            <input type="number" min={0} max={59} value={m || ""} placeholder="0"
              onChange={(e) => set(f.id, h * 3600 + Number(e.target.value || 0) * 60)}
              className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <span className="text-sm text-slate-500">m</span>
          </div>
        );
      }
      case "separator":
        return null;
      case "phone":
        return <input type="tel" required={f.is_required} value={values[f.id] ?? ""}
          onChange={(e) => set(f.id, e.target.value)} className={inputCls} />;
      case "email":
        return <input type="email" required={f.is_required} value={values[f.id] ?? ""}
          onChange={(e) => set(f.id, e.target.value)} className={inputCls} />;
      case "link":
        return <input type="url" placeholder="https://…" required={f.is_required}
          value={values[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)} className={inputCls} />;
      default:
        return <input required={f.is_required} value={values[f.id] ?? ""}
          onChange={(e) => set(f.id, e.target.value)} className={inputCls} />;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Table fields (embedded sub-tables) are app-internal — the public
          form skips them rather than rendering an unknown input. */}
      {(form.fields ?? [])
        .filter((f: any) => f.type !== "table")
        .map((f: any) =>
        f.type === "separator" ? (
          <div key={f.id} className="border-t border-slate-200 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{f.label}</p>
          </div>
        ) : (
          <div key={f.id}>
            <label className="block text-sm font-medium text-slate-700">
              {f.label}
              {f.is_required && <span className="text-red-500"> *</span>}
            </label>
            {f.help_text && <p className="text-xs text-slate-400">{f.help_text}</p>}
            <div className="mt-1">{input(f)}</div>
          </div>
        )
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Your email <span className="text-xs font-normal text-slate-400">(optional)</span>
        </label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className={`mt-1 ${inputCls}`} />
      </div>

      {useCaptcha && <div ref={captchaRef} className="min-h-[65px]" />}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={sending}
        style={accent ? { backgroundColor: accent } : undefined}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {sending ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
