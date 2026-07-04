"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function InstallButton({
  templateId,
  wsId,
  orgSlug,
  wsSlug,
}: {
  templateId: string;
  wsId: string;
  orgSlug: string;
  wsSlug: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function install() {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("install_app_template", {
      p_template: templateId,
      p_workspace: wsId,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    router.push(`/org/${orgSlug}/${wsSlug}/${data.slug}`);
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={install}
        disabled={busy}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Installing…" : "Install"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
