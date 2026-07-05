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
  { key: "camera", label: "Photos" },
  { key: "star", label: "Reviews" },
  { key: "heart", label: "Favorites" },
  { key: "flag", label: "Milestones" },
  { key: "key", label: "Access" },
  { key: "trophy", label: "Achievements" },
  { key: "truck", label: "Deliveries" },
  { key: "globe", label: "Websites" },
  { key: "folder", label: "Folders" },
  { key: "book", label: "Knowledge" },
  { key: "clock", label: "Time tracking" },
  { key: "target", label: "Goals" },
  { key: "home", label: "Properties" },
  { key: "plane", label: "Travel" },
  { key: "wallet", label: "Finance" },
  { key: "tag", label: "Tags" },
  { key: "gift", label: "Perks" },
  { key: "pin", label: "Places" },
  { key: "shield", label: "Security" },
  { key: "leaf", label: "Environment" },
  { key: "printer", label: "Printing" },
  { key: "coffee", label: "Coffee" },
  { key: "music", label: "Music" },
  { key: "image", label: "Media" },
  { key: "bug", label: "Bugs" },
  { key: "scale", label: "Legal" },
  { key: "grad-cap", label: "Education" },
  { key: "stethoscope", label: "Health" },
  { key: "hammer", label: "Construction" },
  { key: "bolt", label: "Energy" },
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
  camera: (
    <>
      <path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.6l1.5-2.5h5.8L16.4 7H19a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V8.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  star: (
    <path d="m12 3.5 2.5 5.2 5.7.7-4.2 3.9 1.1 5.7-5.1-2.8-5.1 2.8 1.1-5.7-4.2-3.9 5.7-.7L12 3.5z" />
  ),
  heart: (
    <path d="M12 20.5s-8.3-4.9-8.3-10.7a4.4 4.4 0 0 1 8.3-2 4.4 4.4 0 0 1 8.3 2c0 5.8-8.3 10.7-8.3 10.7z" />
  ),
  // Wavy banner on a pole.
  flag: (
    <>
      <path d="M5.5 21V3.5" />
      <path d="M5.5 4.8c2.3-1.3 4.7-1.3 7 0s4.7 1.3 7 0v9.5c-2.3 1.3-4.7 1.3-7 0s-4.7-1.3-7 0" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="16.5" r="4" />
      <path d="m10.3 13.7 9.2-9.2" />
      <path d="m16.5 7.5 3 3M13.8 10.2l2.2 2.2" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 3.5h8V10a4 4 0 0 1-8 0V3.5z" />
      <path d="M8 5H4.5v1a3.5 3.5 0 0 0 3.5 3.5M16 5h3.5v1a3.5 3.5 0 0 1-3.5 3.5" />
      <path d="M12 14v4" />
      <path d="M8.5 20.5h7" />
    </>
  ),
  truck: (
    <>
      <path d="M2.5 6.5h12V16h-12z" />
      <path d="M14.5 10h3.6l3.4 3.4V16h-7" />
      <circle cx="7" cy="17.8" r="1.8" />
      <circle cx="17.3" cy="17.8" r="1.8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <ellipse cx="12" cy="12" rx="4" ry="8.5" />
    </>
  ),
  folder: (
    <path d="M3.5 6a1.5 1.5 0 0 1 1.5-1.5h4.3L11.5 7H19A1.5 1.5 0 0 1 20.5 8.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6z" />
  ),
  // Open book with a center crease.
  book: (
    <>
      <path d="M12 6.5C10.2 5 7.5 4.5 4 5v13.5c3.5-.5 6.2 0 8 1.5 1.8-1.5 4.5-2 8-1.5V5c-3.5-.5-6.2 0-8 1.5z" />
      <path d="M12 6.5V20" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  // Bullseye.
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  home: (
    <>
      <path d="M4 10.5 12 3.5l8 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  // Paper plane.
  plane: (
    <>
      <path d="M21 3.5 10.5 14" />
      <path d="M21 3.5 14.3 20.5l-3.8-6.5-6.5-3.8L21 3.5z" />
    </>
  ),
  // Billfold with a clasp dot.
  wallet: (
    <>
      <path d="M18.5 8V6.5A1.5 1.5 0 0 0 17 5H5.5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-13" />
      <path d="M16.5 13.5v.01" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 3.5H11l9.5 9.5a1.5 1.5 0 0 1 0 2.1L15.1 20.5a1.5 1.5 0 0 1-2.1 0L3.5 11V3.5z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  // Wrapped box with a ribbon bow.
  gift: (
    <>
      <path d="M4.5 11.5h15v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8z" />
      <path d="M3.5 7.5h17v4h-17z" />
      <path d="M12 7.5v13" />
      <path d="M12 7.5c-4 0-5-1.5-4.2-3 .8-1.4 3.2-.8 4.2 3 1-3.8 3.4-4.4 4.2-3 .8 1.5-.2 3-4.2 3z" />
    </>
  ),
  // Map marker.
  pin: (
    <>
      <path d="M12 21.5s-7-6.6-7-11.5a7 7 0 0 1 14 0c0 4.9-7 11.5-7 11.5z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.5 4.5 5.5v6.2c0 4.7 3.2 7.8 7.5 9.8 4.3-2 7.5-5.1 7.5-9.8V5.5L12 2.5z" />
      <path d="m9 11.5 2.2 2.2 3.8-4.7" />
    </>
  ),
  // Leaf blade with a stem vein.
  leaf: (
    <>
      <path d="M20 4c.5 9.5-4 16-12.5 16C5.5 14 9.5 6 20 4z" />
      <path d="M4 20c2.5-6.5 7-11 12-13" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V3.5h10V8" />
      <rect x="3.5" y="8" width="17" height="8.5" rx="1.5" />
      <path d="M7 13.5h10v7H7z" />
    </>
  ),
  // Mug with a handle and steam.
  coffee: (
    <>
      <path d="M4.5 9.5h12V16a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9.5z" />
      <path d="M16.5 10.5H18a2.5 2.5 0 0 1 0 5h-1.5" />
      <path d="M8 3.5V6M12 3.5V6" />
    </>
  ),
  // Beamed eighth notes.
  music: (
    <>
      <circle cx="7" cy="17.5" r="2.5" />
      <circle cx="17" cy="15.5" r="2.5" />
      <path d="M9.5 17.5V6.5l10-2.5v11.5" />
    </>
  ),
  // Picture frame: sun over mountains.
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <circle cx="9" cy="9.5" r="1.6" />
      <path d="m4 17 4.5-4.5 3.5 3 4-4.5 4.5 5" />
    </>
  ),
  // Beetle: body, antennae, legs.
  bug: (
    <>
      <path d="M12 20a5 5 0 0 0 5-5v-3a5 5 0 0 0-10 0v3a5 5 0 0 0 5 5z" />
      <path d="m9.5 7.5-2-2.5M14.5 7.5l2-2.5" />
      <path d="M7 12H3.5M7 15.5l-2.5 2M17 12h3.5M17 15.5l2.5 2" />
    </>
  ),
  // Scales of justice.
  scale: (
    <>
      <path d="M12 3.5v17M8.5 20.5h7" />
      <path d="M5.5 6.5h13" />
      <path d="M2.5 13a3 3 0 0 0 6 0L5.5 6.5 2.5 13zM15.5 13a3 3 0 0 0 6 0l-3-6.5-3 6.5z" />
    </>
  ),
  // Mortarboard with a hanging tassel.
  "grad-cap": (
    <>
      <path d="m2.5 9 9.5-4.5L21.5 9 12 13.5 2.5 9z" />
      <path d="M6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11" />
      <path d="M21.5 9v5" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M4.8 3.5H4A1.5 1.5 0 0 0 2.5 5v5a5.5 5.5 0 0 0 11 0V5A1.5 1.5 0 0 0 12 3.5h-.8" />
      <path d="M8 15.5v1a5 5 0 0 0 10 0v-3" />
      <circle cx="18" cy="11" r="2.5" />
    </>
  ),
  // Angled head with a rounded handle.
  hammer: (
    <>
      <path d="M9.5 7 13.5 3 21 10.5l-4 4L9.5 7z" />
      <path d="M14 11.5 7 18.5a1.6 1.6 0 0 1-2.25-2.25l7-7" />
    </>
  ),
  // Lightning strike.
  bolt: (
    <path d="m13 2.5-8.5 11h6L9.5 21.5 18 10.5h-6l1-8z" />
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
  // Filter funnel: wide triangle narrowing to a folded stem.
  funnel: (
    <path d="M3.5 5h17l-6.7 7.6v5.9l-3.6-2.2v-3.7L3.5 5z" />
  ),
  // Sort: two opposing vertical arrows.
  sort: (
    <>
      <path d="M8 19.5v-15M4.5 8 8 4.5 11.5 8" />
      <path d="M16 4.5v15M12.5 16l3.5 3.5L19.5 16" />
    </>
  ),
  // 2x2 squares (layout toggle).
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  // Expand: two diagonal arrows pointing out.
  expand: (
    <>
      <path d="M14 4.5h5.5V10M19.5 4.5l-6 6" />
      <path d="M10 19.5H4.5V14M4.5 19.5l6-6" />
    </>
  ),
  // Share out: box with an arrow leaving through the top-right.
  "share-out": (
    <>
      <path d="M19.5 13v5.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2H11" />
      <path d="M15 3.5h5.5V9M20.5 3.5l-9 9" />
    </>
  ),
};

// `chain` is an alias for the existing chain-link glyph.
PATHS.chain = PATHS.link;

// Existing apps (and AI-generated definitions) store emoji in apps.icon.
// Map the common ones to line-icon keys so EVERY app renders in the Podio
// icon family; anything unmapped falls back to the default brick — never a
// colorful emoji.
const EMOJI_TO_KEY: Record<string, string> = {
  "📋": "task", "✅": "task", "☑": "task", "✔": "task", "📝": "doc",
  "📄": "doc", "📃": "doc", "📑": "doc", "🗒": "doc",
  "🚀": "rocket", "💡": "idea", "📦": "brick", "🧱": "brick",
  "🔗": "link", "👤": "contact", "👥": "people", "🧑‍💼": "contact",
  "🤝": "contact", "📅": "meeting", "🗓": "meeting", "📆": "meeting",
  "🎉": "event", "⭐": "event", "📊": "chart", "📈": "chart",
  "📉": "chart", "⚙": "gear", "🔧": "wrench", "🛠": "tools",
  "📞": "phone", "☎": "phone", "📱": "phone", "✉": "mail",
  "📧": "mail", "📨": "mail", "🗺": "map", "📍": "map", "🏠": "map",
  "🏢": "map", "🛒": "cart", "💰": "cart", "💵": "cart",
  "🗂": "tray", "📁": "tray", "📂": "tray", "🏪": "store",
  "🧑‍🎓": "contact", "🏫": "map", "🎓": "contact",
};

function normalizeEmoji(s: string): string {
  // Strip variation selectors (️) and zero-width joiners' leftovers so
  // "✉️" and "✉" both match.
  return s.replace(/️/g, "").trim();
}

// Emoji that were historical *defaults* (every app got 📋/✅), so they carry
// no signal — for these, the app NAME is a better source of an icon.
const GENERIC_EMOJI = new Set(["📋", "✅", "☑", "✔", "📦", "🧱", "📝"]);

// Infer an icon from what the app is called ("Customers" → contact,
// "Municipalities" → map). First match wins.
const NAME_HINTS: [RegExp, string][] = [
  [/task|todo|to-?do|checklist|action/i, "task"],
  [/customer|client|compan|account|vendor|supplier|crm/i, "contact"],
  [/people|member|candidate|employee|staff|contact|student/i, "contact"],
  [/project|launch|onboard|sprint/i, "rocket"],
  [/meeting|appointment|agenda/i, "meeting"],
  [/idea|innovation|brainstorm/i, "idea"],
  [/link|url|bookmark/i, "link"],
  [/event|calendar|schedule/i, "event"],
  [/report|chart|metric|analytic|dashboard|kpi/i, "chart"],
  [/setting|config/i, "gear"],
  [/call|phone/i, "phone"],
  [/mail|email|inbox/i, "mail"],
  [/photo|image|media/i, "image"],
  [/school|class|course|training/i, "grad-cap"],
  [/health|patient|clinic/i, "stethoscope"],
  [/delivery|shipping|fleet/i, "truck"],
  [/legal|contract/i, "scale"],
  [/goal|okr/i, "target"],
  [/time|hour/i, "clock"],
  [/municipal|location|city|district|site|address|map|region|territor|propert/i, "map"],
  [/order|cart|deal|sale|purchase|invoice|expense|budget|payment|quote/i, "cart"],
  [/file|librar|document|doc|proof|import|record|archive|asset/i, "doc"],
];

// Last resort: a stable hash of the name picks from a varied pool, so two
// unrelated apps still get different icons instead of twin bricks.
const HASH_POOL = [
  "brick", "rocket", "doc", "chart", "tray", "idea", "event",
  "cart", "map", "phone", "mail", "contact", "meeting", "link",
];
function hashPick(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return HASH_POOL[Math.abs(h) % HASH_POOL.length];
}

export function isPodioIconKey(icon: string | null): boolean {
  return icon !== null && icon in PATHS;
}

export function PodioIcon({
  icon,
  name,
  className,
}: {
  icon: string | null;
  name?: string | null; // the app's name, used to differentiate generic icons
  className?: string;
}) {
  // Resolution order: explicit icon key → distinctive emoji mapping →
  // name inference → generic emoji mapping → name hash → default brick.
  let key: string | undefined = icon ?? undefined;
  if (key && !PATHS[key]) {
    const norm = normalizeEmoji(key);
    const generic = GENERIC_EMOJI.has(key) || GENERIC_EMOJI.has(norm);
    key = generic ? undefined : EMOJI_TO_KEY[key] ?? EMOJI_TO_KEY[norm];
  }
  if (!key && name) {
    key = NAME_HINTS.find(([re]) => re.test(name))?.[1];
  }
  if (!key && icon) {
    const norm = normalizeEmoji(icon);
    key = EMOJI_TO_KEY[icon] ?? EMOJI_TO_KEY[norm];
  }
  if (!key && name) key = hashPick(name);
  key = key ?? "brick";
  const paths = PATHS[key] ?? PATHS.brick;
  if (!paths) {
    // Unreachable in practice (brick always exists) — kept as a safety net.
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
