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
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="truncate text-sm font-medium">{title}</p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => {
          const day = dayFmt(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id}>
              {showDay && (
                <p className="my-2 text-center text-[11px] text-slate-300">{day}</p>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {!mine && (
                    <p className="text-[11px] font-medium text-slate-500">
                      {m.sender_name}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-0.5 text-right text-[10px] ${
                    mine ? "text-blue-200" : "text-slate-400"}`}>
                    {timeFmt(m.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-slate-200 p-3">
        <textarea
          rows={1}
          placeholder="Type a message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={sending || !body.trim()}
          className="rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </>
  );
}
