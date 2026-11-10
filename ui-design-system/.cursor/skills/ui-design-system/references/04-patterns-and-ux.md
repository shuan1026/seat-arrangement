# 04 Patterns and UX

> Source of Truth: 本文件描述「頁面如何組合元件」與「互動如何運作」。`source-reference/html/` 有對應頁面時，區塊、文案與排列跟該 HTML。沒有 HTML 時，才用這裡的範例頁。元件尺寸、顏色與狀態細節請以 `03-components.md` 為準。

> Retrofit 原則：保留既有業務邏輯、API、validation、permission 與 route；只替換 layout / components / visual state。不可把目前前端暫時 UI 當作設計來源。

---

## Product Layout Model

這包描述的是高頻操作的工作台，不是 marketing site。第一屏必須讓使用者直接進入任務：查看總覽、篩選紀錄、完成表單。

| Page shape | Primary Pattern |
|---|---|
| Workbench / landing | Overview Pattern |
| Totals and period summary | Metrics Overview Pattern |
| Searchable record list | Data Management Pattern |
| Create or edit one record | Form Editor Pattern |

### Surface Hierarchy

| Layer | Token / Component | Usage |
|---|---|---|
| Brand surface | `var(--sidebar)` | Sidebar |
| Work surface | `var(--background)` | Authenticated page background |
| Content surface | `var(--card)` | Cards, tables, panels, dialogs, Alert, Sonner / Toast |
| Overlay surface | `var(--popover)` | Dropdown Menu and generic Popover surfaces |
| Tooltip surface | `var(--popover-foreground)` background + `var(--popover)` text | Tooltip only |
| Structure | `var(--border)`、`var(--edge-highlight)` | Table dividers, card borders, the top edge of cards and popovers |
| Atmosphere | `var(--glow-primary)`、`var(--glow-accent)`、`var(--glow-empty)` | Login, public pages, overview header, empty-state icon. Not a text background |
| Main action | `var(--primary)` | Primary buttons, active month, selected process state |
| Navigation active | `color-mix(in srgb, <work area color> 12%, transparent)` | Sidebar active item |
| Work area | `var(--module-leads)`、`var(--module-products)`、`var(--module-insights)` | Sidebar icons, the active tab indicator of that area |
| Status | `var(--status-positive-bg)`、`var(--status-pending-bg)`、`var(--destructive)`、`var(--status-hot)` | Status badges |

Do not create extra background colors for page sections. Use spacing, border, card surface, edge highlight, and typography to build hierarchy. Page glows follow `02-foundations.md` Atmosphere: at most two blooms, `pointer-events: none`, clipped by their own wrapper so the page does not scroll sideways. Data management, forms, record detail, and dialogs do not get a page glow.

---

## New Feature Unit Composition

Use this section when the requested feature unit does not already have a page section in this file. Compose new work surfaces from these patterns. Do not invent a new visual language.

### UX Decision Flow

1. Identify the primary job: create/update, search/manage, review/approve, monitor metrics, inspect one record, or complete a guided task.
2. Identify the main object: a record, a settings group, a reporting period, or another business entity.
3. Choose the closest base pattern from the table below.
4. Compose only the sections needed for the primary job; avoid adding dashboard cards, charts, filters, or side panels just because they are available.
5. Confirm required states: loading, empty, error, validation, permission-disabled, success feedback, destructive confirmation, and mobile behavior.
6. If business rules are unknown, preserve flexible placeholders and ask only for the missing business decision; do not ask for visual decisions that can be resolved from this design system.

### Base Pattern Selection

| User job / feature shape | Use this base pattern | Typical structure |
|---|---|---|
| Complete a linear task with required steps | Form Editor Pattern | Page title, progress/status, focused card, form content, footer actions |
| Search, filter, compare, and repeatedly act on many records | Data Management Pattern | Page title, optional summary cards, toolbar, table/mobile cards, pagination |
| Show the authenticated landing or workbench | Overview Pattern | Full-width page content, stat cards, operational modules |
| Monitor totals, period status, or an operational summary | Metrics Overview Pattern | Page title, period filter/tabs, stat cards, detail panels, optional list |
| Inspect one business record and act on it | Record Detail Pattern | Page title + status/action row, summary panel, grouped detail sections, related list/activity |
| Create or edit one entity | Form Editor Pattern | Page title, one main form card, optional section separators, sticky/visible footer actions |
| Configure user or system settings | Settings Pattern | Page title, grouped setting sections, inline validation, save/cancel actions |
| Review items that require approval/rejection | Review Queue Pattern | Status summary/filter tabs, data table, row action menu, Alert Dialog for irreversible actions |

