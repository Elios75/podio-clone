import type { ReactNode } from "react";

// Podio-style monochrome line icons. Rendered inline as SVG
// (stroke currentColor) so they pick up the surrounding text color —
// typically text-podio-secondary at 24px. Unknown values (legacy emoji
// stored on existing apps) fall back to a plain <span>.
// See docs/design/podio-design-skill/SKILL.md.

// App icons offered in the app-icon picker. UI-chrome icons (search, bell,
// menu, …) live in PATHS below but are deliberately NOT listed here.
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

// Each icon is a few simple elements on a 24x24 grid, drawn for a 1.7px
// stroke with round caps/joins (Podio's slightly playful outline style).
const PATHS: Record<string, ReactNode> = {
  // ---- App icons (in PODIO_ICONS) ----------------------------------------
  // Podio's default app icon: an isometric brick.
  brick: (
    <>
      <path d="M4 8.5 12 4.5l8 4-8 4-8-4z" />
      <path d="M4 8.5v7l8 4 8-4v-7" />
      <path d="M12 12.5v7" />
    </>
  ),
  // Rounded square with a check overlapping its top-right corner.
  task: (
    <>
      <rect x="3.5" y="6.5" width="13.5" height="14" rx="2" />
      <path d="m12.5 10.5 3.3 3.3 5.7-8.8" />
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
  // Podio's wide open tray: rounded rect with a concave dip in the top edge.
  tray: (
    <path d="M16 7.5h2.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2H8a4.5 4.5 0 0 0 8 0z" />
  ),
  // Podio's Ideas icon: studded 3D box (isometric cube, cylinder stud on top).
  idea: (
    <>
      <path d="M4.5 10 12 6l7.5 4-7.5 4-7.5-4z" />
      <path d="M4.5 10v5.5l7.5 4 7.5-4V10" />
      <path d="M12 14v5.5" />
      <ellipse cx="12" cy="3.9" rx="2.3" ry="1.1" />
      <path d="M9.7 3.9v2.9a2.3 1.1 0 0 0 4.6 0V3.9" />
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

  // ---- UI-chrome icons (NOT in PODIO_ICONS / the app-icon picker) --------
  // Pulse wave.
  activity: <path d="M3.5 12.5h3.3L9.5 6l5 12 2.2-5.5h3.8" />,
  // Circle with a plus.
  add: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  // Two-person outline.
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.4" />
      <path d="M3.2 20.3c.8-3.3 3.2-5.3 5.8-5.3s5 2 5.8 5.3" />
      <path d="M15.4 5.5a3.4 3.4 0 0 1 0 6" />
      <path d="M17.6 15.4c1.8.9 3 2.6 3.4 4.9" />
    </>
  ),
  // Blank calendar with binding rings.
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15.5" rx="1.5" />
      <path d="M8 3v4M16 3v4M4 9.5h16" />
    </>
  ),
  // Square with a check.
  "check-square": (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m8.4 12.4 2.7 2.7 4.7-6" />
    </>
  ),
  // Magnifier.
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m15.7 15.7 4.8 4.8" />
    </>
  ),
  // Notification bell with clapper.
  bell: (
    <>
      <path d="M6.3 9.8a5.7 5.7 0 0 1 11.4 0c0 5 1.9 6.6 2.8 7.2H3.5c.9-.6 2.8-2.2 2.8-7.2z" />
      <path d="M10.3 20.5a1.9 1.9 0 0 0 3.4 0" />
    </>
  ),
  // Two overlapping speech bubbles.
  chat: (
    <>
      <path d="M4 16.5V5.5a2 2 0 0 1 2-2h8.5a2 2 0 0 1 2 2v5.5a2 2 0 0 1-2 2H8L4 16.5z" />
      <path d="M16.5 9h1.5a2 2 0 0 1 2 2v9.5L16.5 17H11a2 2 0 0 1-2-2v-2" />
    </>
  ),
  // Circle with a question mark.
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.4 9.3a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.2-2.6 3.8" />
      <path d="M12 16.8v.01" />
    </>
  ),
  // Hamburger.
  menu: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  paperclip: (
    <path d="m21 11.3-8.8 8.8a5.8 5.8 0 0 1-8.2-8.2L12.8 3a3.9 3.9 0 0 1 5.5 5.5l-8.7 8.7a2 2 0 0 1-2.8-2.8l8.1-8.1" />
  ),
  // Speech bubble with a question mark.
  question: (
    <>
      <path d="M4 5.8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2h-6.3L7 20.4v-4.2H6a2 2 0 0 1-2-2V5.8z" />
      <path d="M9.9 7.8a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 1.8-2.2 3.2" />
      <path d="M12.1 14.2v.01" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  pencil: (
    <>
      <path d="M17 3.4a2.6 2.6 0 0 1 3.6 3.6L7.4 20.2 3 21.4l1.2-4.4L17 3.4z" />
      <path d="m14.9 5.5 3.6 3.6" />
    </>
  ),
  // App Market storefront with a scalloped awning.
  store: (
    <>
      <path d="M3.5 8.5 5 4.5h14l1.5 4" />
      <path d="M3.5 8.5a2.13 2.13 0 0 0 4.25 0 2.13 2.13 0 0 0 4.25 0 2.13 2.13 0 0 0 4.25 0 2.13 2.13 0 0 0 4.25 0" />
      <path d="M5 11v9h14v-9" />
      <path d="M10 20v-4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20" />
    </>
  ),
  // Crossed wrench + screwdriver.
  tools: (
    <>
      <path d="M14 7.4a.8.8 0 0 0 0 1.1l1.25 1.25a.8.8 0 0 0 1.1 0l2.94-2.94a4.7 4.7 0 0 1-6.2 6.2L7.7 18.4a1.65 1.65 0 0 1-2.34-2.34l5.39-5.39a4.7 4.7 0 0 1 6.2-6.2L14 7.4z" />
      <path d="M3 5.5 5.5 3l3.3 2.3-.4 2.3-2.3.4L3 5.5z" />
      <path d="m8.7 8.6 8.4 8.4" />
      <path d="m16.4 18.3 1.9-1.9 2.7 2.7-1.9 1.9-2.7-2.7z" />
    </>
  ),
  // Close.
  x: <path d="M6 6l12 12M18 6 6 18" />,
  lock: (
    <>
      <rect x="4.8" y="10.5" width="14.4" height="10" rx="2" />
      <path d="M8.3 10.5V7.6a3.7 3.7 0 0 1 7.4 0v2.9" />
      <path d="M12 14.3v2.4" />
    </>
  ),
  // Invite: person with a plus.
  "person-plus": (
    <>
      <circle cx="9.5" cy="8" r="3.4" />
      <path d="M2.8 20.4c.9-3.4 3.5-5.5 6.7-5.5 1.8 0 3.4.7 4.6 1.9" />
      <path d="M18.5 8.2v5.6M15.7 11h5.6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
      <path d="m6 6.5.9 12.6a1.8 1.8 0 0 0 1.8 1.65h6.6a1.8 1.8 0 0 0 1.8-1.65L18 6.5" />
      <path d="M10 10.5v6.5M14 10.5v6.5" />
    </>
  ),
  warning: (
    <>
      <path d="M10.4 4.3 2.7 17.6a1.85 1.85 0 0 0 1.6 2.8h15.4a1.85 1.85 0 0 0 1.6-2.8L13.6 4.3a1.85 1.85 0 0 0-3.2 0z" />
      <path d="M12 9.3v4.6" />
      <path d="M12 17v.01" />
    </>
  ),
};

// `chain` is an alias for the existing chain-link glyph.
PATHS.chain = PATHS.link;

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
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths}
    </svg>
  );
}
