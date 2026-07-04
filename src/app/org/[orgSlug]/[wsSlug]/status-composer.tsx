"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Podio-style workspace composer: share a status, attach files (📎), share a
// link (🔗), or ask the workspace a question (❓). Files/links become `files`
// rows attached to the status post via file_attachments (target 'status_post');
// question mode is stored in body_rich.kind so the feed can style it.
export function StatusComposer({ wsId, orgId }: { wsId: string; orgId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [question, setQuestion] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPost =
    body.trim().length > 0 || pendingFiles.length > 0 || link.trim().length > 0;

  async function post() {
    if (!canPost || posting) return;
    setPosting(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: postRow, error: postError } = await supabase
        .from("status_posts")
        .insert({
          workspace_id: wsId,
          created_by: user!.id,
          body: body.trim() || (pendingFiles.length ? "Shared a file" : "Shared a link"),
          body_rich: question ? { kind: "question" } : null,
        })
        .select()
        .single();
      if (postError) throw new Error(postError.message);

      const attach = async (fileRowId: string) => {
        const { error: attachError } = await supabase.from("file_attachments").insert({
          file_id: fileRowId,
          target_type: "status_post",
          target_id: postRow.id,
          attached_by: user!.id,
        });
        if (attachError) throw new Error(attachError.message);
      };

      for (const f of pendingFiles) {
        const path = `${wsId}/status/${crypto.randomUUID()}-${f.name}`;
        const { error: upError } = await supabase.storage
          .from("podio-files")
          .upload(path, f);
        if (upError) throw new Error(upError.message);
        const { data: fileRow, error: fileError } = await supabase
          .from("files")
          .insert({
            organization_id: orgId,
            workspace_id: wsId,
            storage_path: path,
            name: f.name,
            uploaded_by: user!.id,
          })
          .select()
          .single();
        if (fileError) throw new Error(fileError.message);
        await attach(fileRow.id);
      }

      if (link.trim()) {
        if (!/^https?:\/\//i.test(link.trim())) {
          throw new Error("Links must start with http(s)://");
        }
        const { data: fileRow, error: fileError } = await supabase
          .from("files")
          .insert({
            organization_id: orgId,
            workspace_id: wsId,
            external_url: link.trim(),
            provider: "link",
            name: link.trim().replace(/^https?:\/\//, "").slice(0, 80),
            uploaded_by: user!.id,
          })
          .select()
          .single();
        if (fileError) throw new Error(fileError.message);
        await attach(fileRow.id);
      }

      setBody("");
      setPendingFiles([]);
      setLink("");
      setLinkOpen(false);
      setQuestion(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <textarea
        placeholder={
          question
            ? "Ask your workspace a question…"
            : "Share something. Use @ to mention individuals."
        }
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        className={`w-full rounded border px-3 py-2 text-sm focus:border-podio-teal focus:outline-none ${
          question ? "border-podio-teal bg-podio-row-alt" : "border-podio-border"
        }`}
      />

      {pendingFiles.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {pendingFiles.map((f, i) => (
            <li key={i}
              className="flex items-center gap-1 rounded bg-podio-row-alt px-2 py-0.5 text-xs text-podio-secondary">
              📎 {f.name}
              <button
                onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                className="text-podio-meta hover:text-red-600">✕</button>
            </li>
          ))}
        </ul>
      )}
      {linkOpen && (
        <input
          placeholder="https://…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          className="mt-2 w-full rounded border border-podio-border px-3 py-1.5 font-mono text-xs focus:border-podio-teal focus:outline-none"
        />
      )}

      <div className="mt-2 flex items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            setPendingFiles((p) => [...p, ...Array.from(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <button onClick={() => fileInput.current?.click()} title="Attach a file"
          className="text-lg text-podio-secondary hover:text-podio-teal">📎</button>
        <button onClick={() => setLinkOpen((v) => !v)} title="Share a link"
          className={`text-lg hover:text-podio-teal ${linkOpen ? "text-podio-teal" : "text-podio-secondary"}`}>🔗</button>
        <button onClick={() => setQuestion((v) => !v)} title="Ask a question"
          className={`text-lg hover:text-podio-teal ${question ? "text-podio-teal" : "text-podio-secondary"}`}>❓</button>
        {error && <span className="text-xs text-red-600">{error}</span>}
        <button
          onClick={post}
          disabled={posting || !canPost}
          className="ml-auto rounded bg-podio-teal px-4 py-1.5 text-sm font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50"
        >
          {posting ? "Sharing…" : "Share"}
        </button>
      </div>
    </div>
  );
}
