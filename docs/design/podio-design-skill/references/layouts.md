# Podio layout recipes

JSX/Tailwind snippets for the recurring structures. Adapt class lists, keep
proportions and hierarchy. All hexes come from `tokens.md`.

## 1. Global top bar

Full-width, grey-teal, ~56px tall. Left: hamburger + org name (semibold ink).
Center-left: small tool icons (contacts, calendar, tasks). Center: brand.
Right: help, search, avatar, notification bell with a yellow count pill, chat.

**Workspace navigation lives behind the ☰ hamburger** as a left slide-over
drawer (org name header, workspace rows with color dots, + New workspace,
Administration, ← All organizations). There is NO persistent workspaces
sidebar: page content owns the full width, so an app's views pane (§3) is
the leftmost column on screen, exactly like real Podio.

```jsx
<header className="flex h-14 items-center gap-4 bg-[#CBDBDB] px-4 text-[#333333]">
  <button aria-label="Menu">☰</button>
  <span className="text-lg font-semibold">{orgName}</span>
  <nav className="ml-6 flex items-center gap-5 text-[#4E5E5E]">{/* 👥 📅 ✓ */}</nav>
  <div className="mx-auto font-semibold tracking-wide">Podio Clone</div>
  <div className="flex items-center gap-4">
    {/* help, search, avatar */}
    <span className="relative">🔔
      <span className="absolute -right-3 -top-1 rounded bg-[#F5D327] px-1 text-xs font-semibold">5</span>
    </span>
  </div>
</header>
```

## 2. App tab bar

Sits directly under the global bar on the page background. Each app is an
icon-over-label tab; the active one is a white rounded card. "ADD APP" is
last, uppercase, disabled-grey, after a vertical divider.

```jsx
<nav className="flex items-end gap-1 bg-[#EDEDED] px-4 pt-2">
  {apps.map((a) => (
    <a key={a.id} href={a.href}
      className={`flex w-24 flex-col items-center gap-1 rounded-lg px-3 py-3 text-[13px]
        ${a.active ? "bg-white text-[#333333] shadow-sm" : "text-[#6E7A7A] hover:bg-[#E4E4E4]"}`}>
      <span className="text-2xl leading-none">{a.icon}</span>
      {a.name}
    </a>
  ))}
  <span className="mx-2 h-10 w-px self-center bg-[#DADADA]" />
  <button className="flex w-24 flex-col items-center gap-1 px-3 py-3 text-[13px] uppercase text-[#B8C2C2]">
    <span className="text-2xl leading-none">⊕</span>Add app
  </button>
</nav>
```

## 3. Left views pane

White, ~300px wide, collapsible (chevron on its right edge). Top: app name in
teal with small utility icons (share, bell, wrench, expand). Then the app
description in secondary text, then Views.

```jsx
<aside className="w-72 shrink-0 border-r border-[#E3E3E3] bg-white p-4">
  <div className="flex items-center gap-2">
    <h1 className="text-xl font-semibold text-[#15808D]">{app.name}</h1>
    <span className="ml-auto flex gap-2 text-[#8A9494]">{/* ↗ 🔔 🔧 ⤢ */}</span>
  </div>
  <p className="mt-2 text-sm text-[#6E7A7A]">{app.description}</p>

  <div className="mt-5 flex items-center">
    <h2 className="text-lg font-semibold text-[#333333]">Views</h2>
    <button className="ml-auto rounded border border-[#E3E3E3] bg-[#F7F7F7] px-2 py-0.5 text-sm">+ Add</button>
  </div>

  {/* Team / Private underline tabs */}
  <div className="mt-2 flex gap-6 border-b border-[#E3E3E3] text-[15px]">
    <button className="border-b-2 border-[#333333] pb-1 font-semibold">Team</button>
    <button className="pb-1 text-[#6E7A7A]">Private</button>
  </div>

  {/* View rows: teal name, right-aligned count; active row grey */}
  <ul className="mt-3 space-y-0.5">
    {views.map((v) => (
      <li key={v.id}>
        <a href={v.href}
          className={`flex items-center rounded px-2 py-1.5 text-[15px]
            ${v.active ? "bg-[#ECECEC] font-semibold text-[#15808D]" : "text-[#15808D] hover:bg-[#F3F3F3]"}`}>
          {v.name}
          <span className="ml-auto text-[#333333]">{v.count}</span>
        </a>
        {/* Grouped views: colored-dot sub-rows (e.g. Completed 15 / In Process 2) */}
        {v.groups?.map((g) => (
          <a key={g.label} className="flex items-center gap-2 rounded px-2 py-1 pl-4 text-sm text-[#6E7A7A] hover:bg-[#F3F3F3]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.dotColor }} />
            {g.label}
            <span className="ml-auto">{g.count}</span>
          </a>
        ))}
      </li>
    ))}
  </ul>
</aside>
```

