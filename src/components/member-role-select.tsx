"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MemberRoleSelect({
  table,
  memberId,
  role,
  options,
}: {
  table: "workspace_members" | "organization_members";
  memberId: string;
  role: string;
  options: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState(false);

  return (
    <span className="flex items-center gap-1">
      <select
        value={role}
        onChange={async (e) => {
          setError(false);
          const { error: upError } = await supabase
            .from(table)
            .update({ role: e.target.value })
            .eq("id", memberId);
          if (upError) setError(true);
          router.refresh();
        }}
        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600"
        title={error ? "Only admins can change roles" : "Change role"}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {error && <span className="text-xs text-red-500">✕</span>}
    </span>
  );
}
