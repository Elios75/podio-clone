"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Follow/unfollow the workspace activity stream. Backed by podio.follows
// (user_id, target_type, target_id, muted) — "following" = row absent or
// muted=false; "not following" = muted=true.
export function FollowToggle({
  userId,
  wsId,
  initialMuted,
}: {
  userId: string;
  wsId: string;
  initialMuted: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [muted, setMuted] = useState(initialMuted);
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const next = !muted;
        const { error } = await supabase.from("follows").upsert(
          {
            user_id: userId,
            target_type: "workspace",
            target_id: wsId,
            muted: next,
          },
          { onConflict: "user_id,target_type,target_id" }
        );
        if (!error) setMuted(next);
        setBusy(false);
        router.refresh();
      }}
      className="text-podio-secondary hover:text-podio-teal disabled:opacity-50"
      title={
        muted
          ? "Follow this workspace's activity"
          : "Stop following this workspace's activity"
      }
    >
      {muted ? "Follow" : "🔔 Unfollow"}
    </button>
  );
}