Additional pane behaviors (implemented in `views-pane.tsx`):

- **+ Add form** (inline under the Views header): view name input, a
  Team/Private radio pair, and an optional "Group by" select listing the
  app's category fields ("— no grouping —" default). It saves the CURRENT
  filters/sort/columns and layout as the new view; a chosen group field is
  stored as `settings: { group_field_id }`, which is what drives the
  colored-dot sub-rows above. Note under the form: "Saves the current
  filters and sort." View creation lives here, not in the view toolbar
  (the toolbar keeps delete-view).
- **Per-view counts**: right-aligned ink number on every view row ("All
  items" shows the unfiltered total). Computed server-side via one
  `query_items` call per view with `p_limit: 1` (it returns `total`),
  capped at the first 15 views. Grouped sub-row counts are app-wide
  tallies of `item_field_values.value_text` per option id.
- **Collapse strip**: a thin `‹` button on the pane's right edge collapses
  the whole pane to a ~28px `w-7` strip with a `›` to reopen (client
  state, persisted in localStorage). The pane's app-title row and the main
  column's toolbar row share the same top padding and `min-h-10` so both
  top rows sit at the same height.

## 4. View toolbar

One row above the content. Left cluster: layout icon, sort icon, overflow
"…", then filter funnel with count summary. Right cluster: `Dig` /
`Sheet` / `Reports` / `Create report ▾` and the single primary action.

```jsx
<div className="flex items-center gap-3 px-4 py-3 text-[15px]">
  <span className="flex gap-3 text-[#6E7A7A]">{/* ▦ ↓A …  */}</span>
  <span className="flex items-center gap-1 text-[#6E7A7A]">
    {activeFilters > 0 && (
      <span className="rounded-full bg-[#4E5E5E] px-1.5 text-xs font-semibold text-white">{activeFilters}</span>
    )}
    ⏳ {filtered} of {total}
  </span>
  {activeFilters > 0 && <a className="text-[#15808D] hover:underline">Show all</a>}

  <div className="ml-auto flex items-center gap-4">
    <button className="text-[#15808D]">Dig</button>
    <button className="rounded bg-[#F7A11C] px-3 py-1.5 font-semibold text-white">Sheet</button>
    <button className="text-[#15808D]">Reports</button>
    <button className="text-[#333333]">Create report ▾</button>
    <button className="rounded bg-[#15808D] px-4 py-2 font-semibold text-white hover:bg-[#0F6D79]">
      Add {app.itemName}
    </button>
  </div>
</div>
```

The active layout name gets the orange pill; inactive ones are plain teal
text. Never two orange pills.

## 5. Sheet (table) view

White table on the page background. Header row: `bg-[#F7F7F7]`, semibold ink,
with a leading select-all checkbox column and a `‹` collapse affordance on the
first column; `›` at the far right hints horizontal scroll.

```jsx
<table className="w-full border-separate border-spacing-0 bg-white text-[15px]">
  <thead>
    <tr className="text-left font-semibold text-[#333333]">
      <th className="w-10 border-b border-[#E3E3E3] p-2"><input type="checkbox" /></th>
      <th className="w-8 border-b border-[#E3E3E3]" />
      {columns.map((c) => (
        <th key={c.key} className="border-b border-[#E3E3E3] px-3 py-2">{c.label}</th>
      ))}
    </tr>
  </thead>
  <tbody>
    {rows.map((r, i) => (
      <tr key={r.id} className="hover:bg-[#ECECEC]">
        <td className="border-b border-[#EFEFEF] p-2"><input type="checkbox" /></td>
        <td className="border-b border-[#EFEFEF] pr-1 text-right text-[#B8C2C2]">{i + 1}</td>
        {/* text cells: ink; category cells: <Chip/>; empty: — */}
      </tr>
    ))}
  </tbody>
</table>
```

## 6. Card ("Dig") view

Responsive grid (3-up on desktop). Card: white, thin border, small radius.
Sections top to bottom: title (semibold, 17px), excerpt block
(`bg-[#F7F7F7]` panel with 3–6 lines of body text, secondary color, faded
overflow), chip stack (one chip per line, left-aligned), footer.

```jsx
<article className="flex flex-col rounded border border-[#E3E3E3] bg-white">
  <h3 className="px-4 pt-4 text-[17px] font-semibold text-[#333333]">{item.title}</h3>
  <div className="mx-4 mt-3 max-h-40 overflow-hidden bg-[#F7F7F7] p-3 text-[15px] text-[#4E5E5E]">
    {item.excerpt}
  </div>
  <div className="flex flex-col items-start gap-1.5 px-4 py-3">
    {item.chips.map((c) => <Chip key={c.label} {...c} />)}
    {!item.priority && <span className="text-[15px] italic text-[#B8C2C2]">Priority not set</span>}
  </div>
  <footer className="mt-auto flex items-center px-4 pb-3 text-sm text-[#B8C2C2]">
    {item.date} by {item.author}
    <span className="ml-auto flex items-center gap-1">💬 {item.commentCount}</span>
  </footer>
</article>
```

## 7. Workspace activity page (the workspace landing)

Reference: the workspace-overview screenshot. Opening a workspace shows the
**Activity** tab of the app tab bar — never a grid of app cards (apps live
only in the tab bar). Two-zone body on the page grey:

- **Left (~2/3)**: a white workspace card, then the composer + feed panel.
- **Right (~1/3) rail**: dashboard tiles ("Add tile"), then any secondary
  panels (calendar widget, tools, members).

The workspace card: workspace name in **teal** (text-podio-teal, 22-24px
semibold), a 🔧 wrench button at the top right (admin menu, §9), a row of
member photos (h-12 w-12 rounded-full; real avatar images when available,
initials on chrome-grey circles as fallback), and an **⊕ INVITE** control
right-aligned below the avatars (circled + icon + uppercase INVITE label,
ink text, hover teal).

The composer: full-width textarea "Share something. Use @ to mention
individuals.", then an icon row 📎 (attach file) 🔗 (share link) ❓ (ask a
question) in secondary grey (active state teal), with the solid-teal
**Share** button right-aligned. Attachments appear as small bordered chips;
question posts get a ❓ marker in the feed. The composer/feed panel ends with
a full-width footer strip (`bg-podio-row-alt`, top border): right-aligned
"✉️ Create a status via email" hint + a 🔔 Unfollow/Follow toggle.

