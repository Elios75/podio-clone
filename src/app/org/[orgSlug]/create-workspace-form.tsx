"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/slug";

// Podio-style two-step workspace creation:
//   Step 1 — "Create a new workspace" modal (name + Private/Open radios).
//   Step 2 — "Invite your employees to the <name> space" (people picker,
//            message, role) inserting workspace_members + notifications.
// See docs/design/podio-design-skill/references/layouts.md §9.

type OrgMember = { user_id: string; full_name: string | null };
const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Regular member" },
  { value: "light", label: "Light member" },
  { value: "guest", label: "Guest" },
];

export function CreateWorkspaceForm({
  orgId,
  orgSlug,
  trigger = "button",
}: {
  orgId: string;
  orgSlug: string;
  trigger?: "button" | "sidebar";
}) {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<0 | 1 | 2>(0); // 0 = closed
  const [name, setName] = useState("");
  const [privacy, setPrivacy] = useState<"private" | "open">("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // step 2 state
  const [ws, setWs] = useState<{ id: string; slug: string; name: string } | null>(null);
  const [people, setPeople] = useState<OrgMember[] | null>(null);
  const [filter, setFilter] = useState("");
  const [showBook, setShowBook] = useState(false);
  const [picked, setPicked] = useState<OrgMember[]>([]);
  const [role, setRole] = useState("member");
  const [message, setMessage] = useState("");

  function goToWorkspace(slug: string) {
    setStep(0);
    router.push(`/org/${orgSlug}/${slug}`);
    router.refresh();
  }

  async function create() {
    if (!name.trim()) return setError("Give the workspace a name.");
    setBusy(true);
    setError(null);
    const { data: created, error: rpcError } = await supabase.rpc("create_workspace", {
      p_org: orgId,
      p_name: name.trim(),
      p_slug: slugify(name),
      p_privacy: privacy,
    });
    setBusy(false);
    if (rpcError) {
      setError(
        rpcError.message.includes("duplicate key")
          ? "A workspace with that name already exists in this organization."
          : rpcError.message
      );
      return;
    }
    setWs({ id: created.id, slug: created.slug, name: created.name });
    setMessage(
      `Hi, I've set up a workspace on Podio for us - so we can work on ${created.name}. Please join, so we can start getting some work done. Thanks.`
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: rows } = await supabase
      .from("organization_members")
      .select("user_id, user_profiles:user_id(full_name)")
      .eq("organization_id", orgId)
      .limit(200);
    setPeople(
      (rows ?? [])
        .filter((m: any) => m.user_id !== user?.id)
        .map((m: any) => ({
          user_id: m.user_id,
          full_name: m.user_profiles?.full_name ?? null,
        }))
    );
    setStep(2);
  }

  async function addMembers() {
    if (!ws) return;
    if (picked.length === 0) return goToWorkspace(ws.slug);
    setBusy(true);
    setError(null);
    const { error: memberError } = await supabase.from("workspace_members").insert(
      picked.map((p) => ({ workspace_id: ws.id, user_id: p.user_id, role }))
    );
    if (memberError) {
      setBusy(false);
      return setError(memberError.message);
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("notifications").insert(
      picked.map((p) => ({
        user_id: p.user_id,
        event_type: "workspace_invite",
        target_type: "workspace",
        target_id: ws.id,
        actor_id: user?.id,
        payload: {
          message,
          workspace_name: ws.name,
          url: `/org/${orgSlug}/${ws.slug}`,
        },
      }))
    );
    setBusy(false);
    goToWorkspace(ws.slug);
  }

  const suggestions = (people ?? []).filter(
    (p) =>
      !picked.some((x) => x.user_id === p.user_id) &&
      (showBook ||
        (filter.trim() &&
          (p.full_name ?? "").toLowerCase().includes(filter.trim().toLowerCase())))
  );

  const triggerEl =
    trigger === "sidebar" ? (
      <button onClick={() => setStep(1)}
        className="block w-full rounded px-2 py-1.5 text-left text-sm text-podio-teal hover:bg-podio-row-hover">
        + New workspace
      </button>
    ) : (
      <button onClick={() => setStep(1)}
        className="rounded bg-podio-teal px-4 py-2 text-sm font-semibold text-white hover:bg-podio-teal-dark">
        + New workspace
      </button>
    );

  return (
    <>
      {triggerEl}

      {step === 1 && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-24"
          onClick={() => setStep(0)}>
          <div className="w-full max-w-xl rounded bg-white p-8 shadow-lg"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start">
              <h2 className="text-2xl font-medium text-podio-teal">Create a new workspace</h2>
              <button onClick={() => setStep(0)}
                className="ml-auto text-2xl leading-none text-podio-disabled hover:text-podio-ink">✕</button>
            </div>

            <div className="mt-8 space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <label className="w-40 shrink-0 font-semibold text-podio-ink">
                  Workspace name
                </label>
                <input
                  autoFocus
                  placeholder="Type a name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                  className="min-w-56 flex-1 rounded border border-podio-border px-3 py-2.5 text-sm focus:border-podio-teal focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <span className="w-40 shrink-0 font-semibold text-podio-ink">
                  Access settings
                </span>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-baseline gap-2 text-[15px]">
                    <input type="radio" name="ws-privacy" checked={privacy === "private"}
                      onChange={() => setPrivacy("private")} />
                    <span className="font-semibold text-podio-ink">Private</span>
                    <span className="text-podio-meta">– not visible for others, invite only</span>
                  </label>
                  <label className="flex cursor-pointer items-baseline gap-2 text-[15px]">
                    <input type="radio" name="ws-privacy" checked={privacy === "open"}
                      onChange={() => setPrivacy("open")} />
                    <span className="font-semibold text-podio-ink">Open</span>
                    <span className="text-podio-meta">– visible and open for all employees to join</span>
                  </label>
                </div>
              </div>
            </div>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            <div className="mt-8 flex justify-end">
              <button onClick={() => setStep(0)}
                className="rounded-sm bg-podio-row-hover px-6 py-2.5 font-semibold text-podio-ink hover:bg-podio-border">
                Cancel
              </button>
              <button onClick={create} disabled={busy}
                className="rounded-sm bg-podio-teal px-6 py-2.5 font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50">
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && ws && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-20"
          onClick={() => goToWorkspace(ws.slug)}>
          <div className="w-full max-w-2xl rounded bg-white p-8 shadow-lg"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start">
              <h2 className="text-2xl font-semibold text-podio-ink">
                Invite your employees to the {ws.name} space
              </h2>
              <button onClick={() => goToWorkspace(ws.slug)}
                className="ml-auto text-2xl leading-none text-podio-disabled hover:text-podio-ink">✕</button>
            </div>

            <div className="mt-6 flex gap-2">
              <div className="flex flex-1 flex-wrap items-center gap-1.5 rounded border border-podio-border px-3 py-2">
                <span className="text-podio-disabled">👤</span>
                {picked.map((p) => (
                  <span key={p.user_id}
                    className="flex items-center gap-1 rounded bg-podio-row-alt px-2 py-0.5 text-sm text-podio-ink">
                    {p.full_name ?? p.user_id}
                    <button
                      onClick={() => setPicked((x) => x.filter((y) => y.user_id !== p.user_id))}
                      className="text-podio-meta hover:text-red-600">✕</button>
                  </span>
                ))}
                <input
                  placeholder={picked.length ? "" : "Pick connections or type names"}
                  value={filter}
                  onChange={(e) => { setFilter(e.target.value); setShowBook(false); }}
                  className="min-w-32 flex-1 text-sm focus:outline-none"
                />
              </div>
              <button onClick={() => { setShowBook((v) => !v); setFilter(""); }}
                className="rounded bg-podio-row-alt px-4 py-2 text-[15px] text-podio-ink hover:bg-podio-row-hover">
                Address book
              </button>
            </div>
            {suggestions.length > 0 && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-podio-border bg-white shadow-sm">
                {suggestions.slice(0, 20).map((p) => (
                  <li key={p.user_id}>
                    <button
                      onClick={() => { setPicked((x) => [...x, p]); setFilter(""); }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-podio-ink hover:bg-podio-row-hover">
                      {p.full_name ?? p.user_id}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {people !== null && people.length === 0 && (
              <p className="mt-2 text-sm text-podio-meta">
                No other organization members yet — invite people to the
                organization first, then add them here.
              </p>
            )}

            <div className="mt-4 flex items-start gap-2 rounded border border-podio-border p-3">
              <span className="text-podio-disabled">✏️</span>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex-1 resize-y text-[15px] text-podio-ink focus:outline-none"
              />
            </div>

            <div className="mt-5 flex items-center gap-2 text-[15px]">
              <span className="font-semibold text-podio-ink">Role :</span>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="rounded border border-transparent py-1 pr-6 text-podio-ink hover:border-podio-border focus:outline-none">
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-8 flex items-center justify-end gap-5">
              <button onClick={() => goToWorkspace(ws.slug)}
                className="text-[15px] text-podio-meta hover:text-podio-ink">
                Skip for now
              </button>
              <button onClick={addMembers} disabled={busy}
                className="rounded-sm bg-podio-teal px-6 py-2.5 font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50">
                {busy ? "Adding…" : `Add to ${ws.name}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
