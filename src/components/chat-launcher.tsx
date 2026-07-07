"use client";

import { useState } from "react";
import { PodioIcon } from "@/components/podio-icon";
import { ChatPanel } from "@/components/chat-panel";
import { usePresence } from "@/components/use-presence";

// The 💬 launcher at the far right of the global bar (design skill
// layouts.md §1/§13). Presence lives HERE, not in the panel: the hook joins
// the shared "online" channel after mount on every page, so the user counts
// as online while they have the app open — not only while the panel is open.
// The panel itself just consumes the resulting Set for its dots.
export function ChatLauncher({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const online = usePresence(userId);

  return (
    <>
      <button
        type="button"
        title="Chat"
        onClick={() => setOpen((o) => !o)}
        className={open ? "rounded bg-white p-1.5 text-podio-ink shadow-sm" : "hover:opacity-80"}
      >
        <PodioIcon icon="chat" className="h-5 w-5" />
      </button>
      {open && (
        <ChatPanel
          userId={userId}
          online={online}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
