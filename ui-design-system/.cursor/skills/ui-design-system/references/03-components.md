# 03 Components

> Source of Truth: 本文件的元件解剖、變體、狀態與尺寸是這包的元件規格。`source-reference/screenshots/Design System/` 的截圖是整理這些規格時的封存範例，新專案不必替換。專案頁面 HTML 放在 `source-reference/html/`，只決定頁面區塊與排列，不覆蓋這裡的元件尺寸。實作值用 `02-foundations.md` 的 tokens。所有尺寸皆以 4x 截圖回推 1x 設計尺寸；若截圖只能觀察到比例，本文會以 token / component intent 表示。

> 實作規則：component code 必須使用 CSS variables / Tailwind token，不可寫死 HEX。HTML 或截圖裡的色碼要對回語意 token。截圖中黑底與紫色虛線只用於當初的展示，不屬於產品 UI。

---

## Component Spec Model

Each component section defines only the component-specific contract: anatomy, variants, sizes, surfaces, states, responsive behavior, accessibility, and usage notes. Shared rules in this section apply to every component unless a component section explicitly narrows or extends them.

### Reading Order

1. Start with the target component section.
2. If the target name is ambiguous, use the Component Lookup Index below before opening other sections.
3. Apply the shared contracts below.
4. If the component is used inside a page or flow, also read the matching pattern in `04-patterns-and-ux.md`.
5. If token meaning is unclear, read only the relevant token section in `02-foundations.md`.

### Component Lookup Index

Use this index to avoid missing the correct section when user wording differs from the Figma/component heading. Keep `##` headings stable; if a heading is renamed, update this table and `SKILL.md` router together.

| User term / alias | Primary section | Also read when relevant |
|---|---|---|
| button, CTA, submit, cancel, destructive button | `## Button` | `## Icon Button` for icon-only actions |
| icon button, toolbar icon, close button, row action trigger | `## Icon Button` | `## Button`; `## Dropdown Menu` for row action menus |
| input, field, text field, file input, form field | `## Input` | `04-patterns-and-ux.md` `Forms and Validation` |
| checkbox, check, intermediate state | `## Checkbox` | `## Input` for field layout context |
| badge, status badge, status pill, label badge, chip-like status | `## Badge` | `02-foundations.md` `Status Usage` when badge represents business state |
| dropdown, menu, select, command menu, 3-dot, row action, date picker, month picker, popover picker | `## Dropdown Menu` | `04-patterns-and-ux.md` `Data Management Pattern` for table row actions |
| user menu, profile menu, sidebar footer menu, change password menu, logout menu | `## Sidebar` User Footer Menu | `## Dropdown Menu` `user-menu` overlay rules |
| popover, floating panel, floating layer | `## Dropdown Menu` for menu/picker use cases | `04-patterns-and-ux.md` `Generic Popover` for custom lightweight content |
| tabs, segmented control, filter pill | `## Tabs` | `04-patterns-and-ux.md` `Pattern-To-Component Map` for pattern-level pill usage |
| pagination, page controls | `## Pagination` | `## Icon Button` for mobile controls |
| scrollbar, scroll area, table scroll, inset scrollbar | `## Scrollbar` | `04-patterns-and-ux.md` `Data Management Pattern` |
| sidebar, navigation, mobile drawer, nav rail, app shell nav, collapsed nav tooltip | `## Sidebar` | `## Header / App Shell Block`; `## Tooltip` for desktop collapsed nav labels; `04-patterns-and-ux.md` `App Shell` |
| header, top bar, menu trigger, product label, palette switch | `## Header / App Shell Block` | `## Sidebar` |
| dialog, modal, edit modal | `## Dialog` | `## Alert Dialog` for destructive confirmation |
| confirm dialog, alert dialog, destructive confirmation | `## Alert Dialog` | `## Button` destructive variants |
| alert, inline notice, warning panel, info panel | `## Alert` | `## Sonner / Toast` for transient feedback |
| toast, sonner, notification, success message | `## Sonner / Toast` | `## Alert` for inline/blocking feedback |
| tooltip, hover label, helper bubble | `## Tooltip` | `## Icon Button` for accessible icon-only controls |
| skeleton, loading placeholder | `## Skeleton` | Target component section being skeletonized |
| separator, divider, vertical line | `## Separator` | `## Header / App Shell Block` for header separator |
| stat card, metric card, dashboard card | `## Stat Card` | `04-patterns-and-ux.md` `Metrics Overview Pattern` or `Data Management Pattern` |
| logo, wordmark, symbol | `03-components.md` `Sidebar` Logo Area | `01-source-of-truth.md` asset slots; supply SVG under `assets/logo/` |
| table, data grid | No standalone component section yet; Table is the only one. Status pills use `## Badge`, and tabs / filter pills use `## Tabs`. | Use `04-patterns-and-ux.md` `Data Management Pattern` Table Rules, `## Scrollbar`, `## Dropdown Menu`, `## Pagination`, and `## Badge` for status cells |

### Shared Component Contract

| Area | Rule |
|---|---|
| Source | Component specs come from this file. Screenshots in `source-reference/screenshots/Design System/` are archived examples only; when they differ from this file, this file wins. SVG geometry comes from `assets/`. |
| Typography | Use `var(--font-sans)` and the closest `text-styles.json` text token; do not invent font size, line-height, or weight. |
| Color | Use CSS variables / token utilities; do not hardcode HEX/RGB or introduce non-neutral Tailwind palettes by default. |
| Surface | Ordinary content components use `--card`; Dropdown / Popover use `--popover`; Tooltip uses `--popover-foreground` background and `--popover` text. |
| Radius | Small controls use `--radius-sm` or `--radius-md`; Dropdown / Alert / Sonner use `--radius-lg`; main Panel / Dialog / Stat Card / Table / Alert Dialog use `--radius-xl`. |
| Border / focus | Default border is `1px solid var(--border)`; focus must be visible and must not shift layout. Boxed Button / Icon Button / Badge focus uses `box-shadow: var(--shadow-focus-ring)`. |
| Icons | UI action icons use Lucide / Phosphor outline with `var(--stroke-width)`. Project-specific icons, when required, use SVG files from `assets/icons/`. |
| Motion | Use subtle transitions only for color, shadow, opacity, or transform where specified; never animate size in a way that shifts layout. |
| Accessibility | Interactive elements are keyboard reachable, have visible focus, and icon-only controls include `aria-label`; tooltip is not the accessible name. |

### Shared State Semantics

| State | Meaning | Shared rule |
|---|---|---|
| `default` | Resting enabled state | Use base variant tokens and dimensions. |
| `hover` | Pointer affordance only | Apply only on enabled pointer devices; do not change size, row height, icon size, or text wrapping. |
| `focus` | Keyboard/assistive navigation | Must be visible and stable; focus cannot rely on color alone. |
| `selected/current` | Persistent user or route state | Must be stronger than hover and remain visible when hovered. |
| `disabled` | Visible but unavailable | Use muted treatment, `cursor: not-allowed`, no hover style, and no active click handler. |
| `loading` | In-progress action or content | Preserve component dimensions; disable conflicting actions. |
| `destructive` | Dangerous or irreversible action | Use `var(--destructive)` and confirmation when the action changes state irreversibly. |

### Shared Responsive & Overflow Safety

- Components that participate in flex or grid layouts must support `min-width: 0` on the shrinking child, especially content areas, table wrappers, tabs, filters, stat-card grids, and dialog bodies.
- Component root elements should use `box-sizing: border-box`, `max-width: 100%`, and parent-relative sizing. Avoid nested `width: 100vw`.
- Fixed widths in this file describe desktop intent. On smaller viewports, convert them to `width: min(<desktop width>, calc(100dvw - 32px))` or `width: 100%` inside a padded parent.
- Text inside controls should either remain short, truncate with an accessible label, or wrap within its component. It must never widen a page shell.
- Local horizontal scrolling is allowed only for data-heavy tables or deliberate comparison surfaces. Scrolling must be inside a visible wrapper such as `.table-scroll`, not on `body` or the main app shell.

### Component Section Template

When adding or revising a component section, keep the information in this order so future AI agents can extract a spec contract consistently:

1. Source and component purpose.
2. Variants / anatomy.
3. Size, surface, typography, radius, border, shadow, and icon specs.
4. States and interactions.
5. Responsive / overflow rules.
6. Accessibility.
7. Usage / retrofit notes.

---

## Button

Source screenshot: `Button.png`

### Variants

| Variant | Background | Foreground | Border | 用途 |
|---|---|---|---|---|
| `primary` | `var(--primary)` | `var(--primary-foreground)` | none | 主要 CTA、下一步、送出 |
| `secondary` | `var(--secondary)` | `var(--secondary-foreground)` | none | 次要主按鈕、次要品牌 action |
| `outline` | transparent / surface | `var(--foreground)` | `1px solid var(--border)` | 取消、返回、次要 action |
| `ghost` | transparent | `var(--foreground)` | none | table row action、低干擾工具 |
| `link` | transparent | `var(--foreground)` | none | inline action |
| `link-secondary` | transparent | `var(--muted-foreground)` | none | 更弱的 inline action |
| `destructive-primary` | `var(--destructive)` | `var(--primary-foreground)` | none | 刪除、危險確認 |
| `destructive-secondary` | color-mix of `var(--destructive)` and `var(--primary-foreground)` | `var(--semantic-foreground)` | none | 次要危險 action |
| `destructive-outline` | transparent / surface | `var(--destructive-text)` | `1px solid var(--border)` | 危險取消/確認的 outline |
| `destructive-ghost` | transparent | `var(--destructive-text)` | none | table destructive row action |
| `destructive-link` | transparent | `var(--destructive-text)` | none | inline destructive action |