### Record Detail Pattern

Use for a page that inspects one record and acts on it.

```text
Record Detail Page
├── Page title / breadcrumb
├── Status and primary actions row
├── Summary panel
├── Grouped detail sections
├── Related records / activity list if needed
└── Destructive or status-changing actions behind Alert Dialog
```

- Summary panel uses `var(--card)` and `var(--radius-xl)`.
- Status must be text + pill/icon, never color alone.
- Primary action appears in the header/action row; secondary actions use Button `outline` or Dropdown Menu `action-menu`.
- Related records use Data Management table rules when comparison matters; otherwise use compact detail rows.
- On mobile, summary appears first, actions stack full-width or move into an action menu, and related records become local horizontal table scroll or stacked cards.

### Form Editor Pattern

Use for adding or editing one record, or another single-entity form.

```text
Form Editor Page
├── Page title and optional description
├── Main form card
│   ├── Section heading
│   ├── Fields with labels/helper/error text
│   └── Optional Separator between sections
└── Footer actions
```

- Prefer one main card over multiple nested cards.
- Use vertical labels by default; horizontal labels only for short dense desktop settings.
- Keep destructive actions separated from save/cancel.
- Save success uses Sonner; blocking validation stays inline near the field.
- On mobile, all fields and actions stack; footer actions remain visible and full-width when the form is long.

### Settings Pattern

Use when the page edits durable configuration rather than a transactional record.

- Group settings by mental model, not database table.
- Each setting needs label, current value/control, helper text when risk is not obvious, and inline validation if editable.
- Avoid dense tables unless there are many repeated configurable rows.
- Use Alert for non-blocking policy notes; use Alert Dialog only for reset, delete, disable, or irreversible changes.

### Review Queue Pattern

Use when users must decide yes/no, approve/reject, or process a queue.

- Start with status filters or compact stat cards only if they change prioritization.
- Table row action menu uses `action-menu`; approve/reject actions must be commands, not selected states.
- Destructive/reject actions require confirmation if irreversible or externally visible.
- Keep processed items readable after action; show Sonner for success and keep filters stable.

### Composition Guardrails

- New feature units must still use App Shell, `var(--background)` work surface, and `var(--card)` content surfaces.
- Do not create hero/marketing layouts, decorative section cards, nested cards, or new navigation systems for operational pages. Atmosphere glows are not a hero. They stay behind the title on Overview and Metrics Overview, and they are absent from Data Management, Form Editor, and Record Detail.
- Do not add charts unless the user job is trend/metric monitoring and the data supports comparison.
- Do not add tabs unless there are mutually exclusive views that users switch between repeatedly.
- Do not add table columns that are not needed for scanning, comparison, action, or audit.
- Every new page must define loading, empty, error, permission-disabled, success, and mobile states before it is considered complete.

---

## Hover and Pointer Interaction

Hover is a desktop/pointer affordance. It should clarify clickability without becoming the primary way to understand state.

### Global Rules

- Apply hover only to enabled interactive elements: buttons, icon buttons, tabs, pagination controls, sidebar items, menu items, selectable tiles, clickable table rows, clickable cards, and row action triggers.
- Do not apply hover to static containers: ordinary cards, Alert, Dialog, table shell, page section, header bar, skeleton, separator, or brand pattern.
- Active/selected/current state must be stronger than hover. Hover never replaces selected state.
- Disabled and loading elements must not show hover treatment.
- Hover must not change layout dimensions, row height, text wrapping, or icon size.
- Touch/mobile layouts do not depend on hover; all actions must remain discoverable without hover.

### Recommended Hover Treatments

| Element | Hover Treatment |
|---|---|
| Primary/secondary buttons | Darken with `color-mix()` as defined in `03-components.md`. |
| Outline/ghost controls | Add subtle surface fill and/or stronger border. |
| Link actions | Underline or shift toward `var(--foreground)`. |
| Sidebar nav item | Subtle light overlay; active item remains active. Desktop collapsed icon-only nav items also show a Tooltip with the menu label on hover. |
| Filter pill / tab | Use Tabs hover rules; selected pill remains selected. |
| Table row | Subtle row background `color-mix(in srgb, var(--foreground) 4%, transparent)` if the row is clickable. |
| Row action menu trigger | Icon Button hover. |
| Row action menu item | Command/navigation row hover only; never show checkmark, selected state, or persistent value. |
| Clickable stat/action card | Slightly stronger border or shadow; must also have focus style. |
| Selectable tile | Subtle surface fill; selected tile remains visually stronger. |

