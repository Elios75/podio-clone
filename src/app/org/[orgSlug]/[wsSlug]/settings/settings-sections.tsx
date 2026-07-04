"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MemberRoleSelect } from "@/components/member-role-select";

const WS_ROLES = ["admin", "member", "light", "guest"];

const inputCls =
  "rounded border border-podio-border bg-white px-2.5 py-1.5 text-sm text-podio-ink focus:border-podio-teal focus:outline-none";
const tealBtnCls =
  "rounded bg-podio-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-podio-teal-dark";
const redBtnCls =
  "rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50";

/* ------------------------------------------------------------------ */
/* General                                                             */
/* ------------------------------------------------------------------ */

export function GeneralSettings({
  wsId,
  name,
  description,
  privacy,
  privacyOptions,
}: {
  wsId: string;
  name: string;
  description: string | null;
  privacy: string;
  privacyOptions: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [nameVal, setNameVal] = useState(name);
  const [descVal, setDescVal] = useState(description ?? "");
  const [privacyVal, setPrivacyVal] = useState(privacy);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaved(false);
    setError(null);
    if (!nameVal.trim()) return setError("Name is required");
    const { error: upError } = await supabase
      .from("workspaces")
      .update({
        name: nameVal.trim(),
        description: descVal.trim() || null,
        privacy: privacyVal,
      })
      .eq("id", wsId);
    if (upError) return setError(upError.message);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-podio-meta">
          Name
        </span>
        <input
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          className={`w-full max-w-md ${inputCls}`}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-podio-meta">
          Description
        </span>
        <textarea
          value={descVal}
          onChange={(e) => setDescVal(e.target.value)}
          rows={3}
          className={`w-full max-w-md ${inputCls}`}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-podio-meta">
          Privacy
        </span>
        <select
          value={privacyVal}
          onChange={(e) => setPrivacyVal(e.target.value)}
          className={inputCls}
        >
          {privacyOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={save} className={tealBtnCls}>
          Save
        </button>
        {saved && <span className="text-xs text-green-600">Saved ✓</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Apps                                                                */
/* ------------------------------------------------------------------ */

export function AppsManager({
  apps,
  orgSlug,
  wsSlug,
}: {
  apps: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    is_archived: boolean;
  }[];
  orgSlug: string;
  wsSlug: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);

  async function setArchived(appId: string, archived: boolean) {
    setError(null);
    const { error: upError } = await supabase
      .from("apps")
      .update({ is_archived: archived })
      .eq("id", appId);
    if (upError) return setError(upError.message);
    router.refresh();
  }

  return (
    <div>
      <ul className="divide-y divide-podio-border">
        {apps.map((a) => (
          <li
            key={a.id}
            className={`flex items-center gap-3 px-1 py-2 hover:bg-podio-row-hover ${
              a.is_archived ? "opacity-60" : ""
            }`}
          >
            <span className="w-6 shrink-0 text-center">{a.icon ?? "📦"}</span>
            <Link
              href={`/org/${orgSlug}/${wsSlug}/${a.slug}`}
              className="truncate text-sm font-semibold text-podio-teal hover:underline"
            >
              {a.name}
            </Link>
            {a.is_archived && (
              <span className="rounded bg-podio-row-alt px-2 py-0.5 text-xs text-podio-secondary">
                archived
              </span>
            )}
            <button
              onClick={() => setArchived(a.id, !a.is_archived)}
              className="ml-auto shrink-0 rounded border border-podio-border px-2.5 py-1 text-xs font-semibold text-podio-secondary hover:bg-podio-row-hover"
            >
              {a.is_archived ? "Restore" : "Archive"}
            </button>
          </li>
        ))}
        {apps.length === 0 && (
          <li className="px-1 py-3 text-sm text-podio-meta">
            No apps in this workspace yet.
          </li>
        )}
      </ul>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Members                                                             */
/* ------------------------------------------------------------------ */

export function MembersManager({
  wsId,
  members,
  invitable,
  currentUserId,
}: {
  wsId: string;
  members: { id: string; role: string; user_id: string; name: string }[];
  invitable: { user_id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);
  const [inviteUser, setInviteUser] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  async function removeMember(memberId: string, name: string) {
    setError(null);
    if (!confirm(`Remove ${name} from this workspace?`)) return;
    const { error: delError } = await supabase
      .from("workspace_members")
      .delete()
      .eq("id", memberId);
    if (delError) return setError(delError.message);
    router.refresh();
  }

  async function invite() {
    setError(null);
    if (!inviteUser) return;
    const { error: insError } = await supabase.from("workspace_members").insert({
      workspace_id: wsId,
      user_id: inviteUser,
      role: inviteRole,
    });
    if (insError) return setError(insError.message);
    setInviteUser("");
    router.refresh();
  }

  return (
    <div>
      <ul className="divide-y divide-podio-border">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-1 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-podio-chrome text-xs font-semibold text-podio-ink">
              {m.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="truncate text-sm text-podio-ink">
              {m.name}
              {m.user_id === currentUserId && (
                <span className="ml-1.5 text-xs text-podio-meta">(you)</span>
              )}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <MemberRoleSelect
                table="workspace_members"
                memberId={m.id}
                role={m.role}
                options={WS_ROLES}
              />
              <button
                onClick={() => removeMember(m.id, m.name)}
                className="rounded border border-podio-border px-2 py-0.5 text-xs text-podio-secondary hover:border-red-300 hover:bg-red-50 hover:text-red-600"
              >
                Remove
              </button>
            </span>
          </li>
        ))}
        {members.length === 0 && (
          <li className="px-1 py-3 text-sm text-podio-meta">No members yet.</li>
        )}
      </ul>

      <div className="mt-4 border-t border-podio-border pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-podio-meta">
          Add organization member
        </h3>
        {invitable.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={inviteUser}
              onChange={(e) => setInviteUser(e.target.value)}
              className={inputCls}
            >
              <option value="">Select a person…</option>
              {invitable.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.name}
                </option>
              ))}
            </select>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className={inputCls}
            >
              {WS_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              onClick={invite}
              disabled={!inviteUser}
              className={`${tealBtnCls} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Add to workspace
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-podio-meta">
            Everyone in the organization is already a member of this workspace.
          </p>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Danger zone                                                         */
/* ------------------------------------------------------------------ */

export function DangerZone({
  wsId,
  wsName,
  orgSlug,
  currentUserId,
  isArchived,
}: {
  wsId: string;
  wsName: string;
  orgSlug: string;
  currentUserId: string;
  isArchived: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");

  async function leave() {
    setError(null);
    if (!confirm("Leave this workspace? You may lose access to its apps.")) return;
    const { error: delError } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", wsId)
      .eq("user_id", currentUserId);
    if (delError) return setError(delError.message);
    router.push(`/org/${orgSlug}`);
  }

  async function toggleArchive() {
    setError(null);
    const { error: upError } = await supabase
      .from("workspaces")
      .update({ is_archived: !isArchived })
      .eq("id", wsId);
    if (upError) return setError(upError.message);
    router.refresh();
  }

  async function destroy() {
    setError(null);
    if (confirmName !== wsName) return setError("Type the workspace name to confirm.");
    const { error: delError } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", wsId);
    if (delError) return setError(delError.message);
    router.push(`/org/${orgSlug}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={leave} className={redBtnCls}>
          Leave workspace
        </button>
        <span className="text-xs text-podio-meta">
          Removes you from the member list; the workspace stays.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-podio-border pt-4">
        <button onClick={toggleArchive} className={redBtnCls}>
          {isArchived ? "Unarchive workspace" : "Archive workspace"}
        </button>
        <span className="text-xs text-podio-meta">
          {isArchived
            ? "This workspace is archived — restore it for the whole team."
            : "Hides the workspace without deleting anything."}
        </span>
      </div>

      <div className="border-t border-podio-border pt-4">
        <p className="text-sm text-podio-secondary">
          Delete this workspace and everything in it — apps, items, tasks and
          files. This cannot be undone. Type{" "}
          <span className="font-semibold text-podio-ink">{wsName}</span> to
          confirm.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={wsName}
            className={`w-64 ${inputCls}`}
          />
          <button
            onClick={destroy}
            disabled={confirmName !== wsName}
            className={`${redBtnCls} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Delete workspace
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