### Sizes

| Size | Height | Padding X | Gap | Icon | Font | Radius |
|---|---:|---:|---:|---:|---|---|
| `md` | 36px | 12px | 8px | 16px | `Text-sm/Medium` token | `var(--radius-md)` |
| `sm` | 32px | 8px | 8px | 16px | `Text-sm/Medium` token | `var(--radius-md)` |

4x screenshot observation: the filled `md` sample with two 16px icons renders as roughly `117px x 36px`; the filled `sm` sample renders as roughly `101px x 32px`. Width is content-driven, not fixed.

### Structure

```tsx
<button className="inline-flex items-center justify-center">
  <Icon aria-hidden />
  <span>Button</span>
  <Icon aria-hidden />
</button>
```

- Content is horizontally centered.
- Icon-only loading state replaces the leading icon with a spinner and keeps label visible unless the product specifically needs icon-only loading.
- Text must remain single-line; use `white-space: nowrap`.
- Button root uses `max-width: 100%`; in constrained toolbars, the toolbar wraps before any button causes viewport overflow.
- Long button labels should truncate only when the full text is available through the button `aria-label` or nearby visible context.
- On mobile, primary flow buttons use full-width layout; inline table action buttons remain compact icon/text controls inside their row or card.

### States

| State | Visual rule |
|---|---|
| `default` | Base variant style. `primary` adds `box-shadow: var(--shadow-glow)`. Other filled variants have subtle border/shadow only if the component implementation already provides it. |
| `hover` | Use variant-specific hover below; do not introduce a new color token or change size. |
| `focus` | Keep component size stable. Boxed variants (`primary`, `secondary`, `outline`, `destructive-primary`, `destructive-secondary`, `destructive-outline`) use `box-shadow: var(--shadow-focus-ring)` from Figma `Box Shadow/Focus ring` (`0 0 0 3px var(--color-muted)`). `primary` keeps its glow as a second shadow: `var(--shadow-focus-ring), var(--shadow-glow)`. Do not use outline/outline-offset for boxed Button focus. |
| `disabled` | Filled primary/secondary become muted surface with `var(--muted-foreground)` text; destructive stays visibly destructive but reduced emphasis. |
| `loading` | Spinner uses current text color; disable click; preserve button height and width as much as possible. |

### Hover Rules

| Variant | Hover visual |
|---|---|
| `primary` | Background `color-mix(in srgb, var(--primary) 92%, var(--primary-foreground))`; text remains `var(--primary-foreground)`. |
| `secondary` | Background `color-mix(in srgb, var(--secondary) 92%, var(--primary-foreground))`; text remains `var(--secondary-foreground)`. |
| `outline` | Background `color-mix(in srgb, var(--foreground) 6%, transparent)`; border becomes `color-mix(in srgb, var(--foreground) 35%, var(--border))`. |
| `ghost` | Background `color-mix(in srgb, var(--foreground) 6%, transparent)`. |
| `link` | Text underline visible; color stays `var(--foreground)`. |
| `link-secondary` | Text underline visible; color shifts toward `var(--foreground)`. |
| `destructive-primary` | Background `color-mix(in srgb, var(--destructive) 92%, var(--primary-foreground))`. |
| `destructive-secondary` | Background `color-mix(in srgb, var(--destructive) 82%, var(--primary-foreground))`. |
| `destructive-outline` | Background `color-mix(in srgb, var(--destructive) 6%, transparent)`; border becomes `color-mix(in srgb, var(--destructive) 45%, var(--border))`. |
| `destructive-ghost` | Background `color-mix(in srgb, var(--destructive) 6%, transparent)`. |
| `destructive-link` | Text underline visible; color remains `var(--destructive-text)`. |

Hover must be suppressed for `disabled` and `loading`.

### Retrofit Notes

- Primary action in login, multi-step flows, dialog continue, and form submit must use `primary`.
- Do not use blue default browser buttons.
- Destructive variants are for destructive business actions only; error display alone should use Alert / field error.

---

## Icon Button

Source screenshot: `Icon Button.png`

Icon Button mirrors Button variants but fixes width = height. It supports filled, outline, ghost, and link visual styles in normal and destructive groups.

### Sizes

| Size | Box | Icon | Radius | 用途 |
|---|---:|---:|---|---|
| `md` | 36px x 36px | 16px | `var(--radius-md)` | Toolbar default, row action trigger |
| `sm` | 32px x 32px | 16px | `var(--radius-sm)` | Dense table / filter controls |
| `xs` | 28px x 28px | 16px | `var(--radius-sm)` | Compact table actions |
| `2xs` | 20px x 20px | 12px | `var(--radius-sm)` | Inline tiny affordances only |

### Variant Rules

- `primary`, `secondary`, `outline`, `ghost`, `link` map to Button colors.
- `destructive-*` uses `var(--destructive)` for icon / fill.
- Link and ghost icon buttons have no visible box in default state.
- Filled and outline variants retain the same `box-shadow: var(--shadow-focus-ring)` focus treatment as Button. Ghost and link icon buttons do not gain a boxed surface in the component trace.
- Hover follows Button rules:
  - filled variants shift with `color-mix()`;
  - outline variants add a subtle surface fill and stronger border;
  - ghost variants add a subtle surface fill;
  - link variants keep transparent background and strengthen icon color.
- Do not enlarge the icon or button box on hover.

### Accessibility

- Icon button must have `aria-label`.
- Do not rely on tooltip as the only accessible name.
- Hit area on mobile must be at least 44px even when the visual icon button is `32px`.

---

## Input

Source screenshot: `Input.png`

The input screenshot defines two sizes (`md`, `sm`), two types (`text`, `file`), two intents (`default`, `destructive`), two layouts (`vertical`, `horizontal`), and five states (`default`, `focus-empty`, `focus-filled`, `filled`, `disabled`).

### Sizes

| Size | Input Height | Button Height | Padding X | Font | Radius |
|---|---:|---:|---:|---|---|
| `md` | 36px | 36px | 12px | `Text-sm/Regular` token | `var(--radius-md)` |
| `sm` | 32px | 32px | 10px-12px | `Text-xs/Regular` or compact `Text-sm/Regular` token | `var(--radius-sm)` |

### Base Anatomy

```tsx
<div className="field">
  <label>Label</label>
  <div className="control-row">
    <input placeholder="Email" />
    <Button size="sm">Subscribe</Button>
  </div>
  <p className="helper">Enter your email address</p>
</div>
```

### Layouts

| Layout | Rule |
|---|---|
| `vertical` | Label above control; label-control gap `8px`; helper/error below with `8px` gap. |
| `horizontal` | Label left of control; label baseline aligns with input text; label-control gap `8px`. Use only at tablet/desktop widths when label is short. |
| `with-button` | Input and button share one row with `8px` gap on desktop. Button height must match input height. |
| `file` | Use native file input styling only if it can match the screenshot: `var(--background)` input surface, internal file button, no default blue focus. |

### Colors

| Part | Default | Destructive |
|---|---|---|
| Label | `var(--foreground)` | `var(--destructive-text)` |
| Input bg | `var(--background)` | same |
| Border | `var(--border)` | `var(--destructive)` |
| Placeholder | `var(--muted-foreground)` | `var(--muted-foreground)` |
| Helper | `var(--muted-foreground)` | `var(--destructive-text)` |
| Text | `var(--card-foreground)` | `var(--card-foreground)` |

### States

| State | Rule |
|---|---|
| `default` | `var(--background)` field background, 1px border, no ring. |
| `hover` | When not focused, destructive, or disabled, border becomes `color-mix(in srgb, var(--foreground) 25%, var(--border))`; background stays stable. |
| `focus-empty` | Border/ring changes to `var(--foreground)` or `var(--ring)`; cursor visible; placeholder remains. |
| `focus-filled` | Same focus treatment, value text present. |
| `filled` | No focus ring, value text present. |
| `disabled` | Muted text, subdued border/background, no submit action, cursor not-allowed. |
| `destructive` | Error label + `var(--destructive)` border + `var(--destructive-text)` error text. Never signal error by border color alone. |

### Implementation Notes

- Placeholder is not a label replacement.
- Error message from screenshot: one line below helper position; keep line-height 16px-20px.
- Avoid browser default file input colors; normalize with component styles.
- Field roots and controls use `min-width: 0` and `max-width: 100%`.
- On mobile, `horizontal` layout converts to `vertical`.
- On mobile, `with-button` stacks input and button vertically unless the combined width fits without shrinking the input below a usable size.
- Inputs containing long emails, serial numbers, or IDs must not widen the container; use horizontal text scroll inside the input only while editing.

