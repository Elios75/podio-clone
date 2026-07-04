"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function NotificationPrefs({
  userId,
  prefs,
}: {
  userId: string;
  prefs: Record<string, any>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [digest, setDigest] = useState(prefs?.email_digest === "true" || prefs?.email_digest === true);
  const [saved, setSaved] = useState(false);

  async function save(next: boolean) {
    setDigest(next);
    setSaved(false);
    await supabase
      .from("user_profiles")
      .update({
        notification_prefs: { ...(prefs ?? {}), email_digest: next ? "true" : "false" },
      })
      .eq("user_id", userId);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="mt-6 rounded border border-podio-border bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-podio-ink">Preferences</p>
      <label className="mt-2 flex items-center gap-2 text-sm text-podio-secondary">
        <input
          type="checkbox"
          checked={digest}
          onChange={(e) => save(e.target.checked)}
        />
        Email me a daily digest of unread notifications
        {saved && <span className="text-xs text-podio-teal">saved ✓</span>}
      </label>
      <p className="mt-1 text-xs text-podio-meta">
        Sent each morning when there's something new. (Queued now; delivery goes
        live with the email provider hookup in Phase 11.)
      </p>
    </div>
  );
}
