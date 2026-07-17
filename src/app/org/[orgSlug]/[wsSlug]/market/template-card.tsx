"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";
import { categoryLabel } from "./category-label";

// One App Market "app entry" (§11): lighter than a card — no border. Line
// icon + ink semibold name inline, grey truncated description, teal stars,
// touching teal Get App + grey More info buttons, then a teal category meta
// link. "More info" expands details: fields/samples, reviews and the rate
// form, plus the publish/unpublish packaging affordance for org admins.
// Data logic (install_app_template / review_template /
// set_template_visibility RPCs) is unchanged.

export type MarketTemplate = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  category: string | null;
  visibility: string;
  version: number;
  install_count: number;
  rating_avg: number | string | null;
  definition: any;
};

export type TemplateReview = {
  id: string;
  template_id: string;
  rating: number;
  review: string | null;
  created_at: string;
};

// Teal filled stars, disabled-grey empty (§11: "teal star ratings").
function Stars({ value, onPick }: { value: number; onPick?: (n: number) => void }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onPick}
          onClick={() => onPick?.(n)}
          aria-label={onPick ? `Rate ${n} star${n === 1 ? "" : "s"}` : undefined}
          className={`${onPick ? "cursor-pointer hover:scale-110" : "cursor-default"} px-0.5 text-sm ${
            n <= value ? "text-podio-teal" : "text-podio-disabled"
          }`}>
          {n <= value ? "★" : "☆"}
        </button>
      ))}
    </span>
  );
}