---

## Checkbox

Source screenshot: `Checkbox.png`

### Values

| Value | Visual |
|---|---|
| `unselected` | Empty square, transparent interior, `var(--foreground)` border. |
| `intermediate` | `var(--foreground)` filled square with horizontal minus icon. |
| `selected` | `var(--foreground)` filled square with check icon. |

### Sizes & Shape

- Control box: `16px x 16px`.
- Visual focus halo may expand to about `24px x 24px`; it must not shift layout.
- Radius: `6px` (`var(--radius-sm)`).
- Icon stroke: 1.5px, rounded caps.

### States

| State | Rule |
|---|---|
| `default` | Normal value rendering. |
| `hover` | When enabled, unselected border strengthens toward `var(--foreground)`; selected/intermediate fill may shift with `color-mix(in srgb, var(--foreground) 92%, var(--primary-foreground))`; size stays `16px x 16px`. |
| `focus` | Add visible ring around the 16px control; keep inner value unchanged. |
| `disabled` | Keep value recognizable but reduce contrast; disable pointer interaction. |

### Accessibility

- Use a real checkbox primitive or equivalent ARIA with keyboard support.
- Intermediate state must set `aria-checked="mixed"`.

---

## Badge

Source screenshot: `Badge.png`

Badge is a compact inline label for status, category, or lightweight metadata. It can be static text or an interactive filter/status chip when the product behavior requires focus and keyboard interaction.

### Variants

| Variant | Background | Foreground | Border | Use |
|---|---|---|---|---|
| `default` | `var(--primary)` | `var(--primary-foreground)` | transparent | Current or selected label, such as the ongoing period. Not for warning or pending states; use `pending`. |
| `secondary` | `var(--muted-foreground)` | `var(--semantic-foreground)` | transparent | Neutral filled label with stronger fill than `third`. |
| `third` | `var(--muted)` | `var(--card-foreground)` | transparent | Quiet label that is not a business state, such as a tag name. |
| `neutral` | `var(--muted)` | `var(--muted-foreground)` | transparent | Neutral business states: completed, unlisted, disabled, withdrawn or cancelled, and the "cold" heat level. |
| `positive` | `var(--status-positive-bg)` | `var(--status-positive-fg)` | transparent | Positive states that repeat on many rows. |
| `pending` | `var(--status-pending-bg)` | `var(--status-pending-fg)` | transparent | Pending states that repeat on many rows. |
| `hot` | `var(--status-hot)` | `var(--primary-foreground)` | transparent | The hottest level of a heat scale. |
| `destructive` | `var(--destructive)` | `var(--primary-foreground)` | transparent | Overdue or error states that need attention now. Disabled and cancelled states use `neutral`. |
| `outline` | transparent or `var(--card)` | `var(--foreground)` | `1px solid var(--semantic-border)` | Low-emphasis label or filter chip. |

Choose the variant for a business state from `02-foundations.md` `Status Usage`. The prototype classes in `source-reference/html/prototype/prototype.css` map as follows: `positive` = `.badge--pos`, `pending` = `.badge--wait`, `neutral` = `.badge--neu`, `hot` = `.badge--hot`, `destructive` = `.badge--neg`, `third` = `.badge--third`, `outline` = `.badge--outline`.

### Shape

| Shape | Radius | Rule |
|---|---|---|
| `rounded=true` | `var(--radius-full)` | Pill shape; default for status labels. |
| `rounded=false` | `var(--radius-sm)` | Compact rounded rectangle; use when many badges align in a dense table or matrix. |

### Anatomy and Size

```html
<span class="badge badge-default" data-rounded="true">Badge</span>
<button class="badge badge-outline" data-rounded="false" type="button">Badge</button>
```

```css
.badge {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  max-width: 100%;
  padding: 2px 10px;
  border: 1px solid transparent;
  font: var(--text-xs-medium);
  line-height: 16px;
  white-space: nowrap;
}

.badge[data-rounded="true"] {
  border-radius: var(--radius-full);
}

.badge[data-rounded="false"] {
  border-radius: var(--radius-sm);
}
```

- Width is content-driven; do not set a fixed badge width.
- For long labels, truncate inside the badge only when the full value remains available through adjacent context or `aria-label`.
- Badge root must use `max-width: 100%` and must not force table/card/page overflow.

### States

| State | Rule |
|---|---|
| `default` | Render variant color, shape, and text. |
| `focus` | Interactive Badge uses `box-shadow: var(--shadow-focus-ring)`; the ring expands outside without changing badge size. |
| `disabled` | Only for interactive badge/chip controls; keep the label readable and remove click handler. |

- The screenshot includes `default` and `focus` states for every variant and shape.
- Do not use hover styling for static status badges. Interactive filter badges may use a subtle color-mix hover that does not change size.
- Focus ring follows `Box Shadow/Focus ring`: `0 0 0 3px var(--color-muted)`.

### Accessibility

- Static status Badge can be a `<span>` with visible text.
- Interactive Badge must be a `<button>` or link with keyboard focus and visible focus ring.
- Do not communicate status by color alone; label text must remain explicit.

---

## Dropdown Menu

Source screenshot: `Dropdown Menu.png`  
Figma selection: Design System / Dropdown Menu, node `5244-14681`

Dropdown Menu is the shared anchored overlay pattern for row action menus, select menus, date pickers, month pickers, and user/profile menus. These are not separate visual systems: they share the same popover surface, border, radius, shadow, typography, hover/focus behavior, and collision-aware positioning.

### Variants

| Variant | Trigger | Content | Primary Use |
|---|---|---|---|
| `action-menu` | Icon Button, usually 3-dot trigger | Compact command list with leading icons; no selected checkmark | Table row actions, navigation commands, record actions |
| `select` | Field-like trigger with label and chevron | Single-column option list with selected check | Status/result filters |
| `date-picker` | Field-like trigger with placeholder/value and chevron | Calendar popover with month/year controls | Date filters, completion date |
| `month-picker` | Pill or field-like trigger with month label and chevron | Year header + 12-month grid | Monthly report and reporting period filters |
| `user-menu` | Sidebar footer user trigger | Profile row plus account commands | Sidebar footer account actions |

### Shared Overlay Surface

| Property | Spec |
|---|---|
| Background | `var(--popover)` |
| Foreground | `var(--popover-foreground)` |
| Border | `1px solid var(--border)` |
| Radius | `var(--radius-lg)` for floating card; `var(--radius-md)` for inner selected items |
| Shadow | `var(--edge-highlight), var(--shadow-lg)` |
| Padding | `8px` for compact menus; `12px-16px` for picker panels |
| Min width | Match trigger width when used as `select`. Action menus: about 150px minimum, growing with content (see Action Menu) |
| Max width | `min(360px, calc(100dvw - 32px))` unless calendar content needs slightly more |
| Z layer | Above table/card surfaces, below modal dialogs |

- Overlay must be anchored to its trigger and flip / shift to stay inside the viewport.
- Overlay root uses `max-width: calc(100dvw - 32px)` and `min-width: 0`; it must not cause page-level horizontal overflow.
- If the trigger is inside a clipping ancestor such as `overflow-x-auto`, `overflow-hidden`, rounded scroll cards, table wrappers, or a transformed parent, render the overlay through a portal / floating layer instead of as a child of that ancestor.
- `z-index` cannot escape ancestor overflow clipping. Raising `z-index` alone is not an acceptable fix for a menu clipped by a table/card/scroll wrapper.
- Portal / fixed-position overlays must recompute their position on scroll and resize, while preserving collision padding, flip, and shift behavior.
- Overlay anchoring is variant-specific. Do not apply one generic right-aligned dropdown position to action menus, select menus, pickers, and Sidebar user menus.
- Do not use Dialog for simple row actions, selects, date pickers, or month pickers.
- Close on outside click, Escape, route change, and successful command activation unless the command opens another modal.

### Action Menu

The screenshot shows a 3-dot trigger with a compact floating menu. Use this for contextual row-level actions.

| Part | Spec |
|---|---|
| Trigger | Icon Button `md`; active/open background uses `var(--primary)` with `var(--primary-foreground)` icon |
| Menu width | Minimum about 150px; grows with content and is capped by the viewport. The prototype `UI.menu` defaults to 136px when a menu does not set a width; menus with longer labels set 150px-220px. |
| Row height | 32px |
| Row padding | X 8px, Y 6px |
| Row gap | 8px between leading icon and text; keep the icon in a fixed 16px slot |
| Icon size | 16px |
| Text | `Text-sm/Regular` token |

Behavior:

- Action menu items are commands, not selectable options. Do not show a checkmark, selected row state, or persistent current value in a 3-dot action menu.
- `查看詳情` / view-detail items navigate to the record detail page or open the intended route in the app. They do not toggle a selection.
- Other action items may trigger a workflow, update state, or open a confirmation dialog depending on business logic.
- The menu closes after command activation, except when a command opens a modal/dialog that intentionally takes focus.
- If the action navigates to a new route, preserve existing routing, permission, and analytics behavior.
- Dense table row action menus must be tested in first-row, last-row, vertical scroll, and horizontal scroll states. The menu must remain fully visible and anchored to the trigger without being clipped by the table wrapper.
- Do not reuse `action-menu` positioning rules for Sidebar footer user menus; use the `user-menu` rules in the Sidebar section.

