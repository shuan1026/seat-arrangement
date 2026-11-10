# 06 Token Gallery

`token-gallery/` is the browsable synchronization layer for this example UI token set.

## Purpose

- Use `token-gallery/index.html` to inspect token previews, interactive component previews, generated CSS variables, and the component sections listed in `03-components.md`.
- Figma provenance and Design System screenshots shown in the gallery are archived example metadata. A new project does not regenerate the gallery from Figma. Page HTML in `source-reference/html/` is not a gallery input.
- Use the `Primitive`, `Semantic`, and `Component` tabs to separate base tokens, semantic tokens, and the component sections listed in `03-components.md`.
- Use `token-gallery/data/tokens.css` as the single source of CSS custom properties. Its color part (`--color-*`, semantic colors, glows, and shadows) is maintained by hand. Most other primitives came from the generator; `--font-sans` and `--space-*` were added by hand.
- Use `token-gallery/data/tokens.json` when a script or AI workflow needs a structured token registry.
- Tailwind color primitives are limited to the `neutral` scale by default; non-neutral Tailwind palettes stay excluded unless the user explicitly requests a specific Tailwind color.

## Generation Input Order

The gallery is a token and component preview. Adopting a new project does not require regenerating it from Figma. If a generator exists, its build input order below is historical metadata, not the design source priority. Design source priority remains `01-source-of-truth.md`.

1. Figma token exports in `source-reference/figma/variables-and-styles/`.
2. Local Design System references in `.cursor/skills/ui-design-system/references/`.
3. Figma node links in `source-reference/figma/figma-links.md`.
4. Design System screenshots in `source-reference/screenshots/Design System/`.

## Regeneration

From the workspace root that contains `tools/build-token-gallery.mjs`:

```bash
node tools/build-token-gallery.mjs
```

If the package lives elsewhere:

```bash
node tools/build-token-gallery.mjs path/to/ui-design-system
```

Do not manually edit `token-gallery/data/*.json` or `token-gallery/data/*.js` once a generator is available; update the source files and regenerate. `tokens.css` is the exception: its color part (`--color-*`, semantic colors, glows, and shadows) is maintained by hand with the 多彩活力 Vivid values and the 海港晴光 Harbor Sun and 深色 Dark override blocks, and the generator must not overwrite it. The gallery shows the default palette. The generator input `mode.json` still holds the archived example colors, so a plain rebuild would put those values back. Make the generator skip those parts, or restore them after a rebuild.

This package may not include the generator. If it does not, keep token names and color values in `tokens.json` and `token-gallery-data.js` intact and only remove entries that point at deleted assets. `tokens.css` holds the current values: `app.js` reads color, gradient, and shadow values from it when rendering, so the gallery does not show the archived values. When you add a color, gradient, or shadow token to `tokens.css` that the data bundle does not list, add its name to `PROJECT_TOKENS` in `app.js`. Other tokens, such as `--font-sans` and `--space-*`, work in pages without being listed; the gallery does not show them.

## Mechanical Verification

From the workspace root that contains `tools/verify-token-gallery.mjs`:

```bash
node tools/verify-token-gallery.mjs
```

The verifier starts a local static server and uses Playwright with local Chrome to check selected Component dialogs across desktop and mobile viewports. It currently covers Dropdown Menu, Sonner / Toast, and Sidebar. It reports grid column counts, horizontal overflow, panel widths, and key sample sizes so follow-up QA can use compact machine results before screenshot review.
