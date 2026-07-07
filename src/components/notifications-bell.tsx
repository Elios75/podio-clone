"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";

// Global-bar notifications bell (design skill layouts.md §1): when unread > 0
// a small red dot sits on the bell AND a yellow count pill (bg-podio-yellow,
// ink text) sits to its right — exactly like the Podio screenshot. Click
// opens a right-aligned dropdown with the 15 newest notifications (same
// table shape as /notifications). The server passes `initialUnread`; a
// postgres_changes INSERT subscription bumps it live when Realtime is
// enabled, and the count is re-fetched every time the dropdown opens so a
// dead subscription only ever means "slightly stale until next open".

type Notif = {
  id: string;
  event_type: string;
  payload: Record<string, any> | null;
  read_at: string | null;
  created_at: string;
  actor_name: string;
};

function verbFor(t: string) {
  if (t === "mentioned") return "mentioned you on";
  if (t === "comment_added") return "commented on";
  if (t === "message") return "sent you a message";
  if (t === "task_assigned") return "assigned you a task";
  return t.replaceAll("_", " ");
}

function linkFor(n: Notif) {
  if (n.event_type === "message" && n.payload?.conversation_id) {
    return `/messages?c=${n.payload.conversation_id}`;
  }
  return "/notifications";
}

export function NotificationsBell({
  userId,
  initialUnread,
}: {
  userId: string;
  initialUnread: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  async function refetch() {
    try {
      const { data: rows } = await supabase
        .from("notifications")
        .select("id, event_type, actor_id, payload, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(15);
      const actorIds = [
        ...new Set((rows ?? []).map((n: any) => n.actor_id).filter(Boolean)),
      ];
      const { data: profiles } = actorIds.length
        ? await supabase
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", actorIds)
        : { data: [] as any[] };
      const nameOf = new Map(
        (profiles ?? []).map((p: any) => [p.user_id, p.full_name])
      );
      setItems(
        (rows ?? []).map((n: any) => ({
          id: n.id,
          event_type: n.event_type,
          payload: n.payload,
          read_at: n.read_at,
          created_at: n.created_at,
          actor_name:
            (n.actor_id ? nameOf.get(n.actor_id) : null) ?? "Someone",
        }))
      );
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);
      if (typeof count === "number") setUnread(count);
    } catch {
      /* keep whatever we had */
    }
  }

  // Live bump on new notifications — degrades silently to refetch-on-open
  // when the notifications table isn't in the realtime publication.
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    try {
      channel = supabase
        .channel(`notif-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "podio",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => setUnread((u) => u + 1)
        )
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Close on outside click / ESC
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) refetch();
  }

  async function openNotification(n: Notif) {
    setOpen(false);
    if (!n.read_at) {
      setUnread((u) => Math.max(0, u - 1));
      try {
        await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", n.id);
      } catch {}
    }
    router.push(linkFor(n));
  }

  async function markAllRead() {
    setUnread(0);
    setItems(
      (prev) =>
        prev?.map((n) => ({
          ...n,
          read_at: n.read_at ?? new Date().toISOString(),
        })) ?? prev
    );
    try {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
    } catch {}
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        title="Notifications"
        className="flex items-center gap-1.5 hover:opacity-80"
      >
        <span className="relative">
          <PodioIcon icon="bell" className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
          )}
        </span>
        {unread > 0 && (
          <span className="rounded bg-podio-yellow px-1.5 text-xs font-semibold leading-4 text-podio-ink">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded border border-podio-border bg-white text-left shadow-lg">
          <div className="flex items-center border-b border-podio-border px-3 py-2">
            <span className="text-sm font-semibold text-podio-ink">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="ml-auto text-xs text-podio-secondary hover:text-podio-teal"
              >
                Mark all read
              </button>
            )}
          </div>

          <ul className="max-h-96 divide-y divide-podio-border overflow-y-auto">
            {items === null && (
              <li className="px-3 py-6 text-center text-sm text-podio-meta">
                Loading…
              </li>
            )}
            {items?.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openNotification(n)}
                  className={`block w-full px-3 py-2.5 text-left hover:bg-podio-row-hover ${
                    n.read_at ? "bg-white" : "bg-podio-row-alt"
                  }`}
                >
                  <p className="text-sm text-podio-ink">
                    <span className="font-semibold">{n.actor_name}</span>{" "}
                    {verbFor(n.event_type)}
                    {n.event_type !== "message" && (
                      <>
                        {" "}
                        <span className="font-semibold">
                          {n.payload?.item_title ?? "an item"}
                        </span>
                      </>
                    )}
                  </p>
                  {n.payload?.preview && (
                    <p className="mt-0.5 truncate text-xs text-podio-secondary">
                      &ldquo;{n.payload.preview}&rdquo;
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-podio-meta">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </button>
              </li>
            ))}
            {items?.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-podio-meta">
                Nothing yet — mentions and comments land here.
              </li>
            )}
          </ul>

          <div className="border-t border-podio-border px-3 py-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-sm text-podio-teal hover:underline"
            >
              All notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