States:

| State | Rule |
|---|---|
| `default` | Text/icon use `var(--card-foreground)` or `var(--foreground)`. |
| `hover` | Row background `color-mix(in srgb, var(--foreground) 6%, transparent)`; size remains stable. |
| `focus` | Use visible focus ring or focused row background; keyboard focus must be obvious. |
| `destructive` | Text/icon use `var(--destructive-text)`; hover uses `color-mix(in srgb, var(--destructive) 6%, transparent)`. |
| `disabled` | Muted text/icon, no hover, no command action. |

There is no `selected` state for `action-menu`. `selected` with check icon belongs only to `select`, `date-picker`, and `month-picker` variants.

### User Menu

Use `user-menu` only for the Sidebar footer account menu. Its content and anchoring are defined by `## Sidebar` `User Footer Menu`; it still inherits the shared overlay surface, collision handling, portal/floating-layer behavior, focus return, outside click, and Escape dismissal rules from Dropdown Menu.

### Select Menu

The screenshot shows a label above a field trigger, then a popover aligned to the trigger width.

| Part | Spec |
|---|---|
| Label | Same as Input label: `var(--foreground)`, `Text-sm/Semi Bold` token |
| Trigger height | 36px |
| Trigger padding | X 12px |
| Trigger surface | `var(--background)` or `var(--card)` |
| Trigger border | `1px solid var(--border)`; focus uses `var(--ring)` |
| Chevron | Right aligned, 16px, follows text color |
| Content width | Same as trigger unless viewport collision requires shrink |
| Option row | 36px, X 8px, text left, check icon right |
| Selected option | `var(--primary)` background, `var(--primary-foreground)` text/icon |

- Include an optional small group label at top when shown in design.
- Option text should wrap or truncate inside the popover, never widen it.
- Select trigger must expose selected value and support keyboard open/close.

### Date Picker

Date Picker uses the same trigger styling as Select, but opens a calendar panel.

| Part | Spec |
|---|---|
| Trigger | Field-like, 36px high, chevron right |
| Calendar panel | `var(--popover)` surface, `var(--radius-lg)`, `var(--edge-highlight), var(--shadow-lg)` |
| Panel width | 250px desktop; mobile `min(100%, calc(100dvw - 32px))` |
| Header | Month/year controls centered with previous/next icon buttons |
| Weekday row | 7 columns, muted text |
| Date grid | 7 equal columns; cell size 32px |
| Selected date | `var(--primary)` background, `var(--primary-foreground)` text, rounded square/circle |
| Outside month | `var(--muted-foreground)` at reduced emphasis |

- Calendar grid must not overflow horizontally; use equal `minmax(0, 1fr)` columns.
- Keyboard navigation must support arrow keys, Page Up/Down where available, Enter/Space selection, Escape close.
- Date formatting in trigger should follow product locale; do not show raw ISO strings unless required by the domain.

### Month Picker

Month Picker is a compact year + 12-month selection panel.

| Part | Spec |
|---|---|
| Trigger | Pill or field-like control; may include a status pill and month label |
| Pill trigger height | Fixed `36px` |
| Pill trigger badge | Fixed `26px` height; vertically centered inside the 36px trigger |
| Pill trigger left inset | Badge starts `5px` from the trigger's left edge so the badge left half-circle and outer trigger left half-circle are concentric |
| Trigger color | Pill trigger uses `var(--background)` background and `var(--foreground)` text; embedded status chip reverses to `var(--primary)` background with `var(--primary-foreground)` text |
| Panel width | About 250px desktop; mobile `min(100%, calc(100dvw - 32px))` |
| Header | Year centered; previous/next icon controls at sides |
| Month grid | 4 columns x 3 rows (`橫向 4 個、縱向 3 排`) |
| Month cell | 32px height, centered text |
| Selected month | `var(--primary)` background, `var(--primary-foreground)` text, radius `var(--radius-md)` |
| Disabled/unavailable month | `var(--muted-foreground)` and no hover |

- Keep month grid inside the panel; if translated month labels are long, allow text to wrap within each cell or reduce to short labels.
- Month trigger must not exceed viewport width; long status/month text truncates inside the trigger.
- For pill triggers with a leading status badge, do not center the whole content group with symmetric padding. Preserve the `5px` left inset, `26px` badge height, and 36px trigger height so the badge does not drift right.

### Accessibility

- `action-menu`: use menu/menuitem semantics or an accessible dropdown primitive.
- `select`: use combobox/listbox semantics or an accessible Select primitive.
- `date-picker` and `month-picker`: expose selected value, current grid position, and disabled dates/months to assistive tech.
- Trigger must return focus after close.
- All menu items and picker cells must be reachable by keyboard.

---

## Tabs

Source screenshot: `Tabs.png`

Tabs have two variants: `default` pill tabs and `line` tabs. Both support `stretchLabels: true | false`.

### Default / Pill Variant

| Part | Spec |
|---|---|
| Container | Inline-flex, height 36px, padding 4px, background `var(--muted)`, border `1px solid var(--border)`, radius `var(--radius-full)`. |
| Item | Height 26px (36px minus padding and border), padding X 12px, radius full, `Text-sm/Medium` |
| Selected | Background `var(--background)` or `var(--card)`, text `var(--foreground)`, subtle shadow `var(--shadow-sm)`. |
| Unselected | Transparent, text `var(--muted-foreground)`. |

Hover for unselected pill tabs: background `color-mix(in srgb, var(--foreground) 6%, transparent)`, text shifts toward `var(--foreground)`. Selected tab keeps its selected background and may only increase shadow subtly.

### Line Variant

| Part | Spec |
|---|---|
| Container | Inline-flex with bottom border `1px solid var(--border)`. |
| Item | Height about 36px, padding X 16px, background transparent. |
| Selected | Text `var(--foreground)`, bottom indicator `2px solid var(--module)`. `--module` is the current work area and falls back to `var(--primary)`. |
| Unselected | Text `var(--muted-foreground)`. |

Hover for unselected line tabs: text shifts toward `var(--foreground)` and may show a low-emphasis bottom indicator `color-mix(in srgb, var(--primary) 45%, transparent)`. Selected tab remains unchanged except cursor feedback.

### Stretch Behavior

- `stretchLabels: false`: item width follows content.
- `stretchLabels: true`: each item uses `flex: 1`, text centered, container width fixed by parent.
- Do not mix pill and line styling in one tab list.

### Responsive / Overflow

- Tab root uses `max-width: 100%` and `min-width: 0`.
- If tabs exceed available width, prefer horizontal scrolling inside the tab list with visible affordance, not body overflow.
- When there are few short tabs, allow wrapping only if row height remains predictable and selected state stays visually clear.
- Long tab labels truncate with accessible full text; they must not push adjacent content off-screen.

---

## Pagination

Source screenshot: `Pagination.png`

Pagination has a desktop text+number navigation and a mobile icon-only control group.

### Desktop

```text
第 1-10 列，共 99 列        < 上一頁  1 2 3 4 5 6 ... 下一頁 >
```

| Part | Spec |
|---|---|
| Summary text | `Text-sm/Regular` token, `var(--muted-foreground)`. |
| Nav row | Inline-flex, align center, gap 16px. |
| Page item | `32px x 36px`, center aligned, radius `var(--radius-md)`. |
| Selected page | `var(--background)` / `var(--card)` fill, `var(--foreground)` text, border `1px solid var(--border)`, shadow `var(--shadow-sm)`. |
| Non-selected page | Transparent, `var(--foreground)` text. |
| Ellipsis | Transparent, `var(--foreground)`, no click unless opening jump menu. |
| Prev/Next text | Icon + label, `var(--foreground)`, disabled uses `var(--muted-foreground)`. |

### Hover Rules

- Non-selected page item hover: background `color-mix(in srgb, var(--foreground) 6%, transparent)`.
- Selected page hover: keep selected fill/border stable; do not darken the active page.
- Prev/Next hover: underline label or add subtle background if rendered as button.
- Mobile icon controls hover: same as Icon Button `outline`.
- Disabled controls have no hover treatment.

### Mobile

- Summary remains left.
- Controls become four icon buttons: first, previous, next, last.
- Each control: `36px x 36px`, radius `var(--radius-md)`, border `1px solid var(--border)`, `var(--card)` surface.
- Disabled arrows remain visible but muted.
- Pagination container stacks summary above controls when width is constrained.
- Page number buttons beyond the compact range are hidden or collapsed into ellipsis before causing horizontal overflow.
- Navigation labels (`上一頁`, `下一頁`) are replaced by icon-only controls on mobile.

### Position Variants

- `start`: selected first page, leading ellipsis hidden.
- `middle`: selected middle page with both surrounding numbers.
- `end`: selected last visible page, trailing ellipsis hidden.

---

## Scrollbar

Source screenshot: `Scrollbar.png`

