"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Person = { user_id: string; full_name: string | null };

export function NewConversation({ people }: { people: Person[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function start() {
    setError(null);
    if (selected.length === 0) return setError("Pick at least one person.");
    const { data: conv, error: rpcError } = await supabase.rpc(
      "start_conversation",
      { p_subject: subject, p_participants: selected }
    );
    if (rpcError) return setError(rpcError.message);
    setOpen(false);
    setSubject("");
    setSelected([]);
    router.push(`/messages?c=${conv.id}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-sm bg-podio-teal px-3 py-2 text-sm font-semibold text-white hover:bg-podio-teal-dark"
      >
        + New conversation
      </button>
    );
  }

  return (
    <div className="rounded border border-podio-border bg-white p-3">
      <input
        placeholder="Subject (optional)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded-sm border border-podio-border px-2 py-1.5 text-sm text-podio-ink outline-none placeholder:text-podio-meta focus:border-podio-teal"
      />
      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
        {people.map((p) => (
          <label
            key={p.user_id}
            className="flex items-center gap-2 text-sm text-podio-ink"
          >
            <input
              type="checkbox"
              checked={selected.includes(p.user_id)}
              onChange={() => toggle(p.user_id)}
            />
            {p.full_name ?? p.user_id.slice(0, 8)}
          </label>
        ))}
        {people.length === 0 && (
          <p className="text-xs text-podio-meta">No other users yet.</p>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={start}
          className="rounded-sm bg-podio-teal px-3 py-1 text-xs font-semibold text-white hover:bg-podio-teal-dark">
          Start
        </button>
        <button onClick={() => setOpen(false)}
          className="rounded-sm border border-podio-border px-3 py-1 text-xs text-podio-secondary hover:bg-podio-row-hover">
          Cancel
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
