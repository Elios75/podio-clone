"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";

type MemberAvatar = {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};
type Invitable = { user_id: string; full_name: string | null };

function Avatar({ name, url }: { name: string | null; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name ?? "member"} title={name ?? undefined}
        className="h-12 w-12 rounded-full border border-podio-border object-cover" />
    );
  }
  const initials = (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span title={name ?? undefined}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-podio-chrome text-sm font-semibold text-podio-ink">
      {initials}
    </span>
  );
}

// Podio workspace header card: teal workspace name, wrench admin menu (top
// right), member photo row, and ⊕ INVITE. Mirrors the reference screenshots —
// see docs/design/podio-design-skill/references/layouts.md §8-9.
export function WorkspaceHeader({
  orgSlug, wsSlug, wsId, name, privacy, description, members, invitable,
}: {
  orgSlug: string;
  wsSlug: string;
  wsId: string;
  name: string;
  privacy: string;
  description: string | null;
  members: MemberAvatar[];
  invitable: Invitable[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/org/${orgSlug}/${wsSlug}`;

  async function invite() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    const { error: invError } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: wsId, user_id: pick, role: "member" });
    setBusy(false);
    if (invError) {
      setError(
        invError.message.includes("policy")
          ? "Only workspace admins can add members here."
          : invError.message
      );
      return;
    }
    setPick("");
    setInviteOpen(false);
    router.refresh();
  }

  const menu: (
    | { label: string; href: string; icon: string; danger?: boolean }
    | { heading: string }
  )[] = [
    { label: "Manage members", href: `${base}/settings#members`, icon: "people" },
    { label: "Manage apps", href: `${base}/settings#apps`, icon: "tray" },
    { label: "Workspace settings", href: `${base}/settings`, icon: "gear" },
    { label: "Share in App Market", href: `${base}/market`, icon: "store" },
    { label: "Leave workspace", href: `${base}/settings#danger`, icon: "warning", danger: true },
    { label: "Delete workspace", href: `${base}/settings#danger`, icon: "trash", danger: true },
    { heading: "Go to…" },
    { label: "Workspace tasks", href: `${base}/tasks`, icon: "check-square" },
    { label: "Workspace calendar", href: "/calendar", icon: "calendar" },
    { label: "Workspace files", href: `${base}/files`, icon: "doc" },
    { label: "Relationship map", href: `${base}/map`, icon: "map" },
  ];

  return (
    <section className="relative rounded border border-podio-border bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <h1 className="text-2xl font-semibold text-podio-teal">{name}</h1>
        <span className="mt-1.5 rounded bg-podio-row-alt px-2 py-0.5 text-xs text-podio-secondary">
          {privacy}
        </span>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="Workspace admin"
          className="ml-auto text-podio-meta hover:text-podio-teal"
        >
          <PodioIcon icon="wrench" className="h-5 w-5" />
        </button>
      </div>
      {description && (
        <p className="mt-1 text-sm text-podio-secondary">{description}</p>
      )}

      {menuOpen && (
        <div className="absolute right-4 top-12 z-20 w-64 rounded-lg border border-podio-border bg-white py-1 shadow-lg">
          {menu.map((m, i) =>
            "heading" in m ? (
              <div key={i} className="bg-podio-row-alt px-4 py-1.5 text-sm text-podio-meta">
                {m.heading}
              </div>
            ) : (
              <Link
                key={i}
                href={m.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-[15px] hover:bg-podio-row-hover ${
                  m.danger ? "text-red-600" : "text-podio-ink"
                }`}
              >
                <PodioIcon icon={m.icon} className="h-5 w-5 shrink-0" />
                {m.label}
              </Link>
            )
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {members.slice(0, 12).map((m) => (
          <Avatar key={m.id} name={m.full_name} url={m.avatar_url} />
        ))}
        {members.length > 12 && (
          <span className="text-xs text-podio-meta">+{members.length - 12}</span>
        )}
        <button
          onClick={() => setInviteOpen((v) => !v)}
          className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-podio-ink hover:text-podio-teal"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-podio-ink text-sm leading-none">
            +
          </span>
          INVITE
        </button>
      </div>

      {inviteOpen && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-podio-border pt-3">
          {invitable.length === 0 ? (
            <span className="text-sm text-podio-meta">
              Everyone in the organization is already a member.
            </span>
          ) : (
            <>
              <select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="rounded border border-podio-border px-2 py-1.5 text-sm"
              >
                <option value="">— pick an organization member —</option>
                {invitable.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.full_name ?? p.user_id}
                  </option>
                ))}
              </select>
              <button
                onClick={invite}
                disabled={busy || !pick}
                className="rounded bg-podio-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50"
              >
                {busy ? "Adding…" : "Add to workspace"}
              </button>
              <Link href={`${base}/settings#members`}
                className="text-xs text-podio-teal hover:underline">
                manage members →
              </Link>
            </>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </section>
  );
}
