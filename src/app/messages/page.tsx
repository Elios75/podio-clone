import Link from "next/link";
import { redirect } from "next/navigation";
import { GlobalBar } from "@/components/global-bar";
import { OrgPickerDrawer } from "@/components/org-picker-drawer";
import { getGlobalChrome } from "@/lib/global-chrome";
import { Thread } from "./thread";
import { NewConversation } from "./new-conversation";

// Standalone messages page, styled like the §13 chat panel grammar:
// conversation list on the left (white bordered panel, hairline dividers),
// selected thread on the right. The global chrome NEVER disappears: the
// shared GlobalBar renders here with the messages tool active and the ☰
// org/workspace picker drawer in its left slot (design skill layouts.md §1).
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: selectedId } = await searchParams;
  const chrome = await getGlobalChrome();
  if (!chrome) redirect("/login");
  const { supabase, user } = chrome;
  // Plain const so no narrowing is needed inside the hoisted helpers below.
  const userId = user.id;

  // Conversations I'm in (RLS handles filtering), newest activity first
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, subject, is_group, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  const convIds = (conversations ?? []).map((c) => c.id);

  const { data: participants } = convIds.length
    ? await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id, last_read_at, starred")
        .in("conversation_id", convIds)
    : { data: [] as any[] };

  // Last message per conversation (cheap approach: fetch recent, reduce)
  const { data: recentMsgs } = convIds.length
    ? await supabase
        .from("messages")
        .select("conversation_id, sender_id, body, created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] as any[] };
  const lastMsg = new Map<string, any>();
  for (const m of recentMsgs ?? []) {
    if (!lastMsg.has(m.conversation_id)) lastMsg.set(m.conversation_id, m);
  }

  // Names for everyone involved
  const userIds = [...new Set((participants ?? []).map((p) => p.user_id))];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, full_name");
  const nameOf = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));

  function convLabel(convId: string, subject: string | null) {
    if (subject) return subject;
    const others = (participants ?? [])
      .filter((p) => p.conversation_id === convId && p.user_id !== userId)
      .map((p) => nameOf.get(p.user_id) ?? "Member");
    return others.join(", ") || "Just you";
  }

  function isUnread(convId: string) {
    const me = (participants ?? []).find(
      (p) => p.conversation_id === convId && p.user_id === userId
    );
    const last = lastMsg.get(convId);
    if (!last || last.sender_id === userId) return false;
    return !me?.last_read_at || new Date(last.created_at) > new Date(me.last_read_at);
  }

  // Selected thread data
  const selected = (conversations ?? []).find((c) => c.id === selectedId) ?? null;
  const { data: messages } = selected
    ? await supabase
        .from("messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", selected.id)
        .order("created_at")
        .limit(200)
    : { data: [] as any[] };

  return (
    <div className="flex h-screen flex-col bg-podio-page">
      <GlobalBar
        left={<OrgPickerDrawer orgs={chrome.pickerOrgs} />}
        activeTool="messages"
        user={chrome.barUser}
        initialUnread={chrome.unread}
      />

      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-4 md:py-5">
        <h1 className="text-xl font-semibold text-podio-ink">Messages</h1>

        <div className="mt-3 flex min-h-0 flex-1 gap-4">
          {/* Conversation list (left, §13 connection-row grammar) */}
          <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded border border-podio-border bg-white shadow-sm md:w-72">
            <div className="border-b border-podio-border p-3">
              <NewConversation
                people={(profiles ?? [])
                  .filter((p) => p.user_id !== userId)
                  .map((p) => ({ user_id: p.user_id, full_name: p.full_name }))}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {(conversations ?? []).map((c) => (
                <Link
                  key={c.id}
                  href={`/messages?c=${c.id}`}
                  className={`block border-b border-podio-border px-3 py-3 ${
                    c.id === selectedId
                      ? "bg-podio-row-hover"
                      : "hover:bg-podio-row-alt"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-podio-ink">
                      {convLabel(c.id, c.subject)}
                    </span>
                    {isUnread(c.id) && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-podio-orange" />
                    )}
                  </div>
                  {lastMsg.get(c.id) && (
                    <p className="mt-0.5 truncate text-xs text-podio-meta">
                      {lastMsg.get(c.id).body}
                    </p>
                  )}
                </Link>
              ))}
              {(conversations ?? []).length === 0 && (
                <p className="p-6 text-center text-xs text-podio-meta">
                  No conversations yet.
                </p>
              )}
            </div>
          </div>

          {/* Thread (right) */}
          <div className="flex min-w-0 flex-1 flex-col rounded border border-podio-border bg-white shadow-sm">
            {selected ? (
              <Thread
                conversationId={selected.id}
                title={convLabel(selected.id, selected.subject)}
                currentUserId={userId}
                messages={(messages ?? []).map((m) => ({
                  ...m,
                  sender_name: nameOf.get(m.sender_id) ?? "Member",
                }))}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-podio-meta">
                Select or start a conversation
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