Scrollbar controls scroll indicator visibility and custom track styling for scrollable cards, dropdown lists, tables, and the main app layout. It supports both vertical and horizontal orientations.

### Dimensions

| Part | Spec |
|---|---|
| Track width (vertical) / height (horizontal) | 8px |
| Thumb min-length | 40px |
| Thumb radius | `var(--radius-full)` |
| Track background | transparent |
| Track padding | 6px (gutter between thumb and container edge) |
| Scroll-direction end inset | 16px |

### Edge Inset Rule

For visual balance, the scrollbar must not run completely edge-to-edge inside a table, card, dropdown, or rounded panel. The track/thumb travel area needs a small inset at both ends of the scrolling direction.

| Orientation | Required Inset |
|---|---|
| Horizontal scrollbar | Left and right ends inset from the table/card edge. |
| Vertical scrollbar | Top and bottom ends inset from the table/card edge. |

- End inset is `16px` for tables, cards, boards, and rounded panels (`margin-inline: 16px` on the scrollbar track in `prototype.css`).
- The inset applies to the scrollbar track and thumb travel range, not to the table content width.
- The thumb must never touch rounded card corners, table borders, or the outer card edge.
- The cross-axis gutter between thumb and content remains small (`6px`) so the scrollbar feels integrated without overlapping content.

### Colors — Default (Light Surface)

| Part | Default | Hover | Active |
|---|---|---|---|
| Thumb | `color-mix(in srgb, var(--foreground) 15%, transparent)` | `color-mix(in srgb, var(--foreground) 35%, transparent)` | `color-mix(in srgb, var(--foreground) 45%, transparent)` |
| Track | transparent | transparent | transparent |

### Colors — Sidebar

| Part | Default | Hover | Active |
|---|---|---|---|
| Thumb | `color-mix(in srgb, var(--sidebar-foreground) 25%, transparent)` | `color-mix(in srgb, var(--sidebar-foreground) 45%, transparent)` | `color-mix(in srgb, var(--sidebar-foreground) 55%, transparent)` |
| Track | transparent | transparent | transparent |

### Transitions

- Scrollbar thumb transitions between hover/active states smoothly using a short duration `transition: background-color 0.15s ease`.

### Implementation Notes

- Use `::-webkit-scrollbar`, `::-webkit-scrollbar-track`, and `::-webkit-scrollbar-thumb` for WebKit/Blink browsers.
- Use `scrollbar-width: thin` and `scrollbar-color` for Firefox.
- Sidebar scrollable regions (`.app-sidebar`, sidebar nav) use `var(--sidebar-foreground)` instead of `var(--foreground)` for thumb color.
- Do not hide scrollbars entirely (`scrollbar-width: none`); the thumb must remain visible when content overflows.
- `scrollbar-gutter: stable` may be used on layout-critical containers to prevent content shift when scrollbars appear.
- For custom scroll area primitives, implement end inset by applying margin to the scrollbar track: horizontal uses inline margins, vertical uses block margins.
- For native scrollbars, prefer supported scrollbar track margins where available; otherwise add a dedicated scroll wrapper or subtle edge mask so the visible thumb does not visually collide with table/card edges.
- Do not fake the inset by adding extra table columns, shifting table content, or clipping usable content.

---

## Sidebar

Source screenshots: `Sidebar.png`, `Blocks.png`

Sidebar is the primary app shell component. It has collapsed desktop, expanded desktop, and mobile drawer forms.

### Sizes

| Mode | Width | Height | Radius | Notes |
|---|---:|---:|---|---|
| Desktop collapsed (`mobile=false`, `unfold=false`) | 48px | `calc(100dvh - 48px)` when the app shell uses 24px top/bottom padding | `var(--radius-xl)` | Icon rail only; desktop app-shell mode. |
| Desktop expanded (`mobile=false`, `unfold=true`) | 240px | `calc(100dvh - 48px)` when the app shell uses 24px top/bottom padding | `var(--radius-xl)` | Full logo, labels, nested nav, and user footer; desktop app-shell mode. |
| Mobile drawer (`mobile=true`, `unfold=true`) | 240px | `100dvh` | `var(--radius-xl)` on the right side when overlaid | Left overlay drawer; closed by default; exact rendering rules below. |

### Container

- Background: `var(--sidebar)`.
- Foreground: `var(--sidebar-foreground)`.
- Border: `1px solid var(--sidebar-border)`. The Sidebar stays quiet so the main content wins. Do not paint a glow on the Sidebar.
- Desktop app shell positions Sidebar with fixed `24px` top / bottom / left viewport inset; Sidebar height is derived from viewport height and must not be hardcoded.
- Mobile drawer starts from the left viewport edge with no outer padding; height is `100dvh`.
- Padding expanded: `28px` top, `16px` horizontal, `16px` bottom.
- Padding collapsed: `14px` top, centered icon column, `8px` bottom.
- Footer user control sticks to bottom.
- Mobile drawer width is 240px in the Design System component reference; app-shell implementations may clamp to `min(240px, 100dvw)` only when the viewport cannot fit the drawer.
- Sidebar must never push the main content sideways on mobile; it overlays content with a backdrop.
- Expanded desktop sidebar and main content must be in a grid/flex shell where the main region uses `min-width: 0`.

Default desktop app shells and demos use this positioning contract:

```css
@media (min-width: 768px) {
  .desktop-sidebar {
    position: fixed;
    top: 24px;
    left: 24px;
    bottom: 24px;
    width: var(--sidebar-width);
    height: calc(100dvh - 48px);
    border-radius: var(--radius-xl);
  }
}
```

### Desktop / Mobile Rendering Rules

- Desktop Sidebar and Mobile Drawer are separate render modes and must be mutually exclusive at the app-shell level.
- On mobile viewport, do not render the desktop Sidebar instance at all. Hiding only the desktop trigger, shrinking width, or reusing the desktop fixed wrapper is not sufficient.
- Desktop Sidebar must use fixed positioning with `top: 24px`, `left: 24px`, `bottom: 24px`, `height: calc(100dvh - 48px)`, and `var(--radius-xl)` on all corners for default app shells and demos.
- Do not implement the default desktop Sidebar as `position: sticky`; use sticky only when a specific product screen explicitly overrides the app-shell contract.
- Desktop collapsed Sidebar (mobile=false, unfold=false) is icon-only, not a narrow expanded Sidebar. Do not show visible text labels, nested navigation, full logo text, or the user footer's name and secondary line. Collapsed nav items should render only centered icons and keep an accessible name via aria-label, title, or equivalent.
- Do not rely on width, overflow clipping, transform, or truncation to hide collapsed desktop text. Text may remain in the DOM only if it is fully visually hidden with display: none, hidden, or an equivalent accessible pattern.
- Mobile Drawer must not inherit desktop positioning, desktop padding, desktop height, or all-corner radius.
- Mobile Drawer starts at top: 0 and left: 0, has height: 100dvh, and overlays the page content. It must not be placed inside the desktop padded app shell.
- Mobile Drawer uses width: 240px; app-shell implementations may clamp to min(240px, 100dvw) only when the viewport cannot fit the drawer.
- Mobile Drawer uses right-side radius only when overlaid from the left edge: border-top-right-radius: var(--radius-xl) and border-bottom-right-radius: var(--radius-xl). The left side must remain flush with the viewport edge and should not have visible outer rounding.
- Mobile Drawer is closed by default and opens only from an explicit mobile menu button in the page/header. The mobile menu trigger should remain on the underlying page/header, not inside the closed drawer.
- When the Mobile Drawer is open, render a dimmed backdrop behind the drawer and above page content. The backdrop should not push, resize, or horizontally shift the page.
- Clicking the backdrop, selecting a Sidebar navigation item, or pressing Escape must close the Mobile Drawer. When possible, return focus to the mobile menu trigger after Escape/backdrop close.
- Lock body/page scrolling while the Mobile Drawer is open to prevent the background page from scrolling behind the overlay.

### Desktop Collapsed to Mobile Transition

If the desktop Sidebar is collapsed and the viewport becomes mobile, the app must switch render modes, not shrink the collapsed rail into the mobile layout. A persisted `data-sidebar="collapsed"` or equivalent desktop state must be ignored by the mobile drawer.

```css
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

  .mobile-drawer {
    display: flex;
    width: min(240px, 100dvw);
  }

  .mobile-drawer .sidebar-label,
  .mobile-drawer .sidebar-user-text,
  .mobile-drawer .sidebar-user-chevron {
    display: flex;
  }

  .mobile-drawer .sidebar-logo {
    display: block;
  }
}
```

- Desktop collapsed selectors must be scoped to `.desktop-sidebar`, `[data-sidebar-scope="desktop"]`, or equivalent desktop-only roots.
- Do not write selectors like `.app-shell[data-sidebar="collapsed"] .sidebar-label` unless they are also scoped to the desktop Sidebar root.
- On mobile, the Drawer starts closed by default even if the desktop Sidebar was collapsed before the breakpoint changed.
- When the Drawer opens on mobile, full logo, labels, nested nav, two-line footer text, and footer chevron are visible.

### Logo Area

