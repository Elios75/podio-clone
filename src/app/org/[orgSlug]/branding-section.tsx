"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function BrandingSection({
  orgId,
  orgSlug,
  logoUrl,
  branding,
}: {
  orgId: string;
  orgSlug: string;
  logoUrl: string | null;
  branding: {
    portal_enabled?: boolean;
    accent?: string;
    portal_title?: string;
    welcome?: string;
  } | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [logo, setLogo] = useState(logoUrl ?? "");
  const [accent, setAccent] = useState(branding?.accent ?? "#15808D");
  const [title, setTitle] = useState(branding?.portal_title ?? "");
  const [welcome, setWelcome] = useState(branding?.welcome ?? "");
  const [enabled, setEnabled] = useState(branding?.portal_enabled ?? false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaved(false);
    const { error: upError } = await supabase
      .from("organizations")
      .update({
        logo_url: logo.trim() || null,
        branding: {
          ...(branding ?? {}),
          portal_enabled: enabled,
          accent: accent.trim() || "#15808D",
          portal_title: title.trim() || null,
          welcome: welcome.trim() || null,
        },
      } as any)
      .eq("id", orgId);
    if (upError) return setError(upError.message);
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium">Branding &amp; client portal</h2>
      <p className="mt-1 text-xs text-slate-400">
        Your logo and accent color brand the client portal, where guests see the
        items shared with them. See docs/PORTALS.md for custom-domain mapping.
      </p>

      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="w-28 text-sm text-slate-600">Logo URL</label>
          <input
            placeholder="https://example.com/logo.png"
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            className="w-72 rounded border border-slate-300 px-2 py-1 text-sm focus:border-[#15808D] focus:outline-none"
          />
          {logo.trim() && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo.trim()} alt="Logo preview" className="h-8 rounded" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="w-28 text-sm text-slate-600">Accent color</label>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#15808D"}
            onChange={(e) => setAccent(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-slate-300"
          />
          <input
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            placeholder="#15808D"
            className="w-28 rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:border-[#15808D] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="w-28 text-sm text-slate-600">Portal title</label>
          <input
            placeholder="Client Portal"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-72 rounded border border-slate-300 px-2 py-1 text-sm focus:border-[#15808D] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <label className="w-28 pt-1 text-sm text-slate-600">Welcome text</label>
          <textarea
            placeholder="Welcome! Here you'll find everything we've shared with you."
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            rows={3}
            className="w-96 max-w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-[#15808D] focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Client portal enabled
        </label>

        {enabled && (
          <p className="text-xs text-slate-500">
            Portal link:{" "}
            <a
              href={`/portal/${orgSlug}`}
              className="font-mono text-[#15808D] hover:underline"
            >
              /portal/{orgSlug}
            </a>
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={save}
          className="rounded bg-[#15808D] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0F6D79]"
        >
          Save
        </button>
        {saved && <span className="text-xs text-green-600">Saved ✓</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </section>
  );
}
// Phase 14: white-label portal branding (docs/PORTALS.md)
