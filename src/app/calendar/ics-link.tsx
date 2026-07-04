"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function IcsLink() {
  const supabase = createClient();
  const [url, setUrl] = useState<string | null>(null);

  async function reveal() {
    const { data: token } = await supabase.rpc("get_or_create_ics_token");
    if (token) setUrl(`${window.location.origin}/api/ics/${token}`);
  }

  if (url) {
    return (
      <span className="flex items-center gap-1">
        <code className="max-w-48 truncate rounded bg-slate-100 px-2 py-1 text-xs">{url}</code>
        <button
          onClick={() => navigator.clipboard.writeText(url)}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          Copy
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={reveal}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
      title="Subscribe from Google Calendar or Outlook"
    >
      📅 Calendar feed (ICS)
    </button>
  );
}
