# UI Design System

Cursor, Claude Code, and Codex use this file to find the same design system. The specification itself stays in `SKILL.md`. Do not copy that file.

## Design system root

Resolve `<root>` before reading any design-system path:

- If `source-reference/html/` exists at the project root, `<root>` is `.`
- Otherwise, if `ui-design-system/source-reference/html/` exists, `<root>` is `ui-design-system/`

All `source-reference/`, `token-gallery/`, and `.cursor/skills/ui-design-system/` paths below are relative to `<root>`. If this package folder is renamed, update that folder name here.

## When doing UI

For any UI component, layout, styling, or retrofit:

1. Read `<root>/.cursor/skills/ui-design-system/SKILL.md` and follow its Progressive Loading protocol. Do not read every reference file.
2. Page regions, copy, and arrangement come from `<root>/source-reference/html/` when that folder has a matching page file.
3. Component shape, variants, states, and dimensions come from `<root>/.cursor/skills/ui-design-system/references/03-components.md`.
4. Color, type, spacing, radius, and shadow come from the semantic tokens in `02-foundations.md` and `<root>/token-gallery/data/tokens.css`.

## Do not

- Do not treat the host app's current UI as the visual source. Keep its business logic.
- Do not invent colors, spacing, or component structures. Map HTML colors back to semantic tokens.
- Do not introduce page-level horizontal overflow. Layouts must work from 320px to desktop.
- Do not fix Dropdown or Popover clipping by raising `z-index`. Use the portal / floating layer behavior in `03-components.md`.
- Do not introduce non-neutral Tailwind palettes unless the user explicitly requests a specific Tailwind color.
- Do not invent a page structure. Follow the matching HTML file. If none exists, use `04-patterns-and-ux.md` `New Feature Unit Composition`.
- Do not treat loaded reference sections as loose inspiration. Follow the Spec Execution Protocol in `SKILL.md`.
