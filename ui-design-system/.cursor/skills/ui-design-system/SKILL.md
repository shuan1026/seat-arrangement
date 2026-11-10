# UI Design System Skill

## Purpose
Cursor, Claude Code, and Codex enter through `AGENTS.md`. This file is the specification. This skill guides the AI to implement UI from this design-system package. The current codebase UI is not the visual source of truth. Page layout for a new project comes from HTML files in `source-reference/html/`. Component shape, states, and dimensions come from `03-components.md`. Color, type, spacing, radius, and shadow come from the semantic tokens. Design System screenshots and Figma links are archived examples of this component library. Do not require a Figma export when adopting a new project.

## Operating Workflow
Run the skill in this order:
1. **Locate**: classify the request and load only the smallest relevant reference sections.
2. **Execute**: convert loaded sections into a spec contract and implement against it.
3. **Verify**: check required tokens, layout, states, RWD, accessibility, and business-logic preservation.
4. **Report**: summarize modified components, preserved logic, and spec coverage.

## Progressive Loading
Do not read every reference file by default. First classify the user request, then load only the minimum reference sections needed for that task.
1. Identify the task type: `component`, `page/flow`, `html-page`, `retrofit`, `QA/review`, `token/gallery`, `asset/source`, or `package/docs`.
2. Identify the target UI surface or component names from the request and current code: examples include `Dropdown Menu`, `Table`, `Header`, `Sidebar`, `Input`, `Dialog`, `Alert`, `Sonner`, `Tooltip`, `Overview`, `Data Management`.
3. For a page, flow, or retrofit, look in `source-reference/html/` before opening screenshots. Match the filename or the `<!-- page: ... -->` comment. If a file matches, read it and inventory its regions, copy, and arrangement. Then load only the `03-components.md` sections for components those regions use. Map HTML colors, type, and spacing back to semantic tokens. Do not copy inline styles into product code.
4. Use heading search before opening long files:
   - `rg -n "^## " <root>/.cursor/skills/ui-design-system/references/03-components.md`
   - `rg -n "^## |^### " <root>/.cursor/skills/ui-design-system/references/04-patterns-and-ux.md`
   - Resolve `<root>` as described in `AGENTS.md` (`.` or `ui-design-system/`) before running these commands.
   - If the component name is ambiguous, read `03-components.md` `Component Lookup Index` first.
   - Then read only the relevant section slice, from the matching heading to the next same-level heading.
5. Expand context only when the first section leaves a concrete unanswered question.
6. Read `01-source-of-truth.md` only for source-priority disputes, asset authority, HTML versus component-spec conflicts, or when the user asks what source wins.
7. Do not inspect screenshots by default. Screenshots are archived component-library examples. Open `source-reference/screenshots/` images only when the reference text is insufficient, the task is visual QA of a component, or there is a concrete visual mismatch to resolve. Project HTML wins for page layout.

## Reference Boundaries
| File | Responsibility | Do not use it for |
|---|---|---|
| `01-source-of-truth.md` | Source priority, asset authority, HTML versus component-spec conflicts | Routine component lookup |
| `02-foundations.md` | Tokens, color, typography, spacing, radius, shadows, RWD foundation | Component anatomy or page composition |
| `03-components.md` | Component anatomy, variants, states, dimensions, accessibility | Page-level workflow decisions |
| `04-patterns-and-ux.md` | Page composition, feature-unit patterns, app shell usage, page UX, responsive behavior | Exact component dimensions when `03` has them |
| `05-retrofit-and-qa.md` | Retrofit order, business-logic preservation, QA checklist | Visual source of truth |
| `06-token-gallery.md` | Token gallery usage, generated token outputs, mechanical verification | Product UI rules |