**Fresh workspace** (no apps yet — reference screenshot): tab bar shows only
Activity + ADD APP; the feed always ends with a genesis row "⚡ `<creator>`
created the `<name>` workspace" + date. Right rail order: "`<name>` Tasks"
panel (teal title + open count; centered "No tasks to show" in meta grey with
generous padding when empty; uppercase "+ CREATE TASK" footer link), then
"`<name>` Calendar" panel (upcoming dated entries or "Nothing scheduled"),
then Dashboard, then a dashed-border "+ ADD TILE" tile (uppercase meta text).

**Movable workspace panels**: every panel on this page (workspace card, feed,
Tasks, Calendar, Dashboard, tools, Members) can be dragged between and within
the two columns via a hover-revealed ⋮⋮ grip at the panel's top-right (same
two-column-dots grip as the template editor). Native HTML5 DnD: teal 2px
top-border insertion indicator, dashed "Drop panel here" zone at each
column's bottom while dragging. Order persists per workspace in localStorage
(`podio.ws-panels.<wsId>`); a small "Reset layout" text link (meta grey,
hover teal) appears at the bottom of the right rail once a custom layout is
stored. Default order is always server-rendered; the stored layout is applied
only after hydration.

## 8. Wrench admin menu (workspace)

Reference: the wrench-menu screenshot. Clicking 🔧 on the workspace card opens
a white dropdown (w-64, rounded-lg, border-podio-border, shadow, anchored top
right). Rows are icon + label, 15px ink text, hover:bg-podio-row-hover.
Destructive rows (Leave workspace, Delete workspace) in red with red icons.
A "Go to…" section header row (text-podio-meta on bg-podio-row-alt) separates
navigation shortcuts.