- Expanded desktop and mobile drawer: full logo lockup from `assets/logo/`, rendered at `208px x 72px`. These sizes are the example shell. Replace the SVG when adopting a project, and keep the slot unless the new design changes it.
- Expanded Sidebar width is 240px with 16px horizontal padding, so the example full logo exactly fills the 208px content width. Do not scale it down to an arbitrary width such as 174px.
- Collapsed desktop: symbol only, centered at `24px x 24px`.
- Do not recreate the logo with text. If `assets/logo/` is empty, keep the size slot and do not invent a mark.

### Navigation Item

| Part | Spec |
|---|---|
| Row height | 32px minimum |
| Padding | X 8px, Y 6px (6px + 20px line height + 6px = 32px) |
| Gap | 8px |
| Icon | 16px, `var(--nav-icon-stroke)`, `var(--nav-icon)` when the palette sets it, otherwise the color of its work area (`--module-leads`, `--module-products`, `--module-insights`) |
| Text | `Text-sm/Regular` token |
| Default | Transparent, `var(--sidebar-foreground)` |
| Active | `var(--nav-active-bg)` when the palette sets it, otherwise `color-mix(in srgb, <work area color> 12%, transparent)` background; `var(--nav-active-fg)` text, `Text-sm/Medium`, radius `var(--radius-md)` |
| Hover | `color-mix(in srgb, var(--sidebar-foreground) 8%, transparent)` |

Hover does not override active state. If an active item is hovered, keep its active background and text.

### Desktop Collapsed Nav Tooltip

When Desktop Sidebar is collapsed (`mobile=false`, `unfold=false`), nav items are icon-only. On pointer hover, show a Tooltip with the nav item's visible label text.

| Part | Spec |
|---|---|
| Applies to | Desktop collapsed Sidebar nav items only |
| Trigger | Icon-only nav item, same 32px row / centered 16px icon behavior as collapsed navigation |
| Tooltip content | Exact menu label, such as `Records`; keep it short and text-only |
| Tooltip side | `right` of the collapsed rail item, vertically centered to the trigger |
| Tooltip offset | Use Tooltip default offset; increase only enough to clear the rail edge without drifting away from the trigger |
| Tooltip tokens | Follow `## Tooltip`: `var(--popover-foreground)` background and `var(--popover)` text |

- Tooltip must not appear in desktop expanded or mobile drawer modes because labels are already visible or touch hover is unavailable.
- Tooltip is a visual supplement only. The icon-only nav item still needs an accessible name through `aria-label`, `aria-labelledby`, or an equivalent pattern.
- Tooltip must not change nav item width, row height, icon position, Sidebar width, or page layout.
- Active nav item keeps active styling while hovered; tooltip appears without replacing the active state.
- Keyboard focus should keep the nav item's visible focus treatment. Showing the same tooltip on focus is allowed, but the tooltip must not be the only accessible name.
- Tooltip collision handling follows `## Tooltip`; if there is not enough room on the right edge, it may flip or shift within the viewport.

### Nested Navigation

- Nested items indent under parent by roughly 32px.
- Vertical guide line uses `var(--sidebar-foreground)`.
- Nested text remains same size or one step quieter; avoid extra icons per child unless shown in design.

### User Footer

| Mode | Trigger box | Content | Default / hover / open |
|---|---|---|---|
| Desktop expanded | Height 52px, width 100%, padding X 8px Y 8px, gap 8px | 32px avatar + text column | Default transparent; hover subtle sidebar foreground mix; open uses active sidebar colors. |
| Desktop collapsed | `32px x 32px`, padding 0, centered | 32px avatar only | Default transparent; hover subtle sidebar foreground mix; open uses active sidebar colors. |
| Mobile drawer | Height 52px, width 100%, padding X 8px Y 8px, gap 8px | 32px avatar + text column | Default transparent; hover subtle sidebar foreground mix; open uses active sidebar colors. |

Expanded desktop and mobile drawer footer trigger structure:

```html
<button class="sidebar-user-trigger" type="button" aria-expanded="false">
  <span class="sidebar-avatar" aria-hidden="true"></span>
  <span class="sidebar-user-text">
    <span class="sidebar-user-name">Alex</span>
    <span class="sidebar-user-meta">Workspace</span>
  </span>
  <span class="sidebar-user-chevron" aria-hidden="true"></span>
</button>
```

```css
.sidebar-user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-user-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.sidebar-user-chevron {
  flex: 0 0 auto;
  margin-left: auto;
}

.desktop-sidebar[data-state="collapsed"] .sidebar-user-trigger {
  width: 32px;
  height: 32px;
  padding: 0;
  justify-content: center;
}

.desktop-sidebar[data-state="collapsed"] .sidebar-user-text,
.desktop-sidebar[data-state="collapsed"] .sidebar-user-chevron {
  display: none;
}
```

- Avatar: circular `32px`, background `var(--primary)`, foreground `var(--primary-foreground)`.
- Expanded and mobile footer text is a column/block flow: primary line on one line, secondary line on the next. Do not keep the two lines as inline spans.
- Expanded and mobile footer include a trailing chevron slot. It uses `margin-left: auto` and `flex: 0 0 auto` so it stays at the far edge without compressing the text column.
- Primary line: `Text-sm/Semi Bold`; secondary line: `Text-xs/Regular`.
- Collapsed footer trigger must remove expanded padding, gap, text, and chevron so the avatar remains visually centered in the 48px rail.
- User footer hover: background `color-mix(in srgb, var(--sidebar-foreground) 8%, transparent)`.
- User footer open state is controlled by `aria-expanded="true"` or equivalent state, not by hover alone.

### User Footer Menu

The Sidebar footer menu is a `Dropdown Menu` `user-menu` variant. It is an account/profile menu, not a table row `action-menu`.

| Mode | Anchor / placement | Width | Content |
|---|---|---|---|
| Desktop expanded/collapsed | Opens to the right of the Sidebar footer trigger; bottom edge aligns with the trigger. | Content-driven, about 180px-220px, capped by viewport. | Profile row, `變更密碼`, `登出`. |
| Mobile drawer | Opens above the footer trigger inside the drawer area; aligned to drawer content width. | Match drawer content / trigger width unless collision handling requires shrink. | Profile row, `變更密碼`, `登出`. |

- Surface: `var(--popover)`, foreground `var(--popover-foreground)`, border `var(--border)`, radius `var(--radius-lg)`, shadow `var(--edge-highlight), var(--shadow-lg)`.
- Menu rows are about 36px high with X 8px padding and `Text-sm/Regular` token.
- `登出` may use destructive text treatment if the product treats it as a destructive account action.
- The menu must close on outside click, Escape, successful command activation, or route change; focus returns to the footer trigger.

### Selector Scope

- Desktop collapsed styles must be scoped to the desktop Sidebar root, such as `.desktop-sidebar`, `[data-sidebar-scope="desktop"]`, or an equivalent component root.
- Do not write broad selectors such as `.app-shell[data-sidebar="collapsed"] .user-text`, `.sidebar-label`, or `.sidebar-logo` if they can affect the Mobile Drawer.
- Breakpoint changes must reset the layout contract: desktop collapsed app state cannot keep `.app-main` padded for a 48px rail on mobile, and cannot hide Mobile Drawer labels, logo, footer text, or chevron.
- Mobile Drawer must not inherit desktop collapsed hiding, footer centering, logo hiding, width, padding, or transform rules.
- Header desktop toggle styles must be scoped to the desktop Header control and must not resize the mobile menu trigger.

### Implementation Notes

- QA desktop collapsed: no visible or clipped labels, nested labels, full logo text, or user footer text (name and secondary line); only centered icons remain visible.
- QA desktop collapsed accessibility: nav items remain keyboard focusable and keep accessible names.
- QA desktop collapsed hover: hovering an icon-only nav item shows a right-side Tooltip with that menu label; the tooltip does not resize the Sidebar or replace the accessible name.
- QA desktop expanded: full logo renders `208px x 72px`; footer text renders as two lines beside a centered 32px avatar.
- QA desktop fixed: after page scroll, the desktop Sidebar top inset remains `24px`; the Sidebar is not sticky.
- QA desktop collapsed footer: trigger is `32px x 32px`, avatar is centered, and no expanded padding/gap remains.
- QA desktop/mobile expanded footer: avatar, two-line text column, and chevron slot align in one row; the chevron stays at the far edge.
- QA mobile closed: no desktop Sidebar instance is visible or occupying layout space; page shows only mobile Header/menu trigger and content.
- QA desktop-collapsed-to-mobile resize: start from desktop collapsed, resize below `768px`, then confirm desktop rail is gone, `.app-main` has no desktop left padding, mobile header is visible, and mobile drawer opens with logo, labels, two-line footer text, and chevron.
- QA mobile open: drawer starts at `left: 0`, `top: 0`, uses `height: 100dvh`, has no desktop inset, applies right-side radius only, renders backdrop, and does not push the page horizontally.
- QA mobile drawer: desktop collapsed selectors do not hide the mobile drawer logo, labels, or footer text.
- QA mobile interactions: backdrop click, nav item click, and Escape close the drawer; body scroll is locked while open; focus returns to the menu trigger when possible.

