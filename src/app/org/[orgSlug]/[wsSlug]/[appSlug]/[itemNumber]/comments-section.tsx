"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Comment = {
  id: string;
  body: string;
  created_by: string;
  created_at: string;
  is_edited: boolean;
  author_name: string | null;
};
type Member = { user_id: string; full_name: string | null };
type Attachment = { id: string; name: string; url: string | null };
type Reaction = { emoji: string; count: number; mine: boolean };

const EMOJIS = ["👍", "❤️", "🎉"];

export function CommentsSection({
  itemId,
  orgId,
  wsId,
  currentUserId,
  comments,
  members,
  attachmentsByComment,
  reactionsByComment,
}: {
  itemId: string;
  orgId: string;
  wsId: string;
  currentUserId: string;
  comments: Comment[];
  members: Member[];
  attachmentsByComment: Record<string, Attachment[]>;
  reactionsByComment: Record<string, Reaction[]>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [body, setBody] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Live updates: refresh when anyone comments on this item
  useEffect(() => {
    const channel = supabase
      .channel(`item-comments-${itemId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "podio",
          table: "comments",
          filter: `target_id=eq.${itemId}`,
        },
        () => router.refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  function addMention(userId: string) {
    const member = members.find((m) => m.user_id === userId);
    if (!member) return;
    const name = member.full_name ?? "member";
    setBody((b) => `${b}${b.endsWith(" ") || b === "" ? "" : " "}@${name} `);
    if (!mentionIds.includes(userId)) setMentionIds([...mentionIds, userId]);
    textareaRef.current?.focus();
  }

  async function postComment() {
    setError(null);
    if (!body.trim()) return;
    setPosting(true);
    const { data: comment, error: rpcError } = await supabase.rpc("add_comment", {
      p_item: itemId,
      p_body: body,
      p_mentions: mentionIds,
    });
    if (rpcError) {
      setPosting(false);
      return setError(rpcError.message);
    }

    // Attach pending file to the new comment
    if (pendingFile && comment) {
      const path = `comments/${comment.id}/${crypto.randomUUID()}-${pendingFile.name}`;
      const { error: upError } = await supabase.storage
        .from("podio-files")
        .upload(path, pendingFile);
      if (!upError) {
        const { data: fileRow } = await supabase
          .from("files")
          .insert({
            organization_id: orgId,
            workspace_id: wsId,
            storage_path: path,
            name: pendingFile.name,
            mime_type: pendingFile.type,
            size_bytes: pendingFile.size,
            uploaded_by: currentUserId,
          })
          .select()
          .single();
        if (fileRow) {
          await supabase.from("file_attachments").insert({
            file_id: fileRow.id,
            target_type: "comment",
            target_id: comment.id,
            attached_by: currentUserId,
          });
        }
      }
    }

    setPosting(false);
    setBody("");
    setMentionIds([]);
    setPendingFile(null);
    router.refresh();
  }

  async function toggleReaction(commentId: string, emoji: string, mine: boolean) {
    if (mine) {
      await supabase
        .from("comment_reactions")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", currentUserId)
        .eq("emoji", emoji);
    } else {
      await supabase.from("comment_reactions").insert({
        comment_id: commentId,
        user_id: currentUserId,
        emoji,
      });
    }
    router.refresh();
  }

  async function saveEdit(id: string) {
    const { error: upError } = await supabase
      .from("comments")
      .update({ body: editBody, is_edited: true })
      .eq("id", id);
    if (upError) return setError(upError.message);
    setEditingId(null);
    router.refresh();
  }

  async function deleteComment(id: string) {
    await supabase.from("comments").delete().eq("id", id);
    router.refresh();
  }

  const timeFmt = (d: string) => new Date(d).toLocaleString();

  return (
    <div className="mt-3">
      {/* Comments */}
      <section>
        <h2 className="sr-only">Comments ({comments.length})</h2>

        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="font-medium text-slate-600">
                  {c.author_name ?? "Member"}
                </span>
                <span>{timeFmt(c.created_at)}</span>
                {c.is_edited && <span>(edited)</span>}
                {c.created_by === currentUserId && editingId !== c.id && (
                  <span className="ml-auto flex gap-2">
                    <button
                      onClick={() => {
                        setEditingId(c.id);
                        setEditBody(c.body);
                      }}
                      className="hover:text-blue-600"
                    >
                      edit
                    </button>
                    <button onClick={() => deleteComment(c.id)} className="hover:text-red-600">
                      delete
                    </button>
                  </span>
                )}
              </div>
              {editingId === c.id ? (
                <div className="mt-2">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    rows={2}
                  />
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => saveEdit(c.id)}
                      className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="rounded border border-slate-300 px-3 py-1 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              )}

              {/* Attachments */}
              {(attachmentsByComment[c.id] ?? []).map((a) =>
                a.url ? (
                  <a key={a.id} href={a.url} target="_blank"
                    className="mt-2 inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-blue-600 hover:underline">
                    📎 {a.name}
                  </a>
                ) : (
                  <span key={a.id}
                    className="mt-2 inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-400">
                    📎 {a.name}
                  </span>
                )
              )}

              {/* Reactions */}
              <div className="mt-2 flex gap-1">
                {EMOJIS.map((emoji) => {
                  const r = (reactionsByComment[c.id] ?? []).find((x) => x.emoji === emoji);
                  return (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(c.id, emoji, r?.mine ?? false)}
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        r?.mine
                          ? "border-blue-300 bg-blue-50"
                          : "border-slate-200 hover:bg-slate-50"
                      } ${r?.count ? "" : "opacity-40 hover:opacity-100"}`}
                    >
                      {emoji}
                      {r?.count ? ` ${r.count}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-sm text-slate-400">No comments yet.</p>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <textarea
            ref={textareaRef}
            placeholder="Write a comment…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <label className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">
              📎 {pendingFile ? pendingFile.name.slice(0, 20) : "Attach"}
              <input
                type="file"
                className="hidden"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <select
              value=""
              onChange={(e) => e.target.value && addMention(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500"
            >
              <option value="">@ Mention…</option>
              {members
                .filter((m) => m.user_id !== currentUserId)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name ?? m.user_id.slice(0, 8)}
                  </option>
                ))}
            </select>
            <button
              onClick={postComment}
              disabled={posting || !body.trim()}
              className="ml-auto rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {posting ? "Posting…" : "Comment"}
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </section>
    </div>
  );
}