Menu contents (map to the clone's routes):

| Item | Target |
|---|---|
| Manage members | `<ws>/settings#members` |
| Manage apps | `<ws>/settings#apps` |
| Workspace settings | `<ws>/settings` |
| Share in App Market | `<ws>/market` |
| Leave workspace (red) | `<ws>/settings#danger` |
| Delete workspace (red) | `<ws>/settings#danger` |
| *Go to…* | — |
| Workspace tasks | `<ws>/tasks` |
| Workspace calendar | `/calendar` |
| Workspace files | `<ws>/files` |
| Workspace contacts | `<ws>/settings#members` |

### 8b. Wrench app menu (app views pane)

Reference: the app-wrench screenshot. Clicking the 🔧 in the app's views pane
opens a WIDE mega-panel (w-[560px], white, rounded-lg, border-podio-border,
shadow-xl, anchored below the wrench with a small rotated-square caret).
Contents, top to bottom:

- A solid-teal full-width **Modify Template** button (bg-podio-teal, white
  semibold text) → `<app>/edit`.
- Three sections, each an uppercase meta label (11px, tracking-wider,
  text-podio-meta) over a hairline (border-podio-border), followed by a
  **two-column grid** of icon + label rows (18px line icon, 14px ink text,
  hover:bg-podio-row-hover; grid-flow-col so the markup order fills column 1
  first):
  - **APP** — App settings, Layout options, Developer | Workflows, Workflow
    automation, Add to calendar
  - **DATA** — Excel Import, Excel Export, Webform | Email to app,
    Integration, Cleanup deleted field values
  - **ACTIONS** — Clone app, Delete app (red) | Share app, Archive app
- Not-yet-built rows render inert in text-podio-disabled with title
  "Coming soon". Delete app is red; interactive controls (Excel Export,
  Share app / publish-to-market) are passed in as slots and rendered in
  their grid positions. Implemented in `[appSlug]/app-tools-menu.tsx`.

## 9. Modal dialog (e.g. "Create a new workspace")

Reference: the create-workspace screenshot. Podio modals are plain white
sheets over a dimmed page — no rounded-xl, no heavy shadow theatrics:

- Overlay: `fixed inset-0 z-40 bg-black/40`; dialog `w-full max-w-xl bg-white
  p-8 rounded shadow-lg` centered.
- Title in **teal**, 24-26px, weight 500-600 ("Create a new workspace"), with
  a thin grey ✕ button at the top right.
- Form rows: label column left (ink, semibold, ~15px) + control right, roomy
  vertical spacing (space-y-6).
- Radio options: bold ink option name + `– grey description` on the same line
  ("Private – not visible for others, invite only" / "Open – visible and open
  for all employees to join").
- Footer, right-aligned, two buttons touching Podio-style: **Cancel** on grey
  (`bg-podio-row-hover text-podio-ink`) and the primary action on solid teal
  (`bg-podio-teal text-white`), both `px-6 py-2.5 font-semibold rounded-sm`.

```jsx
{open && (
  <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-24"
    onClick={() => setOpen(false)}>
    <div className="w-full max-w-xl rounded bg-white p-8 shadow-lg"
      onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start">
        <h2 className="text-2xl font-medium text-podio-teal">Create a new workspace</h2>
        <button onClick={() => setOpen(false)}
          className="ml-auto text-2xl leading-none text-podio-disabled hover:text-podio-ink">✕</button>
      </div>
      {/* label-left form rows, space-y-6 */}
      <div className="mt-8 flex justify-end">
        <button className="rounded-sm bg-podio-row-hover px-6 py-2.5 font-semibold text-podio-ink">Cancel</button>
        <button className="rounded-sm bg-podio-teal px-6 py-2.5 font-semibold text-white hover:bg-podio-teal-dark">Create</button>
      </div>
    </div>
  </div>
)}
```

Three canonical instances (reference screenshots for all three):

**Create a new workspace** — teal title; "Workspace name" row with "Type a
name" input; "Access settings" radios; Cancel + Create footer. On success it
chains straight into…

**Invite your employees to the `<name>` space** (post-creation step) — title
in **ink** (not teal) semibold; a people-picker input (👤 icon, "Pick
connections or type email addresses", picked people as grey chips) with a
grey **Address book** button beside it; a bordered message box with a ✏️ icon
and a prefilled editable invitation ("Hi, I've set up a workspace on Podio
for us - so we can work on `<name>`. …"); a `Role : Regular member ⌄` inline
dropdown (Admin / Regular member / Light member / Guest); footer right:
quiet "Skip for now" text link + solid teal **Add to `<name>`**. Adding
members also notifies them.

**Add app** chooser (from the tab bar's ADD APP tile, especially when the
workspace has no apps yet) — teal "Add app" title; two large equal option
cards on `bg-podio-row-alt` with a thin border (hover teal): big icon (🛠️ /
🏪), semibold ink option name ("Create your own app" / "Go to the App
Market"), grey description ("Go to the app template to create it yourself in
minutes." / "Pick one of the predefined app templates made by people who work
just like you."), separated by a plain "or". Card = whole-surface link.
"Create your own app" chains into…

**Create New App** — a different header treatment: title in **ink** on a
white header ROW with a bottom border (not floating teal) + grey ✕; a left
tab rail (General active on white; Advanced on `bg-podio-row-alt`,
grey/disabled until built); body rows: "App Name" and "Item Name" labels with
a red `*` (Item Name = the record type, e.g. Customer, Job); "App Type"
radios with bold ink names + grey descriptions: Standard "– the Podio
default, useful for all types of apps" / Event "– enables RSVP, event
notifications and online meeting tools" / Contact "– manage your contacts in
this app"; "App Icon" — a bordered square button showing the current
monochrome line icon (see tokens.md → Iconography) with a ⌄ segment opening
an icon grid; footer right: grey Cancel + solid teal "Create App", touching.
Type preseeds the builder (event → Date field, contact → Phone + Email).

## 10. Chip component

```jsx
function Chip({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span className="rounded px-2 py-0.5 text-sm font-medium"
      style={{ backgroundColor: bg, color: text }}>
      {label}
    </span>
  );
}
```

Pick `bg`/`text` pairs from the chip table in `tokens.md`. Persist a color per
category option (or derive from option index) so colors are stable across
sheet cells, cards, and view-group dots.

## 11. App Market

Reference: the two App Market screenshots. Two-zone layout:

- **Left category sidebar** (light grey panel): a search row at the top
  (input + a bordered ▸ submit button), then link lists under section
  headings — "My organizations" (org row with its logo), "Functional", and
  "Industry". Rows are ink text, ~44px tall, separated by hairline dividers;
  no icons.
- **Main column** (white): "Podio App Market" ink title row, then section
  header rows ("Recommended packs", "Recommended apps") separated by
  dividers.

**Pack cards** (3-up): white card with a diagonal teal **PACK** ribbon
across the top-right corner; ink semibold title; one-line grey description
(truncated with …); a **capability-icon strip** — the monochrome line icons
of the apps included in the pack, laid on a subtle grey gradient band;
star rating in teal (★ filled / outline empty); footer: touching buttons —
solid teal **Get Pack** + grey **More info**.

**App entries** (3-up grid, lighter than cards — no border): line icon +
ink semibold app name inline; grey truncated description; teal stars; teal
**Get App** + grey **More info**; below, a meta row "📖 Included in
`<Pack>`" where the pack name is a teal link.

**Pagination**: a row of small bordered square buttons — First · Prev ·
1…9 · Next · Last — active page with a darker border/ink number.

"Get Pack"/"Get App" = the install flow: pick one of your workspaces, then
install the template(s) into it (the clone's `install_app_template`, with
the sample-data option). Categories map to `app_templates.category`.

## 12. Item creation view ("New Task" pattern)

Reference: the New Task screenshot. Creating an item NEVER hides the chrome —
the global bar stays, and a white **creation header bar** appears below it:
far left a solid-teal tab-like chip "New `<ItemName>`", then a grey "Modify
Template" button (→ the app builder) and a plain "Actions ⌄"; centered
breadcrumb "`<Workspace>` › `<app icon+name>` › New `<ItemName>`" with teal
links. Body on the page grey, two columns:

- **Main**: white panel, label-left form rows — labels in a fixed right-
  aligned left column (semibold ink, red `*` BEFORE the label when required);
  category fields are **bordered pill buttons** (selected = teal border +
  teal semibold text), not dropdowns; relationship fields say "Type to
  search for items"; help text in meta grey under each control.
- **Right rail (~320px)**: an "Instructions" panel — teal heading + the
  app's usage instructions in ink prose.

Footer bottom-right: touching grey **Cancel** + solid teal
**Save `<ItemName>`** (rounded-sm). The same label-left form grammar applies
when editing an item.

**Record view (existing-item variant).** An open record reuses the same
header bar, with two changes: the teal chip stays "New `<ItemName>`" but is
now a quick-create **link** to the app's /new route, and the breadcrumb ends
with the **item title** (ink, truncated). Far right of the bar a new cluster:
🔔 **Following `<n>`** (bell icon; a working follow/unfollow toggle, count =
item followers) and **Share** (share-out icon; anchors to the share panel,
`#share`). Body stays grey, two columns: left (~2/3) stacks white panels —
title + edit-mode label-left form, then tasks, attachments, email, related
items, and the share panel; right rail (~1/3) is one white panel with
**Activity | Comments** underline tabs (teal underline on the active tab;
default = Comments when comments exist, else Activity). Comments keep
Podio's composer at the bottom of the tab.

### 12b. Template editor ("Modify Template" builder)

Reference: the Modify Template screenshots. `<app>/edit` reuses the creation
header bar (§12) with the chips swapped: the grey "New `<ItemName>`" chip is
now a LINK to `/new`, and **Modify Template** is the active solid-teal tab
chip (rounded-t, self-end); breadcrumb stays centered; the primary action
sits header-right as a solid teal **Publish changes** button next to a quiet
"Back to app" link. Body on the page grey, two columns:

- **Fields palette** (left, `w-64 sticky top-4 self-start`, white card):
  teal "Fields" title + wrench line icon; a vertical list of field-type rows
  (monochrome line icon + short name — Text, Category, Date, Relationship,
  Contact, Phone, Email, Number, Link, Money, …) where CLICKING a row
  APPENDS a new field of that type to the canvas; footer = full-width solid
  teal **Done** button → back to the app (`confirm()` first when there are
  unpublished changes).
- **Canvas** (flex-1): one white block per field. Left segment: the
  field-type icon + ⌄ (an invisible overlaid `<select>` keeps type changes
  working); the field LABEL is a large (text-xl semibold) borderless input
  with only a bottom hairline (teal on focus). A subtle row beneath holds
  the help-text input + required/hidden/title-field toggles; per-type config
  renders below (default value, date range, calculation formula/rollup with
  the ✨ AI assist). **Category options** are full-width rows inside one
  bordered list: borderless label input + a small color-swatch button (⌄)
  opening a CATEGORY_COLORS popover + ✕, closed by a `bg-podio-row-alt` row
  with an "Enter a category option" input that adds on Enter. Reorder via
  ▲▼ (drag also works); remove via ✕; per-field "`n` values" / teal "new"
  badges keep the data-loss warnings honest. A quieter collapsible
  **App settings** block (IconPicker for the app icon, name, item name,
  description, save/archive/delete) tops the canvas; the schema-history
  panel closes it.

The field-type → line-icon map lives in `edit/fields-palette.tsx`
(`FIELD_TYPE_ICONS`): text→`text-a`, number→`hash`, category→`grid`,
money→`money`, calculation→`calc`, progress→`progress`,
separator→`separator`, link→`globe`, organization→`people`; the rest reuse
existing glyphs (calendar, contact, phone, mail, pin, clock, image,
paperclip, link).

### 12c. Beyond-Podio: multi-column form layouts

A **deliberate divergence from real Podio** (which only stacks fields in one
column): an app template can lay its form out in 1, 2 or 3 columns.

- **Picker**: a "Layout" block at the top of the builder canvas (below App
  settings) — three segmented buttons (border-podio-border; active =
  solid-teal bg, white text) with tiny column glyphs + "Single column / Two
  columns / Three columns". Switching re-renders the canvas immediately;
  Publish persists `{ columns }` to `apps.layout_settings`.
- **Per-column drag**: the canvas becomes one grid per section
  (`grid grid-cols-{n} gap-4`, static class map — never template-string
  Tailwind classes); every column is a full drop target with its own
  pointer-midpoint insertion index, teal insertion indicator and dashed
  bottom drop zone while dragging. Palette drops and reorders both set the
  field's `config.column` (0-based). One global fields array stays the
  source of truth; per-column order is derived by filtering.
- **Separators span all columns**: a separator renders as a full-width
  hairline with an optional inline section label (meta text, uppercase in
  forms) and ignores column assignment — it splits the field list into
  SECTIONS, each rendering its own N-column grid. The shared helper is
  `splitSections(fields, columns, columnOf)` in `src/lib/fields.ts`, used by
  all three surfaces: template editor, item creation form and record view.
  Forms use `grid grid-cols-1 md:grid-cols-{n} gap-x-6` so the layout
  collapses to one column on small screens; label-left field rows keep their
  §12 markup unchanged inside their cells.
- **Safety**: column indexes ≥ the column count clamp into the last column
  (shrinking the layout never hides a field); absent settings mean 1 column /
  column 0, so pre-existing apps render exactly as before.

## 13. Chat panel

Reference: the two chat screenshots. Chat opens from the 💬 icon at the far
right of the global bar as a **right slide-over that pushes the page
content** (the layout shrinks; it does not overlay-dim).

Structure, right-docked and full height:

- A narrow **avatar strip** (~72px, `bg-[#ECECEC]`): a person icon at top,
  then recent-conversation avatars (rounded-full, greyed when inactive); the
  open conversation's avatar gets a small left-pointing arrow notch; "…"
  overflow and a tray icon at the bottom.
- The **panel column** (white): top row = 🔍 "Search connections" input with
  a ✕ close at the right; below, connection rows — avatar + ink name +
  right-aligned presence dot (solid green = online, grey outline = offline),
  hairline dividers, ~72px rows.
- **Conversation view** (after picking someone): header row with ⊕ (new
  conversation) and … actions + ✕ close; a name row "`<Name>` ○" with the
  presence ring and a 🔒 lock at the far right (private 1:1); a grey meta
  line "Started on July 4 2026 2:05 PM" — messages are always timestamped;
  composer = bordered "Add a message" input with 📎 attach-file and 🔗
  share-link icon buttons beneath (same icon row grammar as the workspace
  composer).
