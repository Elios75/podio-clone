"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";

// The Podio chat slide-over (design skill layouts.md §13): opened from the
// 💬 launcher at the far right of the global bar. Fixed to the right edge,
// full height, NO dimming backdrop — the page stays visible. Inside: a thin
// avatar mini-rail of recent conversations (quick switching), then either
// the CONNECTIONS list (everyone in the user's orgs, with presence dots —
// filled orange = online, hollow grey ring = offline) or the 1:1 THREAD
// view with a composer. Reuses the /messages data patterns: the
// start_conversation / send_message RPCs and last_read_at bookkeeping.
//
// Resilience: new messages arrive via a postgres_changes INSERT
// subscription on podio.messages (already in the realtime publication),
// AND a 5s poll while a thread is open — if realtime is off, polling
// alone keeps the thread fresh.

type Person = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Conv = {
  id: string;
  subject: string | null;
  is_group: boolean;
  participantIds: string[]; // includes me
};

type Msg = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function initialsOf(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const init = parts
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return init || "?";
}

function Avatar({
  name,
  url,
  className,
}: {
  name: string | null | undefined;
  url?: string | null;
  className: string;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={url} alt="" className={`${className} rounded-full object-cover`} />
    );
  }
  return (
    <span
      className={`${className} flex items-center justify-center rounded-full bg-podio-chrome text-xs font-semibold text-podio-ink`}
    >
      {initialsOf(name)}
    </span>
  );
}

function PresenceDot({ online }: { online: boolean }) {
  return online ? (
    <span
      title="Online"
      className="h-2.5 w-2.5 shrink-0 rounded-full bg-podio-orange"
    />
  ) : (
    <span
      title="Offline"
      className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-podio-disabled"
    />
  );
}

