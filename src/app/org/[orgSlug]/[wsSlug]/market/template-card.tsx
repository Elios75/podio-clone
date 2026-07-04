"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Stars({ value, onPick }: { value: number; onPick?: (n: number) => void }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onPick}
          onClick={() => onPick?.(n)}
          className={`${onPick ? "cursor-pointer hover:scale-110" : "cursor-default"} px-0.5 text-sm ${
            n <= value ? "text-amber-400" : "text-slate-300"
          }`}>
          ★
        </button>
      ))}
    </span>
  );
}

export function TemplateCard({
  template, reviews, wsId, orgSlug, wsSlug, isOrgAdmin, isOwnOrg,
}: {
  template: any;
  reviews: any[];
  wsId: string;
  orgSlug: string;
  wsSlug: string;
  isOrgAdmin: boolean;
  isOwnOrg: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withSamples, setWithSamples] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myReview, setMyReview] = useState("");
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  const sampleCount = (template.definition?.sample_items ?? []).length;
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
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">{template.definition?.app?.icon ?? "📋"}</span>
        <span className="font-medium">{template.name}</span>
        {template.version > 1 && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
            v{template.version}
          </span>
        )}
        {template.category && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {template.category}
          </span>
        )}
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          {template.visibility === "public" ? "Public" : "Organization"}
        </span>
        <span className="ml-auto text-xs text-slate-400">
          {template.install_count} install{template.install_count === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        {template.rating_avg != null ? (
          <>
            <Stars value={Math.round(Number(template.rating_avg))} />
            <span>{Number(template.rating_avg).toFixed(1)}</span>
          </>
        ) : (
          <span className="text-slate-400">No ratings yet</span>
        )}
        <button onClick={() => setShowReviews(!showReviews)}
          className="text-blue-600 hover:underline">
          {reviewCount} review{reviewCount === 1 ? "" : "s"} {showReviews ? "▾" : "▸"}
        </button>
      </div>

      {template.description && (
        <p className="mt-1 text-sm text-slate-500">{template.description}</p>
      )}
      <p className="mt-1 text-xs text-slate-400">
        {(template.definition?.fields ?? []).length} fields
        {sampleCount > 0 && ` · ${sampleCount} sample item${sampleCount === 1 ? "" : "s"}`}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button onClick={install} disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? "Installing…" : "Install"}
        </button>
        {sampleCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={withSamples}
              onChange={(e) => setWithSamples(e.target.checked)} />
            include sample data
          </label>
        )}
        {isOwnOrg && isOrgAdmin && (
          template.visibility === "public" ? (
            <button onClick={() => setVisibility("org")}
              className="text-xs text-slate-500 hover:text-red-600">
              Unpublish
            </button>
          ) : (
            <button onClick={() => setVisibility("public")}
              className="rounded border border-green-300 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100">
              Publish to public market
            </button>
          )
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      {showReviews && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          {reviews.map((r) => (
            <div key={r.id} className="text-xs">
              <Stars value={r.rating} />
              {r.review && <span className="ml-1 text-slate-600">{r.review}</span>}
              <span className="ml-2 text-slate-400">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
          {reviews.length === 0 && (
            <p className="text-xs text-slate-400">No reviews yet — be the first.</p>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
            <Stars value={myRating} onPick={setMyRating} />
            <input placeholder="Short review (optional)" value={myReview}
              onChange={(e) => setMyReview(e.target.value)}
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
            <button onClick={submitReview}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white">
              Rate
            </button>
            {reviewMsg && <span className="text-xs text-slate-500">{reviewMsg}</span>}
          </div>
        </div>
      )}
    </li>
  );
}
