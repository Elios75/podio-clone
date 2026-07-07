"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";

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
          className="rounded-sm border border-podio-border bg-white px-2 py-1 text-xs text-podio-secondary hover:bg-podio-row-hover"
        >
          Add to Google
        </a>
        <a
          href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent("Podio Clone")}`}
          target="_blank" rel="noreferrer"
          className="rounded-sm border border-podio-border bg-white px-2 py-1 text-xs text-podio-secondary hover:bg-podio-row-hover"
        >
          Add to Outlook
        </a>
        <a
          href={webcal}
          className="rounded-sm border border-podio-border bg-white px-2 py-1 text-xs text-podio-secondary hover:bg-podio-row-hover"
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
          className="rounded-sm border border-podio-border bg-white px-2 py-1 text-xs text-podio-secondary hover:bg-podio-row-hover"
        >
          {copied ? "Copied ✓" : "Copy URL"}
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={reveal}
      className="inline-flex items-center gap-1.5 rounded-sm border border-podio-border bg-white px-3 py-1.5 text-xs text-podio-secondary hover:bg-podio-row-hover"
      title="Subscribe from Google Calendar, Outlook, or Apple Calendar"
    >
      <PodioIcon icon="calendar" className="h-4 w-4" />
      Subscribe to calendar
    </button>
  );
}
