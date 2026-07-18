import { redirect } from "next/navigation";
import { GlobalBar } from "@/components/global-bar";
import { OrgPickerDrawer } from "@/components/org-picker-drawer";
import { getGlobalChrome } from "@/lib/global-chrome";
import { AccountForm } from "./account-form";

// "Account settings" from the avatar menu: email + password. Profile name
// and photo live on /profile. Chrome never disappears.
export default async function AccountPage() {
  const chrome = await getGlobalChrome();
  if (!chrome) redirect("/login");
  const { supabase } = chrome;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col bg-podio-page">
      <GlobalBar
        left={<OrgPickerDrawer orgs={chrome.pickerOrgs} />}
        user={chrome.barUser}
        initialUnread={chrome.unread}
      />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold text-podio-ink">Account settings</h1>
        <p className="mt-1 text-sm text-podio-secondary">
          Sign-in email and password. Your name and photo live in My profile.
        </p>
        <div className="mt-5 rounded border border-podio-border bg-white p-5 shadow-sm">
          <AccountForm email={user.email ?? ""} />
        </div>
      </main>
    </div>
  );
}