---

## App Shell

The authenticated app uses Sidebar + Header + Main Content. This section defines page composition responsibilities; exact Sidebar/Header anatomy, dimensions, and interaction states live in `03-components.md`.

```text
App
├── Sidebar
│   ├── Logo
│   ├── Primary navigation
│   ├── Nested navigation
│   └── User footer / menu
└── Main
    ├── Header / breadcrumb row
    └── Page content
```

### Desktop Shell

- Use the desktop Sidebar and Header modes defined in `03-components.md`.
- Default desktop Sidebar uses the fixed positioning contract from `03-components.md`; do not use `position: sticky` for the default app shell.
- Header belongs to the normal main-content flow and should not become a fixed/sticky viewport bar unless a specific screen requires it.
- Main content uses `var(--background)`, `min-width: 0`, and stable page padding so tables, filters, and cards shrink inside the available width.
- Page padding is `24px-32px` for normal pages; dense table pages may use `20px-24px`.
- Main content width follows page type:
  - Form flows: `560px-760px`, centered in the area beside the Sidebar.
  - Dashboard/card pages: `960px-1120px`, centered in the area beside the Sidebar.
  - Reading pages, including docs and FAQ: title, article, and in-page TOC are one group at `max-width: 1120px`, centered in the area beside the Sidebar. The TOC stays beside the article inside that group. Do not pin it to the viewport edge.
  - Entry / landing pages that are not the workbench Overview: `max-width: 1200px`, centered. Do not use the full-width Overview rule (`.page-content--overview` below) for these pages.
  - Overview / workbench: full available width with no page-level max-width.
  - Data tables: can use full available width, with `24px` side padding.
- A max-width page group uses `width: 100%`, `margin-inline: auto`, and `min-width: 0` inside `.app-main`. Do not left-align that group and leave the spare width only on the right.
- Header / breadcrumb stays in the app shell and stays left-aligned with the shell padding. It is not part of the centered group.
- A reading article column stays near 45 Chinese characters, about `770px`. Do not stretch the prose column to the full `1120px` when a TOC shares the group.

Class names in this file (`.page-content--overview`, `.page-content--reading`, `.page-content--entry`) are illustrative. QA checks the computed width, max-width, and centering, not the class name. The prototype in `source-reference/html/prototype/prototype.css` uses these classes instead:

| Page width rule | Class in this file | Prototype class |
|---|---|---|
| Full available width (Overview, data tables) | `.page-content--overview` | `.page-content--full` (`max-width: none`) |
| Dashboard / card pages | — | `.page-content--dash` (`max-width: 1120px`) |
| Reading pages (docs, FAQ) | `.page-content--reading` | none; the prototype has no reading page |
| Form flows | — | `.page-content--form` (`max-width: 760px`) |
| Entry / landing page | `.page-content--entry` | `.home-wrap` in `login.html` (`max-width: 1200px`) |

```css
.page-content--reading,
.page-content--entry {
  width: 100%;
  min-width: 0;
  margin-inline: auto;
}

.page-content--reading {
  max-width: 1120px;
}

.page-content--entry {
  max-width: 1200px;
}
```

Default desktop shell layout contract:

```css
.app-shell {
  min-height: 100dvh;
  background: var(--background);
}

.app-main {
  width: 100%;
  min-width: 0;
}

@media (min-width: 768px) {
  .app-shell {
    --sidebar-width: 240px;
  }

  .app-shell[data-sidebar="collapsed"] {
    --sidebar-width: 48px;
  }

  .desktop-sidebar {
    position: fixed;
    top: 24px;
    left: 24px;
    bottom: 24px;
    width: var(--sidebar-width);
    height: calc(100dvh - 48px);
  }

  .app-main {
    padding-left: calc(var(--sidebar-width) + 48px);
  }
}

@media (max-width: 767px) {
  .desktop-sidebar {
    display: none;
  }

  .app-main {
    padding-left: 0;
  }

  .mobile-header {
    display: flex;
  }
}
```

### Mobile Shell

