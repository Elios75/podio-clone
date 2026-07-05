"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";

// Header-bar follow/unfollow control: bell icon + "Following"/"Follow" +
// follower count, same item_followers row pattern the comments section used.
export function FollowToggleHeader({
  itemId,
  currentUserId,
  isFollowing,
  followerCount,
}: {
  itemId: string;
  currentUserId: string;
  isFollowing: boolean;
  followerCount: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function toggleFollow() {
    if (busy) return;
    setBusy(true);
    if (isFollowing) {
      await supabase
        .from("item_followers")
        .delete()
        .eq("item_id", itemId)
        .eq("user_id", currentUserId);
    } else {
      await supabase
        .from("item_followers")
        .upsert(
          { item_id: itemId, user_id: currentUserId },
          { onConflict: "item_id,user_id" }
        );
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggleFollow}
      disabled={busy}
      title={isFollowing ? "Unfollow this item" : "Follow this item"}
      className="flex items-center gap-1.5 px-1 py-1.5 text-sm text-podio-secondary hover:text-podio-ink disabled:opacity-60"
    >
      <PodioIcon icon="bell" className="h-5 w-5" />
      <span className={isFollowing ? "font-semibold text-podio-ink" : ""}>
        {isFollowing ? "Following" : "Follow"}
      </span>
      <span className="text-podio-meta">{followerCount}</span>
    </button>
  );
}
