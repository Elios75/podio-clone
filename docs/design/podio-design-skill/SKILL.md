---
name: podio-design
description: Podio's visual design language for the podio-clone project (Next.js + Tailwind). Use this whenever building, restyling, or reviewing ANY user-facing UI in the podio-clone — new pages, components, views, builders, settings panels — or when the user mentions matching Podio's look, the app bar, views pane, sheet/table view, card (Dig) view, filters, chips, or says a page "doesn't look like Podio". Also use for standalone mockups of Podio-style screens.
---

# Podio Design Language

Recreate the look of Progress Podio: a calm, light-grey workspace with muted
grey-teal chrome, teal as the single accent color, white content panels, and
pastel category chips carrying almost all of the color. The result should feel
dense but unhurried — Podio is a work tool, not a marketing site.

Ground truth: four reference screenshots (workspace activity, tasks card view,
files sheet view, onboarding sheet view with grouped views). If present in the
repo, look at `docs/design/podio-screenshots/`. Everything below is extracted
from them.

## The one-paragraph mental model

Every app page is the same skeleton: a **grey-teal global bar** (org name left,
brand center, search/avatar/notifications right), an **app tab bar** of
icon-over-label tabs where the active app sits on a white rounded card, then a
two-zone body: a **white left pane** (app title in teal, "Views" list with
counts, Team/Private tabs) and the **main view area** with a toolbar (layout
toggles left; `Dig | Sheet | Reports | Create report` + one solid teal action
button right) above either a **sheet** (numbered table rows, pastel status
chips) or **cards** (title, grey excerpt block, colored chips, date + comment
footer). Blue does not exist in this world — if you're writing `bg-blue-600`,
it should almost certainly be Podio teal.

## Tokens (Tailwind)

Read `references/tokens.md` for the full palette, chip color system, and
typography. The five you'll use constantly:

- Primary teal (buttons, links, app title): `#15808D` — hover `#0F6D79`
- Chrome grey-teal (global bar): `#CBDBDB`; page background: `#EDEDED`
- Active view-toggle orange (the "Sheet" pill): `#F7A11C`
- Text: `#333333` primary, `#8A9494` meta/secondary
- Panels: white, `border-[#E3E3E3]`, `rounded` (small radius, not rounded-xl)

## Layout recipes

Read `references/layouts.md` before building any of these — it has copy-paste
JSX/Tailwind for each pattern:

1. Global top bar and app tab bar (active tab = white rounded card)
2. Left views pane (teal app title + utility icons, Views + "+ Add",
   Team/Private underline tabs, view rows with right-aligned counts, active
   row grey; grouped views with colored-dot sub-rows)
3. View toolbar (funnel + "134 of 745" + "Show all"; Dig/Sheet/Reports; solid
   teal `Add <ItemName>` button)
4. Sheet view (checkbox column, row numbers, sortable headers, chips in cells,
   horizontal scroll affordance)
5. Card / "Dig" view (3-up cards: title, grey excerpt panel, chip stack,
   `05/18/2026 by Name` + 💬 count footer)
6. Workspace activity landing (two-zone: workspace card with teal name,
   member photos + ⊕ INVITE, composer with 📎/🔗/❓ + teal Share, feed left;
   dashboard tiles + panels in the right rail — apps appear ONLY in the tab
   bar, never as a card grid on the page)
7. Wrench admin menu (🔧 dropdown: Manage members/apps, Workspace settings,
   Share in App Market, red Leave/Delete rows, "Go to…" shortcuts)
8. Modal dialogs (teal title + ✕, label-left form rows, radios with grey
   inline descriptions, grey Cancel + solid teal primary): create-workspace →
   chained invite-employees step (people picker + Address book, prefilled
   message, Role dropdown, "Add to <name>"), the two-card "Add app" chooser
   (Create your own app *or* Go to the App Market), and Create New App
   (ink header row, General/Advanced tab rail, App/Item Name*, app-type
   radios Standard/Event/Contact, monochrome icon picker)
9. Iconography & font (tokens.md): app/tool icons are monochrome outline
   SVGs via the PodioIcon component — never colorful emoji; the typeface is
   the platform's system UI font (Segoe UI / SF Pro — modern Podio ships no
   webfont), already wired as font-sans
10. Category chips (pastel background + dark saturated text; solid orange/red
    reserved for priority-like options)
11. App Market (grey category sidebar with search + Functional/Industry
    lists; PACK-ribbon cards with capability-icon strips, teal star ratings,
    touching Get Pack/More info buttons; "Included in <Pack>" links;
    square-button pagination)
12. Item creation view (chrome stays; creation header bar with teal
    "New <ItemName>" chip + Modify Template + breadcrumb; label-left form
    rows with red * before required labels; category pill buttons;
    Instructions right rail; grey Cancel + teal Save <ItemName>)
13. Chat panel (💬 in the global bar opens a right slide-over that pushes
    page content: avatar strip + connections list with presence dots,
    timestamped 1:1 conversations with 📎/🔗 composer)

## Applying it to the podio-clone codebase

The clone currently leans on `blue-600` primaries and generic slate panels.
When touching a page, migrate what you touch: primary buttons and links to
teal, page background to `#EDEDED`, panels to white with `#E3E3E3` borders,
and category values to the chip system. Don't do drive-by restyles of pages
you weren't asked to change — convergence happens page by page, consistently.

Keep Tailwind utility-first style with arbitrary values (`bg-[#15808D]`) or,
if the change is project-wide, extend `tailwind.config.ts` with a `podio`
color family and use `bg-podio-teal` — prefer the config route once more than
~3 files share a color.

## What NOT to do

- No gradients, no large border radii, no drop shadows heavier than
  `shadow-sm`, no dark mode.
- Don't color noncategorical things: body text stays near-black, meta stays
  grey. Color = chips, links, the one action button, and the orange active
  toggle.
- Don't center content pages; Podio is left-aligned and fills width.