export function ChatPanel({
  userId,
  online,
  onClose,
}: {
  userId: string;
  online: Set<string>;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [connections, setConnections] = useState<Person[] | null>(null);
  const [search, setSearch] = useState("");
  const [convs, setConvs] = useState<Conv[]>([]);
  // Thread target: convId is null until a first message creates the 1:1.
  const [active, setActive] = useState<{
    convId: string | null;
    otherId: string | null;
    title: string;
  } | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const profileOf = useRef(new Map<string, Person>());

  // ESC closes the panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadConvs = useCallback(async () => {
    try {
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id, subject, is_group, updated_at")
        .order("updated_at", { ascending: false })
        .limit(20);
      const convIds = (conversations ?? []).map((c: any) => c.id);
      const { data: parts } = convIds.length
        ? await supabase
            .from("conversation_participants")
            .select("conversation_id, user_id")
            .in("conversation_id", convIds)
        : { data: [] as any[] };
      const byConv = new Map<string, string[]>();
      for (const p of parts ?? []) {
        (byConv.get(p.conversation_id) ??
          byConv.set(p.conversation_id, []).get(p.conversation_id)!).push(
          p.user_id
        );
      }
      setConvs(
        (conversations ?? []).map((c: any) => ({
          id: c.id,
          subject: c.subject,
          is_group: c.is_group,
          participantIds: byConv.get(c.id) ?? [],
        }))
      );
    } catch {
      /* rail stays empty */
    }
  }, [supabase]);

  // Connections = members of all my orgs (deduped) + recent conversations.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: mems } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", userId);
        const orgIds = [
          ...new Set((mems ?? []).map((m: any) => m.organization_id)),
        ];
        const { data: rows } = orgIds.length
          ? await supabase
              .from("organization_members")
              .select("user_id")
              .in("organization_id", orgIds)
          : { data: [] as any[] };
        const ids = [
          ...new Set((rows ?? []).map((r: any) => r.user_id)),
        ].filter((id) => id !== userId);
        const { data: profiles } = ids.length
          ? await supabase
              .from("user_profiles")
              .select("user_id, full_name, avatar_url")
              .in("user_id", ids)
          : { data: [] as any[] };
        const people: Person[] = ids
          .map(
            (id) =>
              (profiles ?? []).find((p: any) => p.user_id === id) ?? {
                user_id: id,
                full_name: null,
                avatar_url: null,
              }
          )
          .sort((a, b) =>
            (a.full_name ?? "zzz").localeCompare(b.full_name ?? "zzz")
          );
        for (const p of people) profileOf.current.set(p.user_id, p);
        if (!cancelled) setConnections(people);
      } catch {
        if (!cancelled) setConnections([]);
      }
      await loadConvs();
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, loadConvs]);

  // Thread loading + live delivery + 5s polling fallback.
  const activeConvId = active?.convId ?? null;
  useEffect(() => {
    if (!active) return;
    if (!activeConvId) {
      setMsgs([]); // brand-new 1:1: empty thread until the first send
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await supabase
          .from("messages")
          .select("id, sender_id, body, created_at")
          .eq("conversation_id", activeConvId)
          .order("created_at")
          .limit(200);
        if (!cancelled) setMsgs((data as Msg[]) ?? []);
        await supabase
          .from("conversation_participants")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", activeConvId)
          .eq("user_id", userId);
      } catch {
        /* keep last messages */
      }
    };
    load();

    let channel: RealtimeChannel | null = null;
    try {
      channel = supabase
        .channel(`chat-panel-${activeConvId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "podio",
            table: "messages",
            filter: `conversation_id=eq.${activeConvId}`,
          },
          () => load()
        )
        .subscribe();
    } catch {
      channel = null;
    }
    const poll = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId, active !== null]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
  }, [msgs?.length]);

  function openPerson(p: Person) {
    // Reuse the existing 1:1 conversation with this person if there is one.
    const existing = convs.find(
      (c) =>
        !c.is_group &&
        c.participantIds.length === 2 &&
        c.participantIds.includes(p.user_id) &&
        c.participantIds.includes(userId)
    );
    setMsgs(null);
    setActive({
      convId: existing?.id ?? null,
      otherId: p.user_id,
      title: p.full_name ?? "Member",
    });
  }

  function openConv(c: Conv) {
    const others = c.participantIds.filter((id) => id !== userId);
    const otherId = !c.is_group && others.length === 1 ? others[0] : null;
    const title =
      c.subject ??
      (others.length
        ? others
            .map((id) => profileOf.current.get(id)?.full_name ?? "Member")
            .join(", ")
        : "Just you");
    setMsgs(null);
    setActive({ convId: c.id, otherId, title });
  }

  async function send() {
    if (!active || !body.trim() || sending) return;
    setSending(true);
    try {
      let convId = active.convId;
      if (!convId) {
        if (!active.otherId) return;
        const { data: conv, error } = await supabase.rpc(
          "start_conversation",
          { p_subject: "", p_participants: [active.otherId] }
        );
        if (error || !conv) return;
        convId = conv.id as string;
        setActive((a) => (a ? { ...a, convId } : a));
        loadConvs(); // the new conversation joins the mini-rail
      }
      const { error: sendError } = await supabase.rpc("send_message", {
        p_conversation: convId,
        p_body: body,
      });
      if (!sendError) {
        setBody("");
        // Optimistic refresh (the realtime/poll paths will also catch it)
        const { data } = await supabase
          .from("messages")
          .select("id, sender_id, body, created_at")
          .eq("conversation_id", convId)
          .order("created_at")
          .limit(200);
        setMsgs((data as Msg[]) ?? []);
      }
    } finally {
      setSending(false);
    }
  }

  const timeFmt = (d: string) =>
    new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const startedFmt = (d: string) =>
    new Date(d).toLocaleString([], {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const q = search.trim().toLowerCase();
  const visible = (connections ?? []).filter(
    (p) => !q || (p.full_name ?? "").toLowerCase().includes(q)
  );

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-[380px] border-l border-podio-border bg-white shadow-xl">
      {/* Mini-rail: recent conversations for quick switching */}
      <div className="flex w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto bg-podio-page py-3">
        <button
          type="button"
          title="Connections"
          onClick={() => {
            setActive(null);
            setMsgs(null);
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            active
              ? "text-podio-secondary hover:text-podio-ink"
              : "bg-white text-podio-ink shadow-sm"
          }`}
        >
          <PodioIcon icon="contact" className="h-5 w-5" />
        </button>
        {convs.map((c) => {
          const others = c.participantIds.filter((id) => id !== userId);
          const other =
            !c.is_group && others.length === 1
              ? profileOf.current.get(others[0])
              : null;
          const label =
            c.subject ?? other?.full_name ?? (c.is_group ? "Group" : "Member");
          const isActive = active?.convId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              title={label}
              onClick={() => openConv(c)}
              className={`rounded-full ${
                isActive ? "ring-2 ring-podio-teal ring-offset-1" : "opacity-80 hover:opacity-100"
              }`}
            >
              <Avatar
                name={label}
                url={other?.avatar_url}
                className="h-9 w-9"
              />
            </button>
          );
        })}
      </div>

      {/* Panel column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!active ? (
          <>
            {/* Connections: search header + presence list */}
            <div className="flex items-center gap-2 border-b border-podio-border px-3 py-2.5">
              <PodioIcon
                icon="search"
                className="h-4 w-4 shrink-0 text-podio-meta"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search connections"
                className="min-w-0 flex-1 text-sm text-podio-ink outline-none placeholder:text-podio-meta"
              />
              <button
                type="button"
                onClick={onClose}
                title="Close chat"
                className="shrink-0 text-podio-meta hover:text-podio-ink"
              >
                <PodioIcon icon="x" className="h-4 w-4" />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto">
              {connections === null && (
                <li className="px-3 py-6 text-center text-sm text-podio-meta">
                  Loading…
                </li>
              )}
              {visible.map((p) => (
                <li key={p.user_id}>
                  <button
                    type="button"
                    onClick={() => openPerson(p)}
                    className="flex w-full items-center gap-3 border-b border-podio-border px-3 py-3 text-left hover:bg-podio-row-alt"
                  >
                    <Avatar
                      name={p.full_name}
                      url={p.avatar_url}
                      className="h-9 w-9 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-podio-ink">
                      {p.full_name ?? "Member"}
                    </span>
                    <PresenceDot online={online.has(p.user_id)} />
                  </button>
                </li>
              ))}
              {connections !== null && visible.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-podio-meta">
                  {q ? "No connections match." : "No connections yet."}
                </li>
              )}
            </ul>
          </>
        ) : (
          <>
            {/* Thread header: ‹ back, name + presence, lock, ✕ */}
            <div className="flex items-center gap-2 border-b border-podio-border px-3 py-2.5">
              <button
                type="button"
                onClick={() => {
                  setActive(null);
                  setMsgs(null);
                }}
                title="Back to connections"
                className="shrink-0 px-1 text-lg leading-none text-podio-secondary hover:text-podio-ink"
              >
                ‹
              </button>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-podio-ink">
                {active.title}
              </span>
              {active.otherId && (
                <PresenceDot online={online.has(active.otherId)} />
              )}
              <PodioIcon
                icon="lock"
                className="h-4 w-4 shrink-0 text-podio-meta"
              />
              <button
                type="button"
                onClick={onClose}
                title="Close chat"
                className="shrink-0 text-podio-meta hover:text-podio-ink"
              >
                <PodioIcon icon="x" className="h-4 w-4" />
              </button>
            </div>

            {/* Messages, newest at the bottom */}
            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {msgs === null && (
                <p className="py-4 text-center text-sm text-podio-meta">
                  Loading…
                </p>
              )}
              {msgs && msgs.length > 0 && (
                <p className="pb-1 text-center text-xs text-podio-meta">
                  Started on {startedFmt(msgs[0].created_at)}
                </p>
              )}
              {msgs && msgs.length === 0 && (
                <p className="py-4 text-center text-sm text-podio-meta">
                  Say hello — messages are private between you.
                </p>
              )}
              {msgs?.map((m) => {
                const mine = m.sender_id === userId;
                const senderName = mine
                  ? "You"
                  : profileOf.current.get(m.sender_id)?.full_name ??
                    active.title;
                return (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded px-3 py-2 ${
                      mine ? "ml-auto bg-podio-row-alt" : "mr-auto bg-white"
                    }`}
                  >
                    <p className="text-xs text-podio-meta">
                      <span className="font-semibold text-podio-secondary">
                        {senderName}
                      </span>{" "}
                      · {timeFmt(m.created_at)}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-podio-ink">
                      {m.body}
                    </p>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-podio-border p-3">
              <div className="flex gap-2">
                <input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Add a message"
                  className="min-w-0 flex-1 rounded border border-podio-border px-3 py-2 text-sm text-podio-ink outline-none placeholder:text-podio-meta focus:border-podio-teal"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !body.trim()}
                  className="shrink-0 rounded bg-podio-teal px-4 text-sm font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3 text-podio-disabled">
                <button
                  type="button"
                  title="Attach file (coming soon)"
                  className="cursor-default"
                >
                  <PodioIcon icon="paperclip" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Share link (coming soon)"
                  className="cursor-default"
                >
                  <PodioIcon icon="link" className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
