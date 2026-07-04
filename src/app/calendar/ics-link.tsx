"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Calendar sync out (Phase 13): calendars subscribe to the tokenized ICS feed
// and auto-refresh on their own schedule — no OAuth needed. Google/Outlook take
// the https URL via their "add by URL" endpoints; Apple Calendar and others
// use the webcal:// scheme, which is the same URL with a protocol that means
// "subscribe, don't download".
export function IcsLink() {
  const supabase = createClient();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function reveal() {
    const { data: token } = await supabase.rpc("get_or_create_ics_token");
    if (token) setUrl(`${window.location.origin}/api/ics/${token}`);
  }

  if (url) {
    const webcal = url.replace(/^https?:\/\//, "webcal://");
    const enc = encodeURIComponent(webcal);
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <a
          href={`https://calendar.google.com/calendar/r?cid=${enc}`}
          target="_blank" rel="noreferrer"
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
        >
          Add to Google
        </a>
        <a
          href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent("Podio Clone")}`}
          target="_blank" rel="noreferrer"
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
        >
          Add to Outlook
        </a>
        <a
          href={webcal}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          title="Apple Calendar and any app that supports webcal subscriptions"
        >
          Apple / webcal
        </a>
        <button
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          {copied ? "Copied ✓" : "Copy URL"}
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={reveal}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
      title="Subscribe from Google Calendar, Outlook, or Apple Calendar"
    >
      📅 Subscribe to calendar
    </button>
  );
}
