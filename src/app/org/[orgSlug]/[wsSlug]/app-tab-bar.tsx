import Link from "next/link";

// Podio app tab bar: icon-over-label tabs; the active app sits on a white
// rounded card. Shared by the workspace overview and app pages.
// See docs/design/podio-design-skill/references/layouts.md §2.
export function AppTabBar({
  orgSlug,
  wsSlug,
  apps,
  activeAppSlug,
  activityActive = false,
}: {
  orgSlug: string;
  wsSlug: string;
  apps: { id: string; name: string; slug: string; icon: string | null }[];
  activeAppSlug?: string;
  activityActive?: boolean;
}) {
  return (
    <nav className="flex items-end gap-1 overflow-x-auto bg-podio-page px-4 pt-2">
      <Link
        href={`/org/${orgSlug}/${wsSlug}`}
        className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-3 text-[13px] ${
          activityActive
            ? "bg-white text-podio-ink shadow-sm"
            : "text-podio-secondary hover:bg-[#E4E4E4]"
        }`}
      >
        <span className="text-2xl leading-none">〰️</span>
        Activity
      </Link>
      {apps.map((a) => (
        <Link
          key={a.id}
          href={`/org/${orgSlug}/${wsSlug}/${a.slug}`}
          className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-3 text-center text-[13px] ${
            a.slug === activeAppSlug
              ? "bg-white text-podio-ink shadow-sm"
              : "text-podio-secondary hover:bg-[#E4E4E4]"
          }`}
        >
          <span className="text-2xl leading-none">{a.icon ?? "📋"}</span>
          <span className="w-full truncate">{a.name}</span>
        </Link>
      ))}
      <span className="mx-2 h-10 w-px shrink-0 self-center bg-[#DADADA]" />
      <Link
        href={`/org/${orgSlug}/${wsSlug}/new-app`}
        className="flex w-20 shrink-0 flex-col items-center gap-1 px-2 py-3 text-[13px] uppercase text-podio-disabled hover:text-podio-secondary"
      >
        <span className="text-2xl leading-none">⊕</span>
        Add app
      </Link>
    </nav>
  );
}
