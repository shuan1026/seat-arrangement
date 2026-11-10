# Designer Notes

## Current Situation

This package is an example UI design system. It is not tied to one product.

Component dimensions in `03-components.md` and semantic tokens in `02-foundations.md` stay with this package. Page layout for a new project comes from HTML files placed in `source-reference/html/`. Harbor Sun and Dark are palettes in `source-reference/html/`, switched with `data-theme`. Screenshots and Figma links are archived examples. Do not replace them for a new project.

The current frontend of a host app, if one exists, must not be treated as the design source of truth. Keep its business logic during retrofit.

## Priority

1. Project HTML in `source-reference/html/` for page regions, copy, and arrangement, when a file exists
2. `03-components.md` for component shape, variants, states, and dimensions
3. Semantic color tokens in `02-foundations.md` and `token-gallery/data/tokens.css`
4. Designer notes in this file
5. Archived screenshots and Figma links
6. Existing draft ds files
7. Current frontend UI

## Confirmed Decisions

This project inherits 多彩活力 Vivid from the design system default. These values override the archived example palette. The interface is light; do not add a dark theme.

- Page background and cards are `--color-bg` (`#FFFFFF`), separated by hairline borders. `--color-surface` (`#F3F5F9`) is for neutral fills.
- Sidebar uses the same light background. Its icons use the color of their work area, and the active item uses a 12% tint of that color with `--color-text`.
- Main CTA is `--color-primary` (`#2563EB`) with white text.
- Color has a fixed job. Blue is action. Orange, blue, and violet mark the three work areas. Green, amber, red, and burnt orange mark status. Do not use them for decoration, and do not add more.
- `--secondary`, `--accent`, and pending states use `--color-accent` (`#F59E0B`). Text on solid amber is `--color-text`; white fails contrast.
- Red (`#DC2626`) is reserved for errors, overdue states, and destructive actions, so a destructive button looks different from a normal primary button.
- Amber, green, and orange are too light as text on white. Use `--status-pending-fg`, `--status-positive-fg`, and `--module-leads-text`. Error and destructive text use `--destructive-text`.
- Dropdown and Popover use `--color-bg`, the same as cards, and float on a shadow. Shadows use the lower opacity of a light theme. Tooltips invert to a dark bubble.
- Atmosphere and work are separate. Login and public pages may use `--glow-primary` and `--glow-accent`. Overview headers may use `--glow-primary` only. Lists, forms, and dialogs stay on solid surfaces; an empty state inside them may put `--glow-empty` behind its icon only. Cards and popovers use `--edge-highlight`. Only the primary button uses `--shadow-glow`.
- UI tone: lively, professional, and suitable for repeated operational work. Presence comes from functional color and three low-opacity glows (`--glow-primary`, `--glow-accent`, and `--glow-empty` behind empty-state icons), not from decoration or a marketing hero on work pages.
- Forms should be single-column unless the active design source shows otherwise.
- Existing business logic must be preserved during retrofit.

## Needs Engineer Confirmation

- Actual code component paths.
- Existing UI primitives.
- Current route structure.
- Current form validation logic.