export function TemplateCard({
  template, reviews, wsId, orgSlug, wsSlug, isOrgAdmin, isOwnOrg, onPickCategory,
}: {
  template: MarketTemplate;
  reviews: TemplateReview[];
  wsId: string;
  orgSlug: string;
  wsSlug: string;
  isOrgAdmin: boolean;
  isOwnOrg: boolean;
  onPickCategory?: (category: string) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withSamples, setWithSamples] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myReview, setMyReview] = useState("");
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  const sampleCount = (template.definition?.sample_items ?? []).length;
  const fieldCount = (template.definition?.fields ?? []).length;
  const reviewCount = reviews.length;

  async function install() {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("install_app_template", {
      p_template: template.id,
      p_workspace: wsId,
      p_with_samples: withSamples,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    router.push(`/org/${orgSlug}/${wsSlug}/${data.slug}`);
    router.refresh();
  }

  async function submitReview() {
    if (!myRating) return setReviewMsg("Pick a star rating first.");
    setReviewMsg(null);
    const { error: rpcError } = await supabase.rpc("review_template", {
      p_template: template.id,
      p_rating: myRating,
      p_review: myReview || null,
    });
    if (rpcError) return setReviewMsg(rpcError.message);
    setReviewMsg("Thanks for the review!");
    router.refresh();
  }

  async function setVisibility(v: string) {
    setError(null);
    const { error: rpcError } = await supabase.rpc("set_template_visibility", {
      p_template: template.id,
      p_visibility: v,
    });
    if (rpcError) return setError(rpcError.message);
    router.refresh();
  }

  return (
    <li className="flex min-w-0 flex-col">
      {/* Line icon + ink semibold name inline */}
      <div className="flex items-center gap-2">
        <PodioIcon
          icon={typeof template.definition?.app?.icon === "string" ? template.definition.app.icon : null}
          name={template.name}
          className="h-6 w-6 shrink-0 text-podio-secondary"
        />
        <h3 className="truncate text-[17px] font-semibold text-podio-ink">{template.name}</h3>
        {template.version > 1 && (
          <span className="shrink-0 rounded bg-podio-row-alt px-1.5 py-0.5 text-[11px] text-podio-meta">
            v{template.version}
          </span>
        )}
      </div>

      <p className="mt-1 truncate text-sm text-podio-secondary">
        {template.description || "No description yet."}
      </p>

      <div className="mt-1.5 flex items-center gap-2 text-xs text-podio-meta">
        <Stars value={Math.round(Number(template.rating_avg ?? 0))} />
        {template.rating_avg != null ? (
          <span>{Number(template.rating_avg).toFixed(1)}</span>
        ) : (
          <span>No ratings yet</span>
        )}
        <span>·</span>
        <span>
          {template.install_count} install{template.install_count === 1 ? "" : "s"}
        </span>
      </div>

      {/* Touching buttons: solid teal Get App + grey More info */}
      <div className="mt-3 flex">
        <button onClick={install} disabled={busy}
          className="rounded-l-sm bg-podio-teal px-4 py-1.5 text-sm font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50">
          {busy ? "Installing…" : "Get App"}
        </button>
        <button onClick={() => setShowDetails(!showDetails)}
          className="rounded-r-sm bg-podio-row-hover px-4 py-1.5 text-sm font-semibold text-podio-ink hover:bg-[#E0E0E0]">
          More info
        </button>
      </div>

      {sampleCount > 0 && (
        <label className="mt-2 flex items-center gap-1.5 text-xs text-podio-secondary">
          <input type="checkbox" checked={withSamples}
            onChange={(e) => setWithSamples(e.target.checked)} />
          include sample data ({sampleCount} item{sampleCount === 1 ? "" : "s"})
        </label>
      )}

      {/* Meta row: category as a teal link (the "Included in <Pack>" slot) */}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-podio-meta">
        <PodioIcon icon="book" className="h-4 w-4 shrink-0" />
        {template.category ? (
          <button type="button"
            onClick={() => onPickCategory?.(template.category as string)}
            className="text-podio-teal hover:underline">
            {categoryLabel(template.category)}
          </button>
        ) : (
          <span>Uncategorized</span>
        )}
        <span>·</span>
        <span>{template.visibility === "public" ? "Public" : "Organization"}</span>
      </p>

      {isOwnOrg && isOrgAdmin && (
        template.visibility === "public" ? (
          <button onClick={() => setVisibility("org")}
            className="mt-1 self-start text-xs text-podio-meta hover:text-red-600 hover:underline">
            Unpublish from the public market
          </button>
        ) : (
          <button onClick={() => setVisibility("public")}
            className="mt-1 self-start text-xs font-semibold text-podio-teal hover:underline">
            Publish to public market
          </button>
        )
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {/* More info: details + reviews on a row-alt panel */}
      {showDetails && (
        <div className="mt-3 space-y-2 rounded border border-podio-border bg-podio-row-alt p-3">
          <p className="text-xs text-podio-secondary">
            {fieldCount} field{fieldCount === 1 ? "" : "s"}
            {sampleCount > 0 && ` · ${sampleCount} sample item${sampleCount === 1 ? "" : "s"}`}
            {` · ${reviewCount} review${reviewCount === 1 ? "" : "s"}`}
          </p>
          {template.description && (
            <p className="text-xs text-podio-secondary">{template.description}</p>
          )}
          {reviews.map((r) => (
            <div key={r.id} className="text-xs">
              <Stars value={r.rating} />
              {r.review && <span className="ml-1 text-podio-secondary">{r.review}</span>}
              <span className="ml-2 text-podio-meta">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
          {reviews.length === 0 && (
            <p className="text-xs text-podio-meta">No reviews yet — be the first.</p>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-podio-border pt-2">
            <Stars value={myRating} onPick={setMyRating} />
            <input placeholder="Short review (optional)" value={myReview}
              onChange={(e) => setMyReview(e.target.value)}
              className="min-w-0 flex-1 rounded-sm border border-podio-border bg-white px-2 py-1 text-xs text-podio-ink placeholder:text-podio-meta focus:border-podio-teal focus:outline-none" />
            <button onClick={submitReview}
              className="rounded-sm bg-podio-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-podio-teal-dark">
              Rate
            </button>
            {reviewMsg && <span className="text-xs text-podio-meta">{reviewMsg}</span>}
          </div>
        </div>
      )}
    </li>
  );
}
