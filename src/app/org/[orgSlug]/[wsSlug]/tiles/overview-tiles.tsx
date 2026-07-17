import Link from "next/link";
import { PodioIcon } from "@/components/podio-icon";

// Presentational bodies for the workspace-overview dashboard tiles.
// Each component renders ONLY its inner content — the parent supplies the
// card chrome (border, padding) and the tile title. Server-component safe.

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function TasksTile({
  tasks,
  moreHref,
}: {
  tasks: { id: string; title: string; due_date: string | null }[];
  moreHref: string;
}) {
  const today = new Date(new Date().toDateString());
  const rows = tasks.slice(0, 6);
  return (
    <div>
      {rows.length === 0 ? (
        <p className="text-[13px] italic text-podio-disabled">No open tasks.</p>
      ) : (
        <ul className="divide-y divide-podio-border">
          {rows.map((task) => {
            const overdue = task.due_date !== null && new Date(task.due_date) < today;
            return (
              <li key={task.id} className="flex items-center gap-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[15px] text-podio-ink">
                  {task.title}
                </span>
                {task.due_date && (
                  <span
                    className={
                      overdue
                        ? "shrink-0 text-[12px] text-[#A33B33]"
                        : "shrink-0 text-[12px] text-podio-meta"
                    }
                  >
                    {new Date(task.due_date).toLocaleDateString()}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2">
        <Link
          href={moreHref}
          className="text-[13px] text-podio-teal hover:underline"
        >
          Open tasks
        </Link>
      </div>
    </div>
  );
}

export function CalendarTile({
  events,
}: {
  events: { id: string; title: string; when: string; href: string }[];
}) {
  const rows = events.slice(0, 6);
  if (rows.length === 0) {
    return (
      <p className="text-[13px] italic text-podio-disabled">Nothing scheduled.</p>
    );
  }
  return (
    <ul className="divide-y divide-podio-border">
      {rows.map((event) => (
        <li key={event.id} className="flex items-center gap-3 py-1.5">
          <span className="shrink-0 text-[12px] text-podio-meta">
            {new Date(event.when).toLocaleDateString()}
          </span>
          <Link
            href={event.href}
            className="min-w-0 flex-1 truncate text-[15px] text-podio-ink hover:text-podio-teal"
          >
            {event.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function FilesTile({
  files,
}: {
  files: { id: string; name: string; href: string | null; created_at: string }[];
}) {
  const rows = files.slice(0, 6);
  if (rows.length === 0) {
    return <p className="text-[13px] italic text-podio-disabled">No files yet.</p>;
  }
  return (
    <ul className="divide-y divide-podio-border">
      {rows.map((file) => (
        <li key={file.id} className="flex items-center gap-2 py-1.5">
          <PodioIcon
            icon="paperclip"
            className="h-4 w-4 shrink-0 text-podio-secondary"
          />
          {file.href ? (
            <a
              href={file.href}
              className="min-w-0 flex-1 truncate text-[15px] text-podio-teal hover:underline"
            >
              {file.name}
            </a>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[15px] text-podio-ink">
              {file.name}
            </span>
          )}
          <span className="shrink-0 text-[12px] text-podio-meta">
            {new Date(file.created_at).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ContactsTile({
  members,
}: {
  members: { user_id: string; full_name: string | null; avatar_url: string | null }[];
}) {
  const rows = members.slice(0, 8);
  if (rows.length === 0) {
    return <p className="text-[13px] italic text-podio-disabled">No members.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((member) => {
        const name = member.full_name?.trim() || "Member";
        return (
          <li key={member.user_id} className="flex items-center gap-2.5">
            {member.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.avatar_url}
                alt=""
                className="h-7 w-7 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-podio-secondary text-xs font-semibold text-white">
                {initialsOf(name)}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[15px] text-podio-ink">
              {name}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function TextTile({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words text-[15px] text-podio-ink">
      {text}
    </div>
  );
}