## Reference Router
| Task need | Load first | Load only if needed |
|---|---|---|
| Project HTML page | Matching file in `source-reference/html/` | `03-components.md` sections for components that HTML uses; `04-patterns-and-ux.md` only for interaction rules the HTML does not specify |
| One primitive component | Relevant `03-components.md` section only | `02-foundations.md` token section if token meaning is unclear |
| Badge / status badge / chip-like label | `03-components.md` `Badge` section | `02-foundations.md` `Status Usage` when the Badge represents a business state |
| Dropdown / Popover / Date / Month / Row actions | `03-components.md` `Dropdown Menu` section | `04-patterns-and-ux.md` `Data Management Pattern` or `Dropdown Menu / Picker` for table/page behavior |
| Header / Sidebar / App shell | `03-components.md` `Sidebar` and `Header / App Shell Block` | `04-patterns-and-ux.md` `App Shell` for page composition; `03-components.md` `Tooltip` when implementing desktop collapsed Sidebar nav labels |
| Sidebar footer user menu | `03-components.md` `Sidebar` User Footer and User Footer Menu | `03-components.md` `Dropdown Menu` `user-menu`; `04-patterns-and-ux.md` `Dropdown Menu / Picker` |
| HTML/demo page with Sidebar, Header, or Dropdown | `03-components.md` `Component Lookup Index`, then every component section actually rendered | `04-patterns-and-ux.md` page/app-shell pattern; `05-retrofit-and-qa.md` QA Checklist `App Shell Demo Details` |
| Overview / authenticated workbench | `04-patterns-and-ux.md` `Overview Pattern` | `03-components.md` `Sidebar`, `Header / App Shell Block`, `Stat Card` |
| Dashboard/stat overview grid | `03-components.md` `Stat Card` | `04-patterns-and-ux.md` `Metrics Overview Pattern`, `Overview Pattern`, and `Horizontal Overflow Prevention` |
| Forms | `03-components.md` `Input`, `Checkbox`, `Button` | `04-patterns-and-ux.md` `Forms and Validation` |
| New feature unit with no project HTML | `04-patterns-and-ux.md` `New Feature Unit Composition` | Then the selected base pattern and only the `03-components.md` sections actually used |
| Data table page | `04-patterns-and-ux.md` `Data Management Pattern` | `03-components.md` `Dropdown Menu`, `Pagination`, `Scrollbar`, `Input`, `Button`, `Stat Card` as used |
| Metrics / period summary | `04-patterns-and-ux.md` `Metrics Overview Pattern` | `03-components.md` `Tabs`, `Stat Card`, `Dropdown Menu`, `Pagination` |
| Retrofitting existing code | Target component/page refs above + `05-retrofit-and-qa.md` | `01-source-of-truth.md` only if current UI conflicts with final sources |
| QA / review | `05-retrofit-and-qa.md` + specific component/page refs | `06-token-gallery.md` for gallery verification only |
| Token provenance / gallery | `06-token-gallery.md` | `02-foundations.md` only for semantic token meaning |
| Project logo or icon assets | `01-source-of-truth.md` asset slots | `03-components.md` `Sidebar` for example lockup sizes |

## Known Page Routing
If `source-reference/html/` has a file for the page, that HTML decides regions, copy, and arrangement. Use the table below only when no project HTML matches. Component sections still come from `03-components.md`.

| Page / feature | Load first | Component sections usually needed |
|---|---|---|
| Overview / workbench | `04` `Overview Pattern` | Sidebar, Header, Stat Card, Dropdown Menu only when filters/actions are present |
| Metrics / period summary | `04` `Metrics Overview Pattern` | Tabs, Stat Card, Dropdown Menu `month-picker`, Pagination when list-like |
| Record list / data table | `04` `Data Management Pattern` | Input, Button/Icon Button, Dropdown Menu, Scrollbar, Pagination, Alert Dialog when destructive |
| Form / guided task | `04` `Forms and Validation` or `Form Editor Pattern` | Input, Checkbox, Button, Dialog or Alert |
| New / unknown feature | `04` `New Feature Unit Composition` | Load only the component sections implied by the chosen base pattern |

## Spec Execution Protocol
After loading the relevant reference section, treat it as an implementation contract, not inspiration.
1. Extract a short spec contract before coding:
   - required layout / structure;
   - when project HTML exists, each HTML region mapped to a `03-components.md` component;
   - required components and variants;
   - required tokens for surface, typography, radius, border, shadow, icon, and state;
   - required interaction states: default, hover, focus, disabled, loading, selected/current, empty, error, success, destructive, and mobile behavior when applicable;
   - explicit "do not" rules from the loaded section.
   - for App Shell work, explicitly list desktop expanded, desktop collapsed, and mobile drawer/header rules before writing CSS.