- Use the mobile Header and Mobile Drawer modes defined in `03-components.md`; desktop Sidebar must not render on mobile.
- Page content reserves top spacing for the fixed Mobile Header.
- Main content padding becomes `16px`.
- Tables either become horizontally scrollable inside a stable card, or convert to stacked mobile data cards.
- Primary footer actions may become sticky bottom only in multi-step flows; avoid sticky actions on browsing pages.
- Mobile Drawer overlays content and must not push, resize, or widen the page.

### App Shell State Isolation

- Desktop expanded, desktop collapsed, and mobile drawer are separate render modes. Do not let one mode's CSS selectors or layout state leak into another mode.
- Desktop collapsed state applies only to the desktop Sidebar root. It must not hide mobile drawer labels, logo, footer text, or navigation content.
- Desktop collapsed Sidebar nav items are icon-only and should show right-side Tooltip labels on pointer hover; expanded desktop and mobile drawer modes do not need these hover tooltips because labels are visible.
- Mobile Drawer must not inherit desktop collapsed width, desktop fixed inset, desktop padding, footer centering, or logo hiding rules.
- When resizing from desktop collapsed to mobile, remove desktop main-content left padding, hide/unmount the desktop Sidebar instance, show the mobile Header, and keep the Mobile Drawer closed until the mobile menu trigger opens it.
- Desktop Header toggle sizing must be scoped to the desktop Header and must not resize the mobile menu trigger.
- When switching breakpoints, verify desktop collapsed Sidebar state does not visually corrupt the mobile Drawer.

---

## Responsive Breakpoints

| Name | Width | UX Rule |
|---|---:|---|
| `sm` | 480px | Single column, full-width controls |
| `md` | 768px | Sidebar may switch from drawer to rail/expanded |
| `lg` | 1024px | Desktop table layout and expanded sidebar are preferred |
| `xl` | 1280px | Full data dashboard width |

### Responsive Rules

- Mobile first: one column, full-width inputs, stacked buttons.
- Tablet: keep forms single-column; data tables may still scroll horizontally.
- Desktop: use sidebar, aligned filters, stat cards, and full table layouts.
- Do not introduce separate mobile visual language; preserve tokens and component variants.

### Horizontal Overflow Prevention

- Page-level horizontal scrolling is a bug. `body`, app root, Sidebar + Main shell, page content, card grids, forms, and toolbars must fit the viewport.
- Use `width: 100%`, `max-width: 100%`, and `min-width: 0` on flexible page regions. Avoid nested `width: 100vw`.
- Break long single-row desktop layouts into wrapping rows before they overflow: filters, date pickers, search fields, segmented controls, stat cards, and action groups all need wrap behavior.
- Tables may scroll horizontally only inside a local table wrapper. That wrapper must fit inside the content card and keep pagination, empty state, and loading state aligned with the table shell.
- Prefer stacked mobile cards when row actions and field labels are more important than column comparison.
- Decorative assets must be clipped or constrained inside their section; decoration must not widen the page.
- Validate at `320px`, `375px`, `430px`, `768px`, `1024px`, and `1280px` before considering a page complete.

## Overview Pattern

Use for workbench and operational overview pages that need to fill the space beside the Sidebar. An entry or portal home page is not this pattern; cap that page at `1200px` and center it with `.page-content--entry`.

### Structure

```html
<main class="app-main">
  <header class="app-header">...</header>
  <section class="page-content page-content--overview">
    <div class="overview-stat-grid">...</div>
    <section class="overview-module-grid">...</section>
  </section>
</main>
```

### Layout Contract

The class names below are illustrative; the prototype uses `.page-content--full` for the same rule. QA checks the computed values.

```css
.page-content--overview {
  width: 100%;
  max-width: none;
  min-width: 0;
}

.overview-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
  gap: 16px;
  width: 100%;
  min-width: 0;
}

.overview-module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: 16px;
  width: 100%;
  min-width: 0;
}
```

- Content fills the full available width to the right of the desktop Sidebar.
- Do not apply the `960px-1120px` dashboard max-width rule to this pattern.
- Stat cards use `repeat(auto-fit, minmax(min(160px, 100%), 1fr))` so mobile can show two columns when there is room and one column when narrow.
- Use `var(--card)` / `var(--radius-xl)` / `var(--edge-highlight)` for outer modules and Stat Card surfaces.
- Place one `--glow-primary` layer behind the page title and `.overview-stat-grid` only. Module grids, charts, and lists stay on solid cards. Do not add `--glow-accent` on this pattern.

