import Link from "next/link";
import { PodioIcon } from "@/components/podio-icon";
import { NotificationsBell } from "@/components/notifications-bell";
import { ChatLauncher } from "@/components/chat-launcher";
import { GlobalSearch } from "@/components/global-search";

// The one grey-teal global bar (desktop + mobile variants), extracted
// verbatim from the org layout so standalone pages (/tasks, /calendar,
// /search) keep the SAME chrome — the global bar never disappears.
//
// `left` is the leading slot: the org's ☰ workspace drawer, or on standalone
// pages a ☰ "Choose a workspace or app" link. `activeTool` puts that tool's
// icon on a small white rounded card (Podio's active-tool highlight); when
// omitted the markup is identical to the original org-layout bar.
//
// The RIGHT cluster matches real Podio (design skill layouts.md §1):
// help "?" · search · round avatar · bell with red dot + yellow count pill ·
// chat launcher (presence slide-over, §13). Call sites server-fetch the
// user's profile + unread notification count and pass them down; without a
// `user` the cluster degrades to the old plain bell link.
export type GlobalBarTool = "search" | "calendar" | "messages" | "tasks";

export type GlobalBarUser = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
};

function avatarInitials(name: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function GlobalBar({
  left,
  activeTool,
  user,
  initialUnread = 0,
}: {
  left: React.ReactNode;
  activeTool?: GlobalBarTool;
  user?: GlobalBarUser;
  initialUnread?: number;
}) {
  const tool = (t: GlobalBarTool) =>
    activeTool === t
      ? "rounded bg-white p-1.5 text-podio-ink shadow-sm"
      : "hover:opacity-80";
  const mobileTool = (t: GlobalBarTool) =>
    activeTool === t
      ? "rounded bg-white p-1 text-podio-ink shadow-sm"
      : undefined;

  return (
    <>
      {/* Global top bar (desktop) */}
      <header className="hidden h-14 items-center gap-4 bg-podio-chrome px-4 text-podio-ink md:flex">
        {left}
        <nav className="ml-6 flex items-center gap-5 text-[#4E5E5E]">
          <Link href="/search" title="Search" className={tool("search")}>
            <PodioIcon icon="search" className="h-5 w-5" />
          </Link>
          <Link href="/calendar" title="My calendar" className={tool("calendar")}>
            <PodioIcon icon="calendar" className="h-5 w-5" />
          </Link>
          <Link href="/messages" title="Messages" className={tool("messages")}>
            <PodioIcon icon="chat" className="h-5 w-5" />
          </Link>
          <Link href="/tasks" title="My tasks" className={tool("tasks")}>
            <PodioIcon icon="check-square" className="h-5 w-5" />
          </Link>
        </nav>
        <div className="mx-auto font-semibold tracking-wide">Podio Clone</div>
        {/* Right cluster, Podio order: ? · search · avatar · bell+pill · chat */}
        <div className="flex items-center gap-4">
          <Link href="/home" title="Help" className="hover:opacity-80">
            <PodioIcon icon="help" className="h-5 w-5" />
          </Link>
          {/* Inline expanding search — stays on the page, scoped to the
              current app (real Podio behavior); /search stays reachable
              via the dropdown's "Search everywhere" link. */}
          <GlobalSearch />
          {user && (
            <Link
              href="/home"
              title={user.name ?? "Profile"}
              className="hover:opacity-80"
            >
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-podio-secondary text-xs font-semibold text-white">
                  {avatarInitials(user.name)}
                </span>
              )}
            </Link>
          )}
          {user ? (
            <NotificationsBell userId={user.id} initialUnread={initialUnread} />
          ) : (
            <Link
              href="/notifications"
              title="Notifications"
              className="hover:opacity-80"
            >
              <PodioIcon icon="bell" className="h-5 w-5" />
            </Link>
          )}
          {user && <ChatLauncher userId={user.id} />}
        </div>
      </header>

      {/* Mobile top bar: same left slot, compact icons */}
      <div className="flex items-center gap-3 bg-podio-chrome px-4 py-3 text-podio-ink md:hidden">
        {left}
        <span className="ml-auto flex items-center gap-3 text-sm">
          <Link href="/search" title="Search" className={mobileTool("search")}>
            <PodioIcon icon="search" className="h-5 w-5" />
          </Link>
          <Link href="/messages" title="Messages" className={mobileTool("messages")}>
            <PodioIcon icon="chat" className="h-5 w-5" />
          </Link>
          <Link href="/tasks" title="My tasks" className={mobileTool("tasks")}>
            <PodioIcon icon="check-square" className="h-5 w-5" />
          </Link>
          <Link href="/notifications" title="Notifications">
            <PodioIcon icon="bell" className="h-5 w-5" />
          </Link>
        </span>
      </div>
    </>
  );
}
