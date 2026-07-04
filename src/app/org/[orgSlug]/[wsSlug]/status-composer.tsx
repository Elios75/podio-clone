"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function StatusComposer({ wsId }: { wsId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  async function post() {
    if (!body.trim()) return;
    setPosting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("status_posts").insert({
      workspace_id: wsId,
      created_by: user!.id,
      body,
    });
    setPosting(false);
    setBody("");
    router.refresh();
  }

  return (
    <div className="flex gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <input
        placeholder="Share a status with the workspace…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && post()}
        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
      />
      <button
        onClick={post}
        disabled={posting || !body.trim()}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Post
      </button>
    </div>
  );
}
