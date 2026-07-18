import { redirect } from "next/navigation";
import { GlobalBar } from "@/components/global-bar";
import { OrgPickerDrawer } from "@/components/org-picker-drawer";
import { getGlobalChrome } from "@/lib/global-chrome";
import { ProfileForm } from "./profile-form";

// "My profile" from the avatar menu: display name + profile photo. The
// global chrome NEVER disappears (same pattern as /search).
export default async function ProfilePage() {
  const chrome = await getGlobalChrome();
  if (!chrome) redirect("/login");
  const { supabase } = chrome;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col bg-podio-page">
      <GlobalBar
        left={<OrgPickerDrawer orgs={chrome.pickerOrgs} />}
        user={chrome.barUser}
        initialUnread={chrome.unread}
      />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold text-podio-ink">My profile</h1>
        <p className="mt-1 text-sm text-podio-secondary">
          Your name and photo appear on activity, comments and member lists.
        </p>
        <div className="mt-5 rounded border border-podio-border bg-white p-5 shadow-sm">
          <ProfileForm
            userId={user.id}
            email={user.email ?? ""}
            initialName={profile?.full_name ?? ""}
            initialAvatarUrl={profile?.avatar_url ?? null}
          />
        </div>
      </main>
    </div>
  );
}