---

## Header / App Shell Block

Source screenshot: `Blocks.png`

Header is the top app-shell control row paired with Sidebar. It contains the sidebar/menu toggle, a vertical separator, the product label, and optional page/header actions.

### Structure

* Header height: about `48px`.
* Content order: sidebar/menu toggle icon button, vertical separator, product label, then optional actions. The example label is `App`; replace it with the adopting project's name.
* Toggle button: icon-only control using the mode-specific sizes below and Icon Button hover/focus rules.
* Separator: vertical, `1px` wide, about `16px` tall, background `var(--border)`.
* Product label: `Text-base/Medium`, `var(--foreground)`.
* Header content uses `min-width: 0`; product labels, breadcrumbs, and actions must truncate, wrap, or collapse before causing horizontal overflow.
* Header icon buttons use Icon Button hover rules; do not apply hover to the entire header bar.

### Palette Switch

* Header actions order: search, palette switch, notifications.
* The palette switch is an Icon Button with the Lucide `palette` icon and the label `介面配色`. It opens a Dropdown Menu aligned to the end of the trigger, on desktop and mobile alike.
* The menu has a `Text-xs/Regular` muted heading, then one `menuitemradio` row per palette. Each row has a 16px round swatch (`--theme-swatch-*`, `1px solid var(--border)`), the palette name, and a check icon on the right for the current palette. Unlike `action-menu`, this menu may show a current value.
* Choosing a palette applies it immediately with no reload, closes the menu, returns focus to the trigger, and shows an info Sonner. Every role can switch. Rules are in `02-foundations.md` `海港晴光 Harbor Sun`.
* The main page header has the same control to the left of the sign-in button. The public share page has none.

### Toggle Button Sizes

| Mode | Button box | Icon size | Scope rule |
|---|---:|---:|---|
| Desktop Header sidebar toggle | `30px x 30px` | `20px x 20px` | Scope to the desktop Header toggle only, such as `.desktop-header [data-sidebar-toggle]`. |
| Mobile Header menu trigger | Compact icon-only control; preserve the mobile Header spacing | Follow Icon Button compact sizing and keep a mobile hit area of at least 44px when possible | Must not inherit desktop toggle width, height, or icon-size selectors. |

- Do not use one global selector such as `#toggleSidebar` for both desktop and mobile unless it is further scoped by Header mode.
- The visual button may be compact, but the interactive hit area must remain accessible on touch devices.

### Desktop Behavior

* Desktop Header is part of the normal app-shell content flow and scrolls with the page.
* Desktop Header should align with the main content region created beside the Sidebar.
* Desktop Header should not be implemented as a fixed/sticky viewport bar unless a specific product screen explicitly requires it.
* Desktop Header should not draw an extra card-like surface. Use transparent background by default so the page background remains visible.
* Desktop sidebar toggle uses the same icon-only interaction pattern as mobile, but its dimensions follow `Toggle Button Sizes`; do not use a text button such as `收合 Sidebar` / `展開 Sidebar` in the default app-shell Header.
* When Sidebar changes between collapsed and expanded desktop states, the Header follows the main content layout. Do not manually fix the Header to viewport coordinates unless the whole app shell is intentionally fixed.

### Mobile Behavior

* Mobile Header is fixed to the top of the viewport: `top: 0`, `left: 0`, `right: 0`, height about `48px`.
* Mobile Header uses `var(--background)` so content scrolling underneath does not visually collide with the header.
* Mobile Header may include a subtle bottom border using `var(--border)` when needed to separate it from scrolling page content.
* Mobile Header contains the menu trigger that opens the Mobile Drawer. The trigger remains on the page/header when the drawer is closed.
* Page content must reserve top spacing for the fixed Mobile Header so content is not hidden underneath it.

### App Shell Relationship

* Main app shell uses `Sidebar + Header + Content`; page content sits on `var(--background)`.
* Expanded desktop Sidebar and main content must be in a grid/flex shell where the main region uses `min-width: 0`.
* Header actions wrap or collapse into a menu on mobile.
* Header must not create page-level horizontal overflow in either desktop or mobile mode.

### Implementation Notes

* Confirm desktop Header scrolls with the page and is not fixed at the viewport top.
* Confirm mobile Header remains fixed at the viewport top while the page scrolls.
* Confirm desktop Header has no extra solid background/card surface beyond the page background.
* Confirm the sidebar/menu toggle is icon-only on both desktop and mobile.
* Confirm desktop Header toggle is `30px x 30px` with a `20px x 20px` icon and does not resize the mobile menu trigger.
* Confirm a vertical separator appears between the toggle button and the product label.
* Confirm Header width follows the main content area on desktop and full viewport width on mobile.
* Confirm mobile content is padded below the fixed Header.

---

## Dialog

Source screenshot: `Dialog.png`

General dialog is a large `var(--card)` panel with close icon, title, description, form fields, and footer actions.

### Container

| Property | Spec |
|---|---|
| Width | Desktop about 420px-460px for form dialogs; may scale wider only if content requires. |
| Max width | `calc(100dvw - 32px)` |
| Background | `var(--card)` |
| Border | `1px solid var(--border)` |
| Radius | `var(--radius-xl)` |
| Shadow | `var(--edge-highlight), var(--shadow-lg)` |
| Padding | 24px |

### Content

- Title: `text-lg/Semi Bold`, `var(--foreground)`.
- Description: `text-sm/Regular`, `var(--muted-foreground)`, margin-top 12px.
- Close icon: `28px x 28px` ghost icon button, top-right, radius `var(--radius-sm)`, 16px icon. It is smaller than Icon Button `md`; do not use the 36px box here.
- Form field spacing: 16px between fields.
- Footer actions: horizontal on desktop, right aligned, gap 12px; stack on mobile.
- Close icon hover uses Icon Button `ghost`; footer buttons use Button hover rules.
- Dialog body uses `min-width: 0`; long form values, helper text, and uploaded file names wrap/truncate within the dialog.
- Dialog may scroll vertically inside the viewport, but must not create horizontal viewport overflow.

### Mobile

- Dialog width: `min(100%, calc(100dvw - 32px))`.
- Actions stack full-width: primary first, secondary below, matching alert dialog mobile behavior.

---

## Alert Dialog

Source screenshot: `Alert Dialog.png`

Alert Dialog is for confirmation and irreversible/important decisions. It has desktop and mobile layouts.

### Desktop Layout

| Property | Spec |
|---|---|
| Width | about 512px |
| Padding | 24px |
| Radius | `var(--radius-xl)` |
| Border | `1px solid var(--border)` |
| Shadow | `var(--edge-highlight), var(--shadow-lg)` |
| Title alignment | Left |
| Body alignment | Left |
| Actions | Right aligned horizontal row |

- Title: `Text-lg/Semi Bold`, `var(--foreground)`.
- Body: `Text-sm/Regular`, `var(--muted-foreground)`.
- Buttons: `md`, secondary/outline cancel on left, primary continue on right.
- Alert Dialog buttons use Button hover rules; the dialog card and overlay do not have hover states.

### Mobile Layout

- Same card styling, width `min(100%, calc(100dvw - 32px))`.
- Title and body centered.
- Actions stack full-width with `primary` first and `outline` below.
- Button height 36px on mobile when used as full-width confirmation.
- Alert Dialog content wraps inside the card; do not shrink text below readable sizes just to keep desktop button rows.

---

## Alert

Source screenshot: `Alert.png`

Alert is an inline information panel, not a modal. The screenshot shows two supported content structures: a title with a bullet list, and a title with grouped subtitle/list sections.

### Anatomy

```text
Alert
├── icon
└── content
    ├── title
    ├── optional subtitle
    └── bullet list
```

### Container

- Background: `var(--card)`.
- Border: `1px solid var(--border)`.
- Radius: `var(--radius-lg)`.
- Shadow: `var(--edge-highlight)` only.
- Padding: X 16px, Y 12px.
- Gap between icon and content: 12px.
- Icon: 16px, `var(--foreground)`.

### Layout

The Alert layout follows the selected frame structure in `Alert.png`: a fixed icon column on the left and a content column on the right.

| Region | Structure | Alignment |
|---|---|---|
| Root | 2-column grid: 16px icon + flexible content | Icon aligns to the first title row; content uses `min-width: 0`. |
| Title row | Main alert title | Full content-column width, first row. |
| Section | Optional subtitle followed by body/list | Sections stack vertically under the title. |
| Subtitle row | Section heading | Full content-column width, aligned with body/list. |
| Body/list frame | Bullet list or body text | Indentation starts inside the content column, never under the icon. |

The grouped Alert specimen may repeat `Subtitle + Body/list` sections. Keep row order stable and do not collapse section spacing into one paragraph block.

### Typography

- Title: Use closest `Text-sm/Medium` token, `var(--foreground)`.
- Subtitle: `Text-sm/Regular` token, `var(--foreground)`.
- Body/list: `Text-sm/Light`, `var(--foreground)`. Use bullet lists for the screenshot-matched Alert patterns; avoid inventing unrelated status variants unless product content requires them.
- List indentation should align under content text, not under the icon.
- Alert itself is non-interactive and has no hover state. If an Alert contains an action, only that action gets Button / Link hover.

