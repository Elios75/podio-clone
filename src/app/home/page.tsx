import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateOrgForm } from "./create-org-form";
import { SignOutButton } from "./sign-out-button";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ensure a profile row exists (idempotent).
  await supabase
    .from("user_profiles")
    .upsert({ user_id: user.id }, { onConflict: "user_id" });

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug)")
    .eq("user_id", user.id);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your organizations</h1>
        <SignOutButton />
      </div>
      <p className="mt-1 text-sm text-slate-500">{user.email}</p>

      <ul className="mt-6 space-y-2">
        {(memberships ?? []).map((m: any) => (
          <li key={m.organizations.id}>
            <Link
              href={`/org/${m.organizations.slug}`}
              className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-400"
            >
              <span className="font-medium">{m.organizations.name}</span>
              <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {m.role}
              </span>
            </Link>
          </li>
        ))}
        {(memberships ?? []).length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No organizations yet — create your first one below.
          </li>
        )}
      </ul>

      <div className="mt-8">
        <CreateOrgForm />
      </div>
    </main>
  );
}
