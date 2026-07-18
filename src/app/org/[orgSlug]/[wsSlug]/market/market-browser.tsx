"use client";

import { useMemo, useState } from "react";
import { TemplateCard, type MarketTemplate, type TemplateReview } from "./template-card";
import { categoryLabel } from "./category-label";

// Client shell for the App Market body: grey category sidebar (search row,
// "My organizations", "Functional" category list) + white main column with
// section header rows, the 3-up app-entry grid and square-button pagination.
// Filtering is purely client-side; installs go through TemplateCard's RPC.
// See docs/design/podio-design-skill/references/layouts.md §11.

const PAGE_SIZE = 9; // 3-up grid, three rows per page

export function MarketBrowser({
  templates,
  reviews,
  wsId,
  orgSlug,
  wsSlug,
  isOrgAdmin,
  orgId,
  orgName,
  orgLogoUrl,
}: {
  templates: MarketTemplate[];
  reviews: TemplateReview[];
  wsId: string;
  orgSlug: string;
  wsSlug: string;
  isOrgAdmin: boolean;
  orgId: string;
  orgName: string;
  orgLogoUrl: string | null;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null); // null = All apps
  const [mineOnly, setMineOnly] = useState(false);
  const [rawPage, setRawPage] = useState(0);

  // Categories from the template data; stable alphabetical order.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) if (t.category) set.add(t.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const q = query.trim().toLowerCase();
  const filtered = templates.filter((t) => {
    if (mineOnly && t.organization_id !== orgId) return false;
    if (category && t.category !== category) return false;
    if (q) {
      const hay = `${t.name} ${t.description ?? ""} ${t.category ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Clamp instead of effect-resetting so the render is always consistent.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(rawPage, pageCount - 1);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const sectionLabel = q
    ? `Results for “${query.trim()}”`
    : mineOnly
    ? `From ${orgName}`
    : category
    ? categoryLabel(category)
    : "Recommended apps";

  function pickCategory(c: string | null) {
    setCategory(c);
    setMineOnly(false);
    setRawPage(0);
  }

  const rowBase = "flex h-11 w-full items-center gap-2 px-4 text-left text-[15px]";
  const rowActive = "bg-podio-row-hover font-semibold text-podio-ink";
  const rowIdle = "text-podio-ink hover:bg-[#EFEFEF]";

  return (
    <div className="flex min-h-[calc(100vh_-_8.5rem)] flex-col lg:flex-row lg:items-stretch">
      {/* Left category sidebar: light grey panel with a search row on top,
          then link lists under section headings (§11). */}
      <aside className="w-full shrink-0 border-b border-podio-border bg-podio-row-alt lg:w-72 lg:border-b-0 lg:border-r">
        <form
          className="flex p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setRawPage(0);
          }}
        >
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setRawPage(0);
            }}
            placeholder="Search the App Market"
            className="w-full min-w-0 rounded-l-sm border border-podio-border bg-white px-3 py-2 text-[15px] text-podio-ink placeholder:text-podio-meta focus:border-podio-teal focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Search"
            className="rounded-r-sm border border-l-0 border-podio-border bg-white px-3 text-podio-secondary hover:text-podio-teal"
          >
            ▸
          </button>
        </form>

        <h2 className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-podio-meta">
          My organizations
        </h2>
        <ul className="border-y border-podio-border">
          <li>
            <button
              type="button"
              onClick={() => {
                setMineOnly(!mineOnly);
                setCategory(null);
                setRawPage(0);
              }}
              className={`${rowBase} ${mineOnly ? rowActive : rowIdle}`}
            >
              {orgLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={orgLogoUrl} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-podio-chrome text-xs font-semibold text-podio-ink">
                  {orgName.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate">{orgName}</span>
            </button>
          </li>
        </ul>

        <h2 className="px-4 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-podio-meta">
          Functional
        </h2>
        <ul className="divide-y divide-podio-border border-y border-podio-border">
          <li>
            <button
              type="button"
              onClick={() => pickCategory(null)}
              className={`${rowBase} ${!category && !mineOnly ? rowActive : rowIdle}`}
            >
              All apps
            </button>
          </li>
          {categories.map((c) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => pickCategory(c)}
                className={`${rowBase} ${category === c ? rowActive : rowIdle}`}
              >
                {categoryLabel(c)}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main column: ink title row, section header row, app-entry grid. */}
      <section className="flex min-w-0 flex-1 flex-col bg-white">
        <div className="border-b border-podio-border px-6 py-4">
          <h1 className="text-2xl font-semibold text-podio-ink">Podio App Market</h1>
          <p className="mt-0.5 text-sm text-podio-secondary">
            Install a pre-built app structure into this workspace, then customize it.
          </p>
        </div>

        <div className="flex items-baseline border-b border-podio-border px-6 py-3">
          <h2 className="text-lg font-semibold text-podio-ink">{sectionLabel}</h2>
          <span className="ml-auto text-sm text-podio-meta">
            {filtered.length} app{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        {templates.length === 0 ? (
          <p className="m-6 rounded border border-dashed border-podio-border p-10 text-center text-sm text-podio-meta">
            No templates yet. Open any app and choose &ldquo;Share app&rdquo; from its
            wrench menu to package it for the App Market.
          </p>
        ) : filtered.length === 0 ? (
          <p className="m-6 rounded border border-dashed border-podio-border p-10 text-center text-sm text-podio-meta">
            No apps match. Try a different search or category.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-10 gap-y-8 px-6 py-6 sm:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                reviews={reviews.filter((r) => r.template_id === t.id)}
                wsId={wsId}
                orgSlug={orgSlug}
                wsSlug={wsSlug}
                isOrgAdmin={isOrgAdmin}
                isOwnOrg={t.organization_id === orgId}
                onPickCategory={pickCategory}
              />
            ))}
          </ul>
        )}

        {/* Square-button pagination: First · Prev · 1…n · Next · Last (§11). */}
        {pageCount > 1 && (
          <nav className="mt-auto flex flex-wrap items-center gap-1 px-6 pb-8" aria-label="Pages">
            <PageButton label="First" disabled={page === 0} onClick={() => setRawPage(0)} />
            <PageButton label="Prev" disabled={page === 0} onClick={() => setRawPage(page - 1)} />
            {Array.from({ length: pageCount }, (_, i) => (
              <PageButton
                key={i}
                label={String(i + 1)}
                active={i === page}
                onClick={() => setRawPage(i)}
              />
            ))}
            <PageButton
              label="Next"
              disabled={page === pageCount - 1}
              onClick={() => setRawPage(page + 1)}
            />
            <PageButton
              label="Last"
              disabled={page === pageCount - 1}
              onClick={() => setRawPage(pageCount - 1)}
            />
          </nav>
        )}
      </section>
    </div>
  );
}

function PageButton({
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      className={`flex h-8 min-w-8 items-center justify-center rounded-sm border px-2 text-sm ${
        active
          ? "border-podio-secondary font-semibold text-podio-ink"
          : "border-podio-border bg-white text-podio-secondary hover:border-podio-teal hover:text-podio-teal disabled:opacity-40 disabled:hover:border-podio-border disabled:hover:text-podio-secondary"
      }`}
    >
      {label}
    </button>
  );
}