---

## Sonner / Toast

Source screenshot: `Sonner.png`

Toast cards are `var(--card)` floating notices with `var(--shadow-md)`. The screenshot set includes action/default, success, info, warning, destructive, and loading states.

### Container

| Property | Spec |
|---|---|
| Width | 360px desktop; mobile `min(100%, calc(100dvw - 32px))` |
| Min height | 52px-70px |
| Padding | 16px |
| Radius | `var(--radius-lg)` |
| Background | `var(--card)` |
| Border | `1px solid var(--border)` |
| Shadow | `var(--edge-highlight), var(--shadow-md)` |
| Layout | Horizontal, icon/content left, optional action right |

### Variants

| Variant | Icon / Accent | Text |
|---|---|---|
| `default` | none or neutral | Title `Text-sm/Medium`,`var(--foreground)`, timestamp/body `Text-xs/Regular`,`var(--muted-foreground)` |
| `success` | `var(--color-green)` icon | Title `var(--foreground)` |
| `info` | `var(--foreground)` | `var(--foreground)` |
| `warning` | `var(--color-amber)` | Title remains `var(--foreground)` |
| `destructive` | `var(--color-red)` | Title `var(--destructive-text)` |
| `loading` | spinner `var(--foreground)` | `var(--foreground)` |

### Action

- Action button in toast uses `primary`, compact height around 32px.
- Do not put more than one action in a toast.
- Toast card itself has no hover state unless it is explicitly clickable. Toast action and close buttons use Button / Icon Button hover.
- Toast viewport must be inset from both sides on mobile and must not use a fixed 360px width below available viewport.

---

## Tooltip

Source screenshot: `Tooltip.png`

Tooltip supports `top`, `bottom`, `left`, and `right` sides with a small arrow.

| Property | Spec |
|---|---|
| Background | `var(--popover-foreground)` |
| Foreground | `var(--popover)` |
| Padding | Y 6px, X 8px |
| Radius | `var(--radius-md)` |
| Font | `Text-xs/Regular` token |
| Arrow | about 5px, same color as tooltip background |
| Max width | 240px before wrapping |
| Position | Offset from trigger by about 4px on the selected side; arrow points to trigger center |

- Tooltip is for short labels/help only.
- Do not put interactive controls inside Tooltip.
- For icon buttons, tooltip supplements `aria-label`; it is not the accessible name.
- For desktop collapsed Sidebar nav items, tooltip shows the hidden nav label on hover/focus as a visual supplement; the nav item still needs its own accessible name.
- Tooltip collision handling must keep the tooltip within the viewport; flip side or reduce max width before overflowing horizontally.
- Tooltip width should be content-sized up to max width, not full trigger width. Left/right tooltips need enough horizontal room or must flip to top/bottom on narrow containers.
- Tooltip is the semantic overlay exception: do not use `var(--popover)` as its background. Its background is `var(--popover-foreground)`, and its text is `var(--popover)`. On this light palette that is a dark tooltip with light text.

---

## Skeleton

Source screenshot: `Skeleton.png`

Skeleton variants include `line` and `card`.

### Line Skeleton

- Avatar circle: about `56px x 56px`, radius full.
- First line: height 20px, width around 240px.
- Second line: height 20px, width around 180px.
- Gap: 16px between avatar and lines; 12px between lines.

### Card Skeleton

- Image block: large rounded rectangle, radius `var(--radius-lg)`, muted fill.
- Text bars: height 16px-20px, widths `100%` and `80%`.
- Use `var(--muted)` for all skeleton fills.

### Motion

- Use the two-token fill cycle from `var(--muted)` to `color-mix(in srgb, var(--muted) 44%, var(--card))`, then back to `var(--muted)`.
- The cycle may be implemented as a soft horizontal gradient animation; keep the motion subtle and avoid high-contrast shimmer.
- Skeleton shape must match the loading content layout.

---

## Separator

Source screenshot: `Separator.png`

- Horizontal separator: `height: 1px`, width follows parent, background `var(--border)`.
- Vertical separator: `width: 1px`, height follows parent, background `var(--border)`.
- Document and gallery examples should present horizontal and vertical separators as separate variants, not one combined specimen.
- Do not use shadows or extra spacing inside the separator itself; spacing belongs to surrounding layout.

---

## Stat Card

Source screenshot: `Stat Card.png`

Stat card appears in two densities: basic metric and metric with trend.

### Container

| Property | Spec |
|---|---|
| Min width | 144px |
| Reference width | 232px desktop specimen; yields an approx. 182px content column with 24px padding and border |
| Padding | 24px |
| Background | `var(--card)` |
| Border | `1px solid var(--border)` |
| Radius | `var(--radius-xl)` |
| Shadow | `var(--edge-highlight), var(--shadow-xs)` |

### Layout

The Stat Card layout follows the selected frame structure in `Stat Card.png`.

| Region | Structure | Size / Alignment |
|---|---|---|
| Heading row | Title on the left, icon on the right | 24px minimum row height; title fills remaining width; icon is 20px |
| Value row | Metric value below heading | 28px row height; fills the content column |
| Meta group | Trend line above supporting text | 46px group height in the reference specimen; appears only for the trend density |
| Vertical spacing | Heading to value, then value to meta | 8px between heading and value; 24px before the meta group |

The desktop reference specimen uses a content column of about 182px. In responsive grids, keep the same internal order and spacing, but allow the card width to shrink with its parent before causing overflow.

### Content

- Title: `Text-sm/Regular` token, `var(--muted-foreground)`.
- Value: `Text-xl/Semi Bold` token, `var(--card-foreground)`.
- Icon: top-right, 20px. Icon color follows what the metric means, not the card's position in the grid:

| Metric meaning | Icon color | Prototype class |
|---|---|---|
| Default (counts and other metrics without a status meaning) | `var(--primary)` | none |
| Positive result, such as a win rate | `var(--stat-icon-pos)` | `.stat-card--pos` |
| A 客戶線索 work-area metric, such as first follow-up time | `var(--stat-icon-leads)` | `.stat-card--leads` |
| Overdue or error count | `var(--color-red)` | `.stat-card--neg` |

The prototype sets the class in `UI.statCard` (`source-reference/html/prototype/ui.js`) from the metric title. `--stat-icon-pos` (default `var(--color-green)`) and `--stat-icon-leads` (default `var(--color-orange)`) are defined in `tokens.css`, so another palette can override them. Do not color icons with `nth-child` or by position. Red is only for overdue or error metrics.
- Trend: `Text-sm/Medium` token, `var(--card-foreground)`.
- Supporting text: `Text-sm/Regular` token, `var(--muted-foreground)`.

### Usage

- In dense dashboards, scale typography down proportionally but keep hierarchy: title < value < trend.
- In responsive grids, use `minmax(0, 1fr)` or a card width that can shrink below desktop min width on narrow screens.
- On mobile, do not force stat cards to one column. Use an auto-fit grid so mobile can show two columns when space allows and safely fall back to one column on narrow screens:
  `grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));`.
- Stat Card grids must not create page-level horizontal overflow; card titles, values, and supporting text truncate or wrap inside the card.
- Non-clickable stat cards have no hover state.
- Clickable stat cards may use `box-shadow: var(--shadow-xl)` and border `color-mix(in srgb, var(--foreground) 25%, var(--border))` on hover, but must also be keyboard focusable.

---

## Component-To-Source Map

| Component | Screenshot | SVG / Asset Source |
|---|---|---|
| Button | `source-reference/screenshots/Design System/Button.png` | - |
| Icon Button | `source-reference/screenshots/Design System/Icon Button.png` | - |
| Input | `source-reference/screenshots/Design System/Input.png` | - |
| Checkbox | `source-reference/screenshots/Design System/Checkbox.png` | - |
| Badge | `source-reference/screenshots/Design System/Badge.png` | - |
| Dropdown Menu | `source-reference/screenshots/Design System/Dropdown Menu.png` | - |
| Tabs | `source-reference/screenshots/Design System/Tabs.png` | - |
| Pagination | `source-reference/screenshots/Design System/Pagination.png` | - |
| Scrollbar | `source-reference/screenshots/Design System/Scrollbar.png` | - |
| Sidebar / App Shell | `source-reference/screenshots/Design System/Sidebar.png`, `source-reference/screenshots/Design System/Blocks.png` | `assets/logo/` when the project supplies a logo |
| Dialog | `source-reference/screenshots/Design System/Dialog.png` | - |
| Alert Dialog | `source-reference/screenshots/Design System/Alert Dialog.png` | - |
| Alert | `source-reference/screenshots/Design System/Alert.png` | - |
| Sonner / Toast | `source-reference/screenshots/Design System/Sonner.png` | - |
| Tooltip | `source-reference/screenshots/Design System/Tooltip.png` | - |
| Skeleton | `source-reference/screenshots/Design System/Skeleton.png` | - |
| Separator | `source-reference/screenshots/Design System/Separator.png` | - |
| Stat Card | `source-reference/screenshots/Design System/Stat Card.png` | - |
