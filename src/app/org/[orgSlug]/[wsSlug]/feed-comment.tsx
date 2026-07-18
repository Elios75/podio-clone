"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Inline "Add comment" composer at the bottom of a feed entry's comment
// block (Podio keeps one open under every activity). Posts through the same
// add_comment RPC as the item page, then refreshes the feed.
export function FeedComment({ itemId }: { itemId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("add_comment", {
      p_item: itemId,
      p_body: text,
      p_mentions: [],
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <div className="border-t border-podio-border px-4 py-3">
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void post();
          }
        }}
        placeholder="Add comment"
        disabled={busy}
        className="w-full rounded-sm border border-podio-border bg-white px-3 py-2 text-sm text-podio-ink outline-none placeholder:text-podio-meta focus:border-podio-teal disabled:opacity-60"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
