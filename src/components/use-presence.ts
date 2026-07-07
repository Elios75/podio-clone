"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Shared Supabase Realtime presence hook. Joins one app-wide channel named
// "online" keyed by the current user's id and tracks a tiny payload; the
// returned Set<string> holds the user ids currently online (channel presence
// keys). Joins ONLY after mount (useEffect) — never during render — so SSR
// markup and the first client render never depend on presence state.
// Everything is wrapped so a project without Realtime just yields an empty
// set instead of crashing.
export function usePresence(userId: string | null | undefined): Set<string> {
  const [online, setOnline] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    try {
      channel = supabase.channel("online", {
        config: { presence: { key: userId } },
      });
      const refresh = () => {
        try {
          const state = channel!.presenceState();
          setOnline(new Set(Object.keys(state)));
        } catch {
          /* keep last known set */
        }
      };
      channel
        .on("presence", { event: "sync" }, refresh)
        .on("presence", { event: "join" }, refresh)
        .on("presence", { event: "leave" }, refresh)
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            try {
              await channel!.track({ user_id: userId, at: Date.now() });
            } catch {
              /* presence tracking unavailable — dots just stay hollow */
            }
          }
        });
    } catch {
      channel = null; // realtime disabled: everyone renders offline
    }
    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* already gone */
        }
      }
    };
  }, [userId]);

  return online;
}
