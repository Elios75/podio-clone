"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Template = { id: string; name: string; subject: string; body_text: string | null };

export function EmailTemplatesSection({
  orgId,
  templates,
}: {
  orgId: string;
  templates: Template[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (!name.trim() || !subject.trim()) return setError("Name and subject required.");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insError } = await supabase.from("email_templates").insert({
      organization_id: orgId,
      name,
      subject,
      body_text: body || null,
      created_by: user?.id,
    });
    if (insError) return setError(insError.message);
    setOpen(false);
    setName(""); setSubject(""); setBody("");
    router.refresh();
  }

  async function remove(id: string) {
    await supabase.from("email_templates").delete().eq("id", id);
    router.refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium">Email templates</h2>
      <p className="mt-1 text-xs text-slate-400">
        Reusable in the item email composer and automation send-email actions.
        Use <code>{"{item_title}"}</code> as a placeholder.
      </p>
      <ul className="mt-3 space-y-2">
        {templates.map((t) => (
          <li key={t.id}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className="font-medium">{t.name}</span>
            <span className="truncate text-xs text-slate-400">{t.subject}</span>
            <button onClick={() => remove(t.id)}
              className="ml-auto text-xs text-slate-400 hover:text-red-600">
              delete
            </button>
          </li>
        ))}
        {templates.length === 0 && (
          <li className="text-sm text-slate-400">No templates yet.</li>
        )}
      </ul>
      {open ? (
        <div className="mt-3 space-y-2 rounded-lg border border-blue-200 bg-white p-3">
          <input placeholder="Template name" value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input placeholder="Subject (e.g. Update on {item_title})" value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <textarea placeholder="Body" rows={3} value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <div className="flex gap-2">
            <button onClick={create}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
              Create
            </button>
            <button onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
              Cancel
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          + New template
        </button>
      )}
    </section>
  );
}
