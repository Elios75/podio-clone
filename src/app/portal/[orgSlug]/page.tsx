import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Public, branded client portal (Phase 14 white-label portals — docs/PORTALS.md).
// Anonymous visitors see the branded shell + a sign-in prompt; signed-in guests
// see the items shared with them via item_shares.

export default async function PortalPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  // Anon-callable RPC; returns null unless the org exists and portal_enabled.
  const { data: portal } = await supabase.rpc("portal_lookup", {
    p_slug: orgSlug,
  });
  if (!portal) notFound();
  const p = portal as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let items: any[] = [];
  if (user) {
    const { data } = await supabase.rpc("my_shared_items");
    items = (data as any) ?? [];
  }

  const accent: string = p.accent || "#15808D";

  return (
    <main className="min-h-screen bg-[#EDEDED]">
      {/* Branded header bar */}
      <header
        className="flex h-14 items-center gap-3 px-4 text-white sm:px-6"
        style={{ backgroundColor: accent }}
      >
        {p.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logo_url} alt={p.name} className="h-8" />
        ) : (
          <span className="text-lg font-semibold">{p.name}</span>
        )}
        <span className="text-[15px] font-semibold opacity-90">
          {p.portal_title}
        </span>
        {user && (
          <span className="ml-auto truncate text-sm opacity-80">
            {user.email}
          </span>
        )}
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {p.welcome && (
          <p className="text-[15px] text-[#333333]">{p.welcome}</p>
        )}

        {!user ? (
          <div className="mt-6 rounded border border-[#E3E3E3] bg-white p-6 shadow-sm">
            <p className="text-[15px] text-[#333333]">
              Sign in to see the items that have been shared with you.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              Sign in
            </Link>
          </div>
        ) : (
          <div className="mt-6 rounded border border-[#E3E3E3] bg-white shadow-sm">
            <div className="border-b border-[#E3E3E3] bg-[#F7F7F7] px-4 py-2 text-sm font-semibold text-[#333333]">
              Shared with you
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-sm italic text-[#8A9494]">
                Nothing has been shared with you yet.
              </p>
            ) : (
              <ul>
                {items.map((it: any) => (
                  <li
                    key={it.item_id}
                    className="flex items-center gap-3 border-b border-[#EFEFEF] px-4 py-2.5 last:border-b-0 hover:bg-[#ECECEC]"
                  >
                    <span className="text-xl leading-none">
                      {it.app_icon ?? "📄"}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/org/${it.org_slug}/${it.ws_slug}/${it.app_slug}/${it.item_number}`}
                        className="block truncate text-[15px] font-medium text-[#15808D] hover:underline"
                      >
                        {it.title}
                      </Link>
                      <span className="text-xs text-[#8A9494]">
                        {it.app_name} · {it.org_name}
                      </span>
                    </div>
                    <span className="ml-auto rounded bg-[#CDEDED] px-2 py-0.5 text-sm font-medium text-[#136570]">
                      {it.access}
                    </span>
                    <span className="w-20 text-right text-xs text-[#8A9494]">
                      {it.shared_at
                        ? new Date(it.shared_at).toLocaleDateString("en-US", {
                            month: "2-digit",
                            day: "2-digit",
                            year: "numeric",
                          })
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-[#B8C2C2]">
          Powered by Podio Clone
        </p>
      </div>
    </main>
  );
}