### QA

- At desktop widths, the Overview page content (`.page-content--overview` here, `.page-content--full` in the prototype) computes to `width: 100%` and `max-width: none`.
- Page-level horizontal overflow remains `0` at `320px`, `375px`, `430px`, `768px`, `1024px`, and `1280px`.
- Do not use desktop Sidebar `position: sticky` unless an explicit requirement is documented.

---

## Metrics Overview Pattern

Use for a compact summary of totals, period status, or operational metrics. It combines tabs, a period filter, metric cards, and detail panels.

### Page Structure

```text
Metrics Page
├── Page title
├── Controls row
│   ├── Tabs for mutually exclusive views
│   ├── Status pill
│   └── Period selector
├── Stat card grid
└── Detail panels
```

### Layout Rules

- Desktop stat cards use a 4-column grid when width allows.
- Stat card grids use `repeat(auto-fit, minmax(min(160px, 100%), 1fr))` or an equivalent auto-fit rule: mobile can show two columns when space allows and falls back to one column when narrow.
- Period selector opens a popover calendar or month grid; the selected period uses `var(--primary)`.
- Detail cards use table-like rows with the label on the left and the value on the right.
- Positive amounts use `var(--status-positive-fg)`; negative amounts use `var(--destructive-text)`.
- Status appears as a small pill, not a large banner.

### UX Notes

- Keep numeric values aligned to the right.
- Use consistent number formatting, currency prefix, and sign placement when money is shown.
- Loading state should skeleton the stat cards and details separately.
- One `--glow-primary` sits behind the title and stat cards. Detail panels and lists do not get a glow, and `--glow-accent` is not used here.

---

## Data Management Pattern

Management pages are built for scanning, filtering, and repeated action. They should feel dense but calm, and they do not use a page glow.

### Shared Structure

```text
Management Page
├── Page title
├── Optional summary cards
├── Toolbar
│   ├── Search
│   ├── Filters
│   ├── Date / month picker
│   └── Primary action if needed
├── Data table / mobile cards
├── Empty / loading / error state
└── Pagination
```

### Toolbar Rules

- Search appears first when present.
- Filters follow the visual order of business importance.
- Date/month picker sits with other filters, not isolated.
- Primary action is right aligned on desktop and full-width or top-aligned on mobile.
- Use Input `sm` or `md` consistently within one toolbar.
- Toolbar controls should wrap cleanly; never overflow horizontally outside the content container.
- Search input uses `min-width: 0` and grows within available space; filters wrap to the next row before compressing labels into unreadable text.
- On mobile, toolbar controls stack full-width in business-priority order: search, primary filter, secondary filters, then primary action.

### Table Rules

- Table container uses `var(--card)`, `var(--border)`, `var(--radius-xl)`, and shadow `var(--edge-highlight), var(--shadow-xs)`.
- Header row uses compact typography and muted labels.
- Row height should support scanning and touch targets; keep interactive cells at least `40px` high.
- Numeric values and dates align consistently.
- Status uses text label + pill color; do not rely on color alone.
- Row action menu uses Icon Button trigger + Dropdown Menu `action-menu`; menu items must have clear labels.
- 3-dot row action items are commands, not selectable options. `View record` navigates to the detail page / route instead of showing a checkmark in the menu.
- Row action menu overlays inside table/card/scroll wrappers must render through a portal / floating layer. Do not rely on `z-index` to escape `overflow-x-auto`, `overflow-hidden`, rounded scroll cards, or transformed parents.
- If a whole row is clickable, row hover may be used; if only row actions are clickable, hover only the action trigger.
- Pagination sits below the table, with summary text on the left and navigation on the right for desktop.
- Table shell uses `max-width: 100%` and `overflow: hidden` only for the rounded outer card. The actual horizontal scrolling belongs to an inner table viewport.
- The inner table viewport uses `overflow-x: auto`; it must not add extra page padding or exceed its parent card width.
- Table scrollbars must use the Scrollbar component edge inset rule: horizontal scrollbar left/right ends sit `16px` inside the card instead of touching the table/card border.
- If a table also scrolls vertically, the vertical scrollbar top/bottom ends should also be inset so the thumb does not touch rounded corners.
- Sticky columns or row action trigger cells may stay inside the same scroll container; their opened Dropdown Menu overlays must portal to a floating layer and remain anchored during horizontal and vertical scrolling.

