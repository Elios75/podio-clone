# Podio layout recipes

JSX/Tailwind snippets for the recurring structures. Adapt class lists, keep
proportions and hierarchy. All hexes come from `tokens.md`.

## 1. Global top bar

Full-width, grey-teal, ~56px tall. Left: hamburger + org name (semibold ink).
Center-left: small tool icons (contacts, calendar, tasks). Center: brand.
Right: help, search, avatar, notification bell with a yellow count pill, chat.

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

## 7. Chip component

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
