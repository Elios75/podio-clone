"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Template = { id: string; name: string; subject: string; body_text: string | null };

export function SendEmail({
  itemId,
  itemTitle,
  defaultTo,
  templates,
}: {
  itemId: string;
  itemTitle: string;
  defaultTo: string | null;
  templates: Template[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo ?? "");
  const [subject, setSubject] = useState(`Re: ${itemTitle}`);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject.replaceAll("{item_title}", itemTitle));
    setBody((t.body_text ?? "").replaceAll("{item_title}", itemTitle));
  }

  async function send() {
    setError(null);
    setStatus(null);
    const { error: rpcError } = await supabase.rpc("send_item_email", {
      p_item: itemId,
      p_to: to,
      p_subject: subject,
      p_body: body,
    });
    if (rpcError) return setError(rpcError.message);
    setStatus("Queued — delivers within a minute once Resend is configured.");
    setBody("");
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
        ✉️ Send email
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-lg border border-blue-200 bg-white p-3">
      <div className="flex flex-wrap gap-2">
        <input type="email" placeholder="to@example.com" value={to}
          onChange={(e) => setTo(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
        {templates.length > 0 && (
          <select defaultValue="" onChange={(e) => e.target.value && applyTemplate(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      <input placeholder="Subject" value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
      <textarea placeholder="Message" rows={4} value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
      <div className="flex items-center gap-2">
        <button onClick={send} disabled={!to || !subject}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Send
        </button>
        <button onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
          Close
        </button>
        {status && <span className="text-xs text-green-600">{status}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