### Mobile Table Strategy

Use one of two approaches:

| Approach | Use When |
|---|---|
| Horizontal scroll table | Many columns must remain comparable. |
| Stacked data cards | Row actions and key fields matter more than column comparison. |

Mobile cards should show only the most important fields first. Secondary metadata can be smaller, muted text.

For horizontal scroll tables, keep the page itself fixed to viewport width, show the scroll only inside the table area, and keep the pagination below the scroll area. The horizontal scrollbar track should be visually inset from both left and right edges of the table/card. For stacked cards, every card must fit `100%` of the content width, with long values wrapping or truncating inside labeled rows.

---

## Forms and Validation

Use `03-components.md` Input specs.

### Form Layout

- Single-column by default.
- Label above input for all mobile layouts.
- Horizontal label layout is allowed only for dense desktop toolbars or short labels.
- Group related fields in one card; do not nest cards inside cards.
- Required fields need visible label or helper, not just placeholder.

### Validation

| Moment | Behavior |
|---|---|
| Initial render | Do not show errors before user interaction unless server returned them. |
| On blur | Show field-level validation for invalid fields. |
| On submit | Show all blocking errors and focus the first invalid field. |
| Server error | Use Alert / Sonner depending on severity; keep user input. |

Error text must be explicit, for example `請輸入 email` or `格式不正確，請依欄位說明修正`.

---

## Dialog, Alert Dialog, Dropdown Menu, and Popover UX

### Dialog

- Use for forms or detailed editing.
- Header includes title, optional description, and close icon.
- Body scrolls internally only when viewport is too small.
- Footer actions stay visible.

### Alert Dialog

- Use for destructive or irreversible confirmation.
- Desktop actions: secondary/outline cancel left of primary/destructive confirm.
- Mobile actions: primary/destructive first, cancel below, both full width.
- Title and body must explain consequence, not just ask `確定嗎`.

### Dropdown Menu / Picker

- Use Dropdown Menu for date/month picker, select menus, user menu, and row action menu.
- Must be anchored to trigger.
- Close on outside click and Escape.
- Do not use modal dialog for simple filter pickers.
- Overlay must fit within viewport; if it cannot fit below the trigger, flip upward or align to viewport edge.
- When the trigger is inside a table, card, `overflow-x-auto`, `overflow-hidden`, rounded scroll wrapper, or transformed parent, the overlay must render through a portal / floating layer. `z-index` alone cannot fix ancestor overflow clipping.
- Portal / fixed overlays must recompute position on scroll and resize while preserving collision padding, flip, and shift behavior.
- Use `action-menu` for row commands/navigation, `select` for result/status filters, `date-picker` for date fields, `month-picker` for monthly reports, and `user-menu` for Sidebar footer account actions.
- Each Dropdown variant has its own anchoring rule. Do not position every dropdown with one generic right-aligned menu rule.
- Only `select`, `date-picker`, and `month-picker` can show selected/check states. `action-menu` never shows checkmarks for activated commands.

### Generic Popover

- Use only for lightweight custom content that is not covered by Dropdown Menu variants.
- Prefer Dropdown Menu when the content is a menu, select, date picker, or month picker.
- Generic Popover uses `var(--popover)` / `var(--popover-foreground)` and follows the same portal / floating-layer clipping rules as Dropdown Menu when opened inside scroll or clipped ancestors.

---

## Feedback States

| State | Pattern |
|---|---|
| Loading initial page | Skeleton for page sections; preserve layout dimensions. |
| Loading table refresh | Keep table shell; show row skeleton or subtle loading overlay. |
| Empty result | Empty state inside the content surface, with `--glow-empty` behind the icon only, plus a next action or filter reset. |
| Success action | Sonner success toast; keep it short. |
| Recoverable error | Inline Alert near affected area. |
| Blocking error | Alert Dialog only when user must acknowledge before continuing. |

Do not use toast for field validation. Do not use blocking dialog for normal empty states.

---

## Accessibility

- All interactive elements must be keyboard reachable.
- Hover cannot be the only visual affordance; keyboard focus and selected/current states must be equally clear.
- Focus style must be visible and must not shift layout.
- Icon-only controls require `aria-label`.
- Tooltip is not the accessible name.
- Dialog and Alert Dialog must trap focus while open and restore focus to trigger on close.
- Sidebar drawer must be dismissible with Escape and overlay click.
- Tables require semantic table markup where possible; mobile cards should still expose labels to screen readers.
- Status pills need text; color alone is insufficient.

