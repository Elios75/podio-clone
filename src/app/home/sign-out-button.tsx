"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="rounded-sm border border-podio-border bg-white px-3 py-1.5 text-sm text-podio-ink hover:bg-podio-row-alt"
    >
      Sign out
    </button>
  );
}
