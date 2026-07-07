"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function CreateOrgForm() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Atomic: creates the org AND the owner membership in one database call.
    const { error: rpcError } = await supabase.rpc("create_organization", {
      p_name: name,
      p_slug: slugify(name),
    });

    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        required
        placeholder="New organization name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 rounded-sm border border-podio-border bg-white px-3 py-2 text-sm text-podio-ink placeholder:text-podio-meta focus:border-podio-teal focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-sm bg-podio-teal px-4 py-2 text-sm font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
