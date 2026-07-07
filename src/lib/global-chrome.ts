import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { GlobalBarUser } from "@/components/global-bar";
import type { PickerOrg } from "@/components/org-picker-drawer";

// Shared server helper for standalone pages (/search, /calendar, /messages,
// /notifications, …): the global chrome NEVER disappears (design skill
// layouts.md §1), so every standalone page needs the same three fetches —
// the ☰ OrgPickerDrawer's org/workspace tree, the signed-in profile for the
// bar's right cluster, and the unread-notification count for the bell.
// Extracted verbatim from the /home and /tasks reference implementations.
//
// Returns null when signed out so callers keep the auth redirect as their
// very first step:
//
//   const chrome = await getGlobalChrome();
//   if (!chrome) redirect("/login");
//   const { supabase, user } = chrome;
//   …
//   <GlobalBar left={<OrgPickerDrawer orgs={chrome.pickerOrgs} />}
//              activeTool="…" user={chrome.barUser}
//              initialUnread={chrome.unread} />
export type GlobalChrome = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  barUser: GlobalBarUser;
  unread: number;
  pickerOrgs: PickerOrg[];
};

export async function getGlobalChrome(): Promise<GlobalChrome | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Org memberships + each org's non-archived workspaces feed the ☰
  // cross-org picker drawer (same query pattern as the org layout).
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug)")
    .eq("user_id", user.id);

  const orgIds = (memberships ?? [])
    .map((m: any) => m.organizations?.id)
    .filter(Boolean);
  const { data: orgWorkspaces } = orgIds.length
    ? await supabase
        .from("workspaces")
        .select("id, name, slug, organization_id, is_archived")
        .in("organization_id", orgIds)
        .eq("is_archived", false)
        .order("name")
    : { data: [] as any[] };

  const pickerOrgs: PickerOrg[] = (memberships ?? [])
    .filter((m: any) => m.organizations)
    .map((m: any) => ({
      id: m.organizations.id as string,
      name: m.organizations.name as string,
      slug: m.organizations.slug as string,
      role: m.role as string,
      workspaces: (orgWorkspaces ?? [])
        .filter((ws: any) => ws.organization_id === m.organizations.id)
        .map((ws: any) => ({
          id: ws.id as string,
          name: ws.name as string,
          slug: ws.slug as string,
        })),
    }));

  // Global-bar right cluster: profile (avatar) + unread notification count.
  const { data: myProfile } = await supabase
    .from("user_profiles")
    .select("full_name, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return {
    supabase,
    user,
    barUser: {
      id: user.id,
      name: myProfile?.full_name ?? user.email ?? null,
      avatarUrl: myProfile?.avatar_url ?? null,
    },
    unread: unread ?? 0,
    pickerOrgs,
  };
}
