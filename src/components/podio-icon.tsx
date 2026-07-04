import type { ReactNode } from "react";

// Podio-style monochrome line icons for apps. Rendered inline as SVG
// (stroke currentColor) so they pick up the surrounding text color —
// typically text-podio-secondary at 24px. Unknown values (legacy emoji
// stored on existing apps) fall back to a plain <span>.
// See docs/design/podio-design-skill/SKILL.md.

export const PODIO_ICONS: { key: string; label: string }[] = [
  { key: "brick", label: "Brick (default)" },
  { key: "task", label: "Tasks" },
  { key: "rocket", label: "Projects" },
  { key: "meeting", label: "Meetings" },
  { key: "tray", label: "Files" },
  { key: "idea", label: "Ideas" },
  { key: "link", label: "Links" },
  { key: "contact", label: "Contacts" },
  { key: "event", label: "Events" },
  { key: "doc", label: "Documents" },
  { key: "chart", label: "Reports" },
  { key: "gear", label: "Settings" },
  { key: "phone", label: "Calls" },
  { key: "mail", label: "Email" },
  { key: "map", label: "Locations" },
  { key: "cart", label: "Orders" },
];

// Each icon is 2-4 simple elements on a 24x24 grid, drawn for a 1.6px stroke.
const PATHS: Record<string, ReactNode> = {
  // Podio's default app icon: an isometric brick.
  brick: (
    <>
      <path d="M4 8.5 12 4.5l8 4-8 4-8-4z" />
      <path d="M4 8.5v7l8 4 8-4v-7" />
      <path d="M12 12.5v7" />
    </>
  ),
  // Clipboard with a check.
  task: (
    <>
      <rect x="4.5" y="4" width="15" height="17.5" rx="1.5" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
      <path d="m8.7 13.4 2.4 2.4 4.4-5" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2.5c3.2 2.2 4.6 6 3.4 10.3L12 15.5l-3.4-2.7C7.4 8.5 8.8 4.7 12 2.5z" />
      <circle cx="12" cy="8.5" r="1.7" />
      <path d="M8.6 12.8 6 16.2l3.2.3M15.4 12.8 18 16.2l-3.2.3" />
      <path d="M12 16v4.5" />
    </>
  ),
  // Calendar showing the 17th.
  meeting: (
    <>
      <rect x="4" y="5" width="16" height="15.5" rx="1.5" />
      <path d="M8 3v4M16 3v4M4 9.5h16" />
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fontFamily="inherit"
        fill="currentColor"
        stroke="none"
      >
        17
      </text>
    </>
  ),
  // Inbox tray (files library).
  tray: (
    <>
      <path d="M4 13.5 6.3 6h11.4L20 13.5V19H4v-5.5z" />
      <path d="M4 13.5h4.8a3.2 3.2 0 0 0 6.4 0H20" />
    </>
  ),
  // Lightbulb.
  idea: (
    <>
      <path d="M8.5 13.6a5 5 0 1 1 7 0c-.8.8-1.3 1.5-1.5 2.9h-4c-.2-1.4-.7-2.1-1.5-2.9z" />
      <path d="M10 19.5h4" />
      <path d="M10.8 22h2.4" />
    </>
  ),
  // Chain link.
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l2.5-2.5a5 5 0 0 0-7.07-7.07L11.55 5.4" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-2.5 2.5a5 5 0 0 0 7.07 7.07l1.42-1.43" />
    </>
  ),
  contact: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20.5c.9-3.6 3.7-5.7 7.2-5.7s6.3 2.1 7.2 5.7" />
    </>
  ),
  // Calendar with a star.
  event: (
    <>
      <rect x="4" y="5" width="16" height="15.5" rx="1.5" />
      <path d="M8 3v4M16 3v4M4 9.5h16" />
      <path d="M12 11.6l1 2 2.2.3-1.6 1.55.4 2.2-2-1.05-2 1.05.4-2.2-1.6-1.55 2.2-.3 1-2z" />
    </>
  ),
  doc: (
    <>
      <path d="M6.5 2.5H14L18.5 7v14.5h-12V2.5z" />
      <path d="M14 2.5V7h4.5" />
      <path d="M9 12.5h6M9 16h6" />
    </>
  ),
  // Bar chart.
  chart: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M7 20.5v-6M12 20.5V9M17 20.5v-9" />
    </>
  ),
  // Cog: hub + spokes + rim.
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </>
  ),
  phone: (
    <>
      <path d="M21.5 16.9v2.6a1.8 1.8 0 0 1-2 1.8 18 18 0 0 1-7.85-2.8 17.7 17.7 0 0 1-5.45-5.45A18 18 0 0 1 3.4 5.2a1.8 1.8 0 0 1 1.8-2h2.6a1.8 1.8 0 0 1 1.8 1.55c.11.86.32 1.7.62 2.5a1.8 1.8 0 0 1-.4 1.9L8.7 10.27a14.4 14.4 0 0 0 5.45 5.45l1.12-1.12a1.8 1.8 0 0 1 1.9-.4c.8.3 1.64.5 2.5.62a1.8 1.8 0 0 1 1.83 2.08z" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  // Folded map.
  map: (
    <>
      <path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2v-13z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  cart: (
    <>
      <circle cx="9.5" cy="19.5" r="1.4" />
      <circle cx="16.5" cy="19.5" r="1.4" />
      <path d="M3.5 4.5H6l2.2 10h9.6l2.2-7H7" />
    </>
  ),
};

export function isPodioIconKey(icon: string | null): boolean {
  return icon !== null && icon in PATHS;
}

export function PodioIcon({
  icon,
  className,
}: {
  icon: string | null;
  className?: string;
}) {
  // null = app never chose an icon; Podio shows the default brick.
  const key = icon ?? "brick";
  const paths = PATHS[key];
  if (!paths) {
    // Legacy emoji-valued icons keep rendering as text.
    return <span className={className}>{icon}</span>;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths}
    </svg>
  );
}