---

## Retrofit Checklist

Before finishing any page retrofit:

- [ ] Loaded reference sections have been converted into a spec contract, and each required layout, component, token, state, RWD, accessibility, and "do not" rule is implemented, marked not applicable, or reported as blocked by missing business decisions.
- [ ] Page uses `var(--background)` for work surface and `var(--card)` for content surfaces.
- [ ] Dropdown Menu / Popover uses `var(--popover)` and renders through portal / floating layer when opened inside clipping ancestors.
- [ ] Tooltip uses `var(--popover-foreground)` background and `var(--popover)` text, with viewport collision handling.
- [ ] Sidebar/Header match `03-components.md`: desktop Sidebar is fixed with a `24px` top inset, desktop collapsed rail is `48px` icon-only, expanded logo is `208px x 72px`, desktop Header scrolls with main content, mobile Header is fixed, Mobile Drawer is a separate overlay render mode, and desktop selectors do not affect mobile drawer/header.
- [ ] Desktop collapsed to mobile resize: after shrinking below `768px`, no desktop rail remains, `.app-main` desktop left padding is removed, mobile Header appears, and the Mobile Drawer opens with logo, labels, two-line footer text, and chevron.
- [ ] Overview page content computes to `width: 100%; max-width: none; min-width: 0;` (class name is illustrative, such as `.page-content--overview` or the prototype's `.page-content--full`) and does not apply the `960px-1120px` dashboard max-width.
- [ ] Reading pages center a `1120px` group (title, article, in-page TOC) in the area beside the Sidebar. Entry pages center a `1200px` group. Header / breadcrumb stays left-aligned. A max-width group is not left-aligned with empty space only on the right.
- [ ] Stat Card grids use auto-fit/minmax behavior so mobile can show two columns when space allows and safely fall back to one column without page-level overflow.
- [ ] Primary actions use Button `primary`; secondary actions use `outline` or `secondary` intentionally.
- [ ] Forms use label + helper/error text; placeholders do not replace labels.
- [ ] Tables include loading, empty, pagination, and row action states.
- [ ] Hover states exist for enabled interactive desktop elements and are suppressed for disabled/loading states.
- [ ] Mobile layout is explicitly handled.
- [ ] No page-level horizontal overflow at `320px`, `375px`, `430px`, `768px`, `1024px`, and `1280px`.
- [ ] Any horizontal scroll is local to a table/comparison wrapper and does not move the whole page.
- [ ] No raw HEX/RGB colors in component code.
- [ ] Existing route, state, API calls, validation, permission checks, and business logic are preserved.

---

## Pattern-To-Component Map

| Pattern | Required Components |
|---|---|
| Overview | Sidebar, Header, Stat Card, Button/Icon Button, Dropdown Menu only when filters/actions are present |
| Metrics overview | Tabs, Stat Card, Button/Icon Button, Dropdown Menu `month-picker`, Pagination if list view |
| Data management | Input, Button/Icon Button, Dropdown Menu, Table, Pagination, Dialog, Sonner, Alert Dialog |
| Record detail | Header, Badge for status, Button/Icon Button, Dropdown Menu `action-menu`, Separator, Table/mobile cards if related records exist, Alert Dialog for destructive/status actions |
| Form editor | Input, Checkbox, Button, Separator, Alert/Sonner, Dialog only for small secondary edits |
| Settings | Input, Checkbox, Tabs if groups are mutually exclusive, Button, Alert, Separator |
| Review queue | Stat Card optional, Tabs/Pills, Input, Dropdown Menu `action-menu`, Table, Pagination, Alert Dialog, Sonner |

### Pattern-To-Component Map Adjustment Notes

- Only `Table` is still a pattern-level reference without a standalone section in `03-components.md`.
- `Tabs/Pills` use `03-components.md` `## Tabs` (default / pill and line variants).
- Status pills and label badges use `03-components.md` `## Badge`; choose the semantic variant from `02-foundations.md` Status Usage.
- Recommended adjustment: add a dedicated `Table` section to `03-components.md` if engineers need a reusable implementation spec. Until then, resolve `Table` from Data Management Table Rules + Scrollbar + Dropdown Menu + Pagination.
