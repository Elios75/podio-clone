"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Msg = {
  id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

export function Thread({
  conversationId,
  title,
  currentUserId,
  messages,
}: {
  conversationId: string;
  title: string;
  currentUserId: string;
  messages: Msg[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Mark read on open and whenever new messages render
  useEffect(() => {
    supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", currentUserId)
      .then(() => {});
    bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages.length]);

  // Live delivery
  useEffect(() => {
    const channel = supabase
      .channel(`conv-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "podio",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => router.refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    const { error } = await supabase.rpc("send_message", {
      p_conversation: conversationId,
      p_body: body,
    });
    setSending(false);
    if (!error) {
      setBody("");
      router.refresh();
    }
  }

  const timeFmt = (d: string) =>
    new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dayFmt = (d: string) => new Date(d).toLocaleDateString();

  let lastDay = "";

  return (
    <>
      <div className="border-b border-podio-border px-4 py-3">
        <p className="truncate text-sm font-semibold text-podio-ink">{title}</p>
      </div>

      {/* Messages, §13 chat-panel grammar: own messages right-aligned on
          bg-podio-row-alt, others plain on white; every message timestamped. */}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => {
          const day = dayFmt(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id}>
              {showDay && (
                <p className="my-2 text-center text-[11px] text-podio-meta">{day}</p>
              )}
              <div
                className={`max-w-[75%] rounded px-3 py-2 ${
                  mine ? "ml-auto bg-podio-row-alt" : "mr-auto bg-white"
                }`}
              >
                <p className="text-xs text-podio-meta">
                  <span className="font-semibold text-podio-secondary">
                    {mine ? "You" : m.sender_name}
                  </span>{" "}
                  · {timeFmt(m.created_at)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-podio-ink">
                  {m.body}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-podio-border p-3">
        <textarea
          rows={1}
          placeholder="Add a message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="flex-1 resize-none rounded-sm border border-podio-border px-3 py-2 text-sm text-podio-ink outline-none placeholder:text-podio-meta focus:border-podio-teal"
        />
        <button
          onClick={send}
          disabled={sending || !body.trim()}
          className="rounded-sm bg-podio-teal px-4 text-sm font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </>
  );
}
