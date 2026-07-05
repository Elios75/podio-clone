# Podio design tokens

Extracted from the four reference screenshots (Progress Podio, 2026). Hex
values are close estimates; keep them consistent across the app rather than
re-sampling per page.

## Color

### Chrome & surfaces

| Token | Hex | Tailwind | Used for |
|---|---|---|---|
| chrome | `#CBDBDB` | `bg-[#CBDBDB]` | Global top bar |
| page | `#EDEDED` | `bg-[#EDEDED]` | Body background behind panels |
| panel | `#FFFFFF` | `bg-white` | Cards, left pane, tables, tab bar cards |
| border | `#E3E3E3` | `border-[#E3E3E3]` | Panel & table borders, dividers |
| row-alt | `#F7F7F7` | `bg-[#F7F7F7]` | Table header row, card excerpt blocks |
| row-hover | `#ECECEC` | `bg-[#ECECEC]` | Active view row, hovered table row |

### Accent

| Token | Hex | Tailwind | Used for |
|---|---|---|---|
| teal | `#15808D` | `bg-[#15808D]` / `text-[#15808D]` | Primary buttons, links, app titles, active nav |
| teal-hover | `#0F6D79` | `hover:bg-[#0F6D79]` | Button hover |
| orange-active | `#F7A11C` | `bg-[#F7A11C]` | Active view-mode pill ("Sheet"), notification count badge (yellow `#F5D327` variant) |
| alert-red | `#E5484D` | — | Notification dot only |

### Text

| Token | Hex | Tailwind |
|---|---|---|
| ink | `#333333` | `text-[#333333]` |
| secondary | `#6E7A7A` | `text-[#6E7A7A]` |
| meta | `#8A9494` | `text-[#8A9494]` |
| disabled | `#B8C2C2` | `text-[#B8C2C2]` (e.g. "ADD APP", "Priority not set") |

## Chip system (category/status values)

Two tiers. **Pastel chips** are the default for statuses: pastel background,
dark saturated text, `rounded px-2 py-0.5 text-sm font-medium`, no border.
**Solid chips** are for urgency-type options: saturated background, white or
near-black text.

| Meaning family | BG | Text | Example from screenshots |
|---|---|---|---|
| Positive / done | `#D9F2E5` | `#1C7A4D` | "In Process" (green) |
| Complete / neutral-done | `#DCD3F2` | `#4A3A78` | "Completed", "Yes" |
| In progress / warning | `#F5EFC8` | `#7A6A1C` | "In-Process" (yellow) |
| Attention / negative | `#F9D7D4` | `#A33B33` | "No" (red pastel) |
| Info | `#CFE8F7` | `#2B6A8F` | "No" (blue variant) |
| Accent teal | `#CDEDED` | `#136570` | "Submitted for Review" |
| Purple label | `#DCC8F5` | `#5B3A8E` | "Admin Related" |
| Peach | `#FBE3C9` | `#9A5B1F` | "Yes" (uploaded) |
| **Solid orange** | `#F7941D` | `#3A2A00` | "High" |
| **Solid salmon/red** | `#F97F70` | `#4A1410` | "Urgent", "New School Setup" |

Assign chip colors deterministically from the option's position or a stored
color, so the same option is always the same color everywhere it appears.

## Typography

Podio uses a humanist sans (Source Sans Pro family). In the clone:

```css
font-family: "Source Sans 3", "Source Sans Pro", "Segoe UI", system-ui, sans-serif;
```

- Base size 15–16px; tables and chips 14px; meta 12–13px.
- Weights: 400 body, 600 headings/titles/buttons. Nothing bolder.
- App titles and section headings in the left pane: 20–22px, 600, teal
  (`text-[#15808D]`) for app names; ink for "Views".
- Tab labels in the app bar: 13px, secondary color, `tracking-normal` —
  "ADD APP" style items uppercase and disabled-grey.

## Iconography

Podio's icons are **monochrome outline glyphs**, never colorful emoji. The
set is **custom-drawn**: Podio ships its own proprietary icon font, and no
public library matches its slightly playful geometry, so the clone draws each
glyph by hand in `PodioIcon` (`src/components/podio-icon.tsx`): inline 24px
SVGs (24x24 grid), `stroke: currentColor`, **strokeWidth 1.7**, `fill: none`,
round caps and joins — colored by the text color of their context (usually
`text-podio-secondary`).

Two tiers share the same `PATHS` map:

- **App icons** (offered in the app-icon picker via `PODIO_ICONS`, ~46 keys):
  the original core set — `brick`, `task`, `rocket`, `meeting`, `tray`,
  `idea`, `link`, `contact`, `event`, `doc`, `chart`, `gear`, `phone`,
  `mail`, `map`, `cart` — plus the expansion set: `camera`, `star`, `heart`,
  `flag`, `key`, `trophy`, `truck`, `globe`, `folder`, `book`, `clock`,
  `target`, `home`, `plane`, `wallet`, `tag`, `gift`, `pin`, `shield`,
  `leaf`, `printer`, `coffee`, `music`, `image`, `bug`, `scale`, `grad-cap`,
  `stethoscope`, `hammer`, `bolt`. The default app icon is the brick; `task`
  is a rounded square with a check overlapping its top-right corner; `idea`
  is Podio's studded 3D box; `tray` is a wide open tray with a concave dip
  in its top edge.
- **UI-chrome icons** — same style and map, but **not offered in the
  app-icon picker** (not listed in `PODIO_ICONS`): `activity`, `add`,
  `people`, `calendar`, `check-square`, `search`, `bell`, `chat`, `help`,
  `menu`, `paperclip`, `chain` (alias of `link`), `question`, `wrench`,
  `pencil`, `store`, `tools`, `x`, `lock`, `person-plus`, `trash`,
  `warning`.

`PodioIcon` falls back to rendering legacy emoji strings as text. When adding
new UI, never introduce colorful emoji for app/tool iconography — extend the
`PATHS` map (and `PODIO_ICONS` only if the icon should be pickable for apps).

**Choosing an app icon**: use the `IconPicker` component
(`src/components/icon-picker.tsx`) — a searchable inline grid (filter input +
scrollable `grid-cols-8` of icon buttons) rendered in normal flow below a
square icon-preview button that toggles it. It is the standard picker for app
icons everywhere (Create New App modal, app builder); picking keeps the panel
open for browsing.

## Spacing & shape

- Radius: `rounded` (4px) almost everywhere; active app tab card `rounded-lg`.
- Panels: `border border-[#E3E3E3] bg-white shadow-sm` (shadow optional).
- Density: table rows ~44px tall; left-pane view rows ~36px; card padding 16px.
- The page gutter is small (~16–24px); content fills the viewport width.
