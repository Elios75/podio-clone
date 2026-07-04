"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/slug";

export function CreateWorkspaceForm({
  orgId,
  orgSlug,
}: {
  orgId: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [privacy, setPrivacy] = useState<"private" | "open">("private");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data: ws, error: rpcError } = await supabase.rpc(
      "create_workspace",
      {
        p_org: orgId,
        p_name: name,
        p_slug: slugify(name),
        p_privacy: privacy,
      }
    );

    setLoading(false);
    if (rpcError) {
      setError(
        rpcError.message.includes("duplicate key")
          ? "A workspace with that name already exists in this organization."
          : rpcError.message
      );
      return;
    }

    setName("");
    router.push(`/org/${orgSlug}/${ws.slug}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <p className="text-sm font-medium">New workspace</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          required
          placeholder="Workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={privacy}
          onChange={(e) => setPrivacy(e.target.value as "private" | "open")}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="private">Private (invite only)</option>
          <option value="open">Open (any org member can join)</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
