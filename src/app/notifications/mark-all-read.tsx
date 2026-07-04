"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MarkAllRead() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <button
      onClick={async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .is("read_at", null);
        router.refresh();
      }}
      className="rounded border border-podio-border bg-white px-3 py-1.5 text-sm text-podio-teal hover:bg-podio-row-hover"
    >
      Mark all read
    </button>
  );
}