2. Implement against that contract. Do not substitute current-code styling, browser defaults, unlisted colors, or ad hoc component shapes.
3. If a loaded section includes tables, bullet lists, state rules, mobile rules, or accessibility notes, each category must be reflected in the implementation or intentionally marked not applicable.
4. If the requested UI needs a component not covered by the loaded section, return to the Reference Router and load the smallest additional section. Do not guess from memory when a local reference exists.
5. Scope CSS by component root and render mode. Desktop collapsed Sidebar rules must not affect Mobile Drawer; desktop Header toggle rules must not affect the mobile menu trigger.
6. If a spec requirement cannot be implemented because product logic, data, route, or permission behavior is unknown, keep the visual structure flexible and report the missing business decision. Do not silently omit the requirement.
7. Before final response, run a spec coverage pass: list the reference sections used, the major spec requirements implemented, and any intentional deviations or unresolved confirmations.

## Global Contract
| Area | Non-negotiable rule |
|---|---|
| Source | Project HTML in `source-reference/html/` decides page regions, copy, and arrangement. `03-components.md` decides component shape and states. Semantic tokens decide color, type, spacing, radius, and shadow. Screenshots and Figma links are archived examples. Current code UI is not the visual source. |
| Tokens | Use CSS variables / token utilities; no hardcoded HEX/RGB. |
| Palettes | A palette only overrides tokens. Components never branch on the active palette and never reference `--harbor-*`. See `02-foundations.md` `海港晴光 Harbor Sun`. |
| Assets | Project logo and custom icons, when supplied, live under `assets/`. Do not recreate a logo with text. UI action icons use Lucide or Phosphor. |
| Color | Do not introduce non-neutral Tailwind palettes unless the user explicitly requests a specific Tailwind color. |
| Type | Use `text-styles.json` text tokens for type decisions. |
| Surface | Dropdown Menu / Popover use `--popover`; ordinary Cards, Panels, Dialogs, Tables, Alert, and Sonner / Toast use `--card`; Tooltip uses `--popover-foreground` background and `--popover` text. Cards and popovers add `--edge-highlight` on the top edge. |
| Atmosphere | Glows use only `--glow-primary`, `--glow-accent`, and `--glow-empty` from `02-foundations.md`. They are decorative, not text backgrounds. Data management, forms, record detail, and dialogs do not get a page glow. |
| Radius | Main Panel / Dialog / Stat Card / Table / Alert Dialog use `--radius-xl`; Dropdown Menu / Alert / Sonner use `--radius-lg`. |
| Overlay | Dropdown / Popover inside clipping ancestors must use portal / floating layer; `z-index` alone is invalid. |
| App shell | Follow `03-components.md` Header / Sidebar specs; desktop collapsed Sidebar is a 48px icon-only rail; mobile Drawer is a separate overlay render mode. |
| RWD | Prevent page-level horizontal overflow; local horizontal scroll is allowed only for intentional table/comparison wrappers. A page group with a max-width is centered in the area beside the Sidebar. The Header stays left-aligned. |

## Handling Open Confirmations
The references currently have one open item: the `Temporary UI Audit` table in `05-retrofit-and-qa.md`. Engineers fill it in after the package is added to a host app (temporary UI, routes, and owners). `designer-notes.md` `Needs Engineer Confirmation` lists the same kind of host-app facts.
- Do not invent entries for that table or for host-app facts such as component paths and routes.
- This applies only to retrofit work in a host app. Visual values in `02-foundations.md` and `03-components.md` are confirmed; do not pause on them.
- If a retrofit depends on a missing host-app fact, ask the user, or keep a flexible placeholder and report it.

## Reporting Results
After completing a UI task:
1. Briefly list the components modified.
2. Confirm that CSS variables were used instead of hardcoded values.
3. Confirm that existing business logic (handlers, state, API calls) was preserved.
4. Include a concise spec coverage note: reference sections used, key requirements followed, and any intentional deviation or missing confirmation.
