import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MarkAllRead } from "./mark-all-read";
import { NotificationPrefs } from "./notification-prefs";
import { PushToggle } from "./push-toggle";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("notification_prefs")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, event_type, target_type, target_id, actor_id, payload, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const actorIds = [...new Set((notifications ?? []).map((n) => n.actor_id).filter(Boolean))];
  const { data: profiles } = actorIds.length
    ? await supabase.from("user_profiles").select("user_id, full_name").in("user_id", actorIds)
    : { data: [] as any[] };
  const nameByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));

  const unread = (notifications ?? []).filter((n) => !n.read_at).length;

  const label = (t: string) =>
    t === "mentioned" ? "mentioned you on" : t === "comment_added" ? "commented on" : t;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-podio-ink">
          Notifications{unread > 0 && (
            <span className="ml-2 rounded bg-podio-teal px-2 py-0.5 text-sm font-medium text-white">
              {unread}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-3">
          <PushToggle />
          {unread > 0 && <MarkAllRead />}
          <Link href="/home" className="text-sm text-podio-teal hover:underline">
            ← Home
          </Link>
        </div>
      </div>

      <ul className="mt-6 space-y-2">
        {(notifications ?? []).map((n) => (
          <li
            key={n.id}
            className="flex items-start gap-3 rounded border border-podio-border bg-white p-3 text-sm hover:bg-podio-row-hover"
          >
            {!n.read_at && (
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-podio-teal" />
            )}
            <div className="min-w-0">
              <p className="text-podio-ink">
                <span className="font-medium">
                  {n.actor_id ? nameByUser.get(n.actor_id) ?? "Someone" : "Someone"}
                </span>{" "}
                {label(n.event_type)}{" "}
                <span className="font-medium">
                  {n.payload?.item_title ?? "an item"}
                </span>
              </p>
              {n.payload?.preview && (
                <p className="mt-1 text-podio-secondary">“{n.payload.preview}”</p>
              )}
              <p className="mt-1 text-xs text-podio-meta">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </div>
          </li>
        ))}
        {(notifications ?? []).length === 0 && (
          <li className="rounded border border-dashed border-podio-border bg-white p-8 text-center text-sm text-podio-meta">
            Nothing yet — you'll see mentions and comments on items you follow here.
          </li>
        )}
      </ul>

      <NotificationPrefs
        userId={user.id}
        prefs={(profile?.notification_prefs as Record<string, any>) ?? {}}
      />
    </main>
  );
}
