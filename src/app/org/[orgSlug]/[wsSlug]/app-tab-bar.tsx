import Link from "next/link";
import { PodioIcon } from "@/components/podio-icon";
import { AddAppChooser } from "./add-app-chooser";

// Podio app tab bar: icon-over-label tabs; the active app sits on a white
// rounded card. Compact per current Podio: short bar, ~20px icons, tight
// vertical padding. Shared by the workspace overview and app pages.
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
    <nav className="flex items-end gap-0.5 overflow-x-auto bg-podio-page px-4 pt-1.5">
      <Link
        href={`/org/${orgSlug}/${wsSlug}`}
        className={`flex w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-md px-2 pb-2 pt-2 text-xs ${
          activityActive
            ? "bg-white text-podio-ink shadow-sm"
            : "text-[#4E5E5E] hover:bg-[#E4E4E4]"
        }`}
      >
        <PodioIcon icon="activity" className="h-5 w-5" />
        Activity
      </Link>
      {apps.map((a) => (
        <Link
          key={a.id}
          href={`/org/${orgSlug}/${wsSlug}/${a.slug}`}
          className={`flex w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-md px-2 pb-2 pt-2 text-center text-xs ${
            a.slug === activeAppSlug
              ? "bg-white text-podio-ink shadow-sm"
              : "text-[#4E5E5E] hover:bg-[#E4E4E4]"
          }`}
        >
          <PodioIcon icon={a.icon} name={a.name} className="h-5 w-5" />
          <span className="w-full truncate">{a.name}</span>
        </Link>
      ))}
      <span className="mx-2 h-8 w-px shrink-0 self-center bg-[#DADADA]" />
      <AddAppChooser orgSlug={orgSlug} wsSlug={wsSlug} />
    </nav>
  );
}
