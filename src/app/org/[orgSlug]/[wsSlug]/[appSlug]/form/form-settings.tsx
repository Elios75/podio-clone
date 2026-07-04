"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Field = { id: string; external_id: string; label: string; type: string };

const FORM_EXCLUDED = ["relationship", "contact", "image", "file", "calculation"];

export function FormSettings({
  appId,
  appSlug,
  fields,
  webform,
  recentSubmissions,
}: {
  appId: string;
  appSlug: string;
  fields: Field[];
  webform: any;
  recentSubmissions: any[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const eligible = fields.filter((f) => !FORM_EXCLUDED.includes(f.type));

  const [title, setTitle] = useState(webform?.title ?? "");
  const [description, setDescription] = useState(webform?.description ?? "");
  const [successMsg, setSuccessMsg] = useState(
    webform?.settings?.success_message ?? "Thank you! Your submission was received."
  );
  const [fieldIds, setFieldIds] = useState<string[]>(
    webform?.field_ids ?? eligible.map((f) => f.id)
  );
  const [isActive, setIsActive] = useState(webform?.is_active ?? true);
  const [redirectUrl, setRedirectUrl] = useState(webform?.settings?.redirect_url ?? "");
  const [accentColor, setAccentColor] = useState(webform?.settings?.theme?.accent_color ?? "");
  const [bgColor, setBgColor] = useState(webform?.settings?.theme?.background_color ?? "");
  const [customCss, setCustomCss] = useState(webform?.settings?.custom_css ?? "");
  const [allowedDomains, setAllowedDomains] = useState(
    (webform?.settings?.allowed_domains ?? []).join(", ")
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [captchaEnabled, setCaptchaEnabled] = useState(
    Boolean(webform?.settings?.captcha_enabled)
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const publicUrl =
    typeof window !== "undefined" && webform
      ? `${window.location.origin}/f/${webform.slug}`
      : null;

  function toggleField(id: string) {
    setFieldIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function save() {
    setError(null);
    setSaving(true);
    const row = {
      app_id: appId,
      title: title || "Submit a request",
      description,
      field_ids: fieldIds,
      is_active: isActive,
      settings: {
        success_message: successMsg,
        ...(redirectUrl.trim() ? { redirect_url: redirectUrl.trim() } : {}),
        ...(accentColor || bgColor
          ? { theme: { ...(accentColor ? { accent_color: accentColor } : {}),
                       ...(bgColor ? { background_color: bgColor } : {}) } }
          : {}),
        ...(customCss.trim() ? { custom_css: customCss } : {}),
        ...(captchaEnabled ? { captcha_enabled: true } : {}),
        ...(allowedDomains.trim()
          ? { allowed_domains: allowedDomains.split(",").map((d: string) => d.trim()).filter(Boolean) }
          : {}),
      },
      ...(webform ? {} : { slug: `${appSlug}-${Math.random().toString(36).slice(2, 8)}` }),
    };
    const { error: upError } = webform
      ? await supabase.from("webforms").update(row).eq("id", webform.id)
      : await supabase.from("webforms").insert(row);
    setSaving(false);
    if (upError) return setError(upError.message);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {publicUrl && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
          <span className="text-sm text-green-800">Public link:</span>
          <a href={publicUrl} target="_blank"
            className="truncate text-sm font-medium text-green-700 underline">
            {publicUrl}
          </a>
          <button
            onClick={() => navigator.clipboard.writeText(publicUrl)}
            className="ml-auto rounded border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-100"
          >
            Copy
          </button>
        </div>
      )}

      {publicUrl && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
          <p className="text-sm font-medium">Embed on your site</p>
          <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
{`<iframe src="${publicUrl}" width="100%" height="640" frameborder="0"></iframe>`}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(
              `<iframe src="${publicUrl}" width="100%" height="640" frameborder="0"></iframe>`)}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
            Copy embed code
          </button>
          <p className="text-xs text-slate-400">
            Prefill via URL parameters using field external ids, e.g.{" "}
            <code className="rounded bg-slate-100 px-1">
              {publicUrl}?{(fields.find((f) => fieldIds.includes(f.id))?.external_id) ?? "field-id"}=value
            </code>
          </p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <input
          placeholder="Form title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <textarea
          placeholder="Description shown above the form (optional)"
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Success message"
          value={successMsg}
          onChange={(e) => setSuccessMsg(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <p className="text-sm font-medium">Fields on the form</p>
        <div className="grid grid-cols-2 gap-1">
          {eligible.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fieldIds.includes(f.id)}
                onChange={() => toggleField(f.id)}
              />
              {f.label}
              <span className="text-xs text-slate-400">({f.type})</span>
            </label>
          ))}
        </div>
        {fields.length > eligible.length && (
          <p className="text-xs text-slate-400">
            Relationship, contact, file, and calculation fields can't appear on
            public forms yet.
          </p>
        )}

        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs font-medium text-blue-600 hover:underline">
          {showAdvanced ? "▾ Hide" : "▸ Show"} appearance & behavior
        </button>
        {showAdvanced && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Redirect URL after submit (optional — replaces the success message)
              </label>
              <input placeholder="https://yoursite.com/thanks" value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
            </div>
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600">Button color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input type="color" value={accentColor || "#2563eb"}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border border-slate-300" />
                  {accentColor && (
                    <button onClick={() => setAccentColor("")}
                      className="text-xs text-slate-400 hover:text-red-500">reset</button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Page background</label>
                <div className="mt-1 flex items-center gap-2">
                  <input type="color" value={bgColor || "#f8fafc"}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border border-slate-300" />
                  {bgColor && (
                    <button onClick={() => setBgColor("")}
                      className="text-xs text-slate-400 hover:text-red-500">reset</button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Custom CSS (scoped to the form page; target .podio-form-card)
              </label>
              <textarea rows={3} value={customCss} onChange={(e) => setCustomCss(e.target.value)}
                placeholder=".podio-form-card { border-radius: 0; }"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={captchaEnabled}
                onChange={(e) => setCaptchaEnabled(e.target.checked)} />
              Require captcha (Cloudflare Turnstile — set NEXT_PUBLIC_TURNSTILE_SITE_KEY and
              TURNSTILE_SECRET_KEY in the environment)
            </label>
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Allowed embed domains (comma-separated, informational for now)
              </label>
              <input placeholder="yoursite.com, app.yoursite.com" value={allowedDomains}
                onChange={(e) => setAllowedDomains(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Form is active (accepting submissions)
        </label>

        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : webform ? "Save changes" : "Create form"}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      {recentSubmissions.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium">Recent submissions</p>
          <ul className="mt-2 space-y-1">
            {recentSubmissions.map((s) => (
              <li key={s.id} className="flex justify-between text-sm text-slate-500">
                <span>{s.submitter_email ?? "Anonymous"}</span>
                <span className="text-xs">{new Date(s.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
