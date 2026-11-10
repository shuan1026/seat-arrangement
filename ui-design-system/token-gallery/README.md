# UI Token Gallery

This folder is a browsable token gallery generated from this example UI design system.

The gallery is organized into three trace views:

| Tab | Meaning |
|---|---|
| `Primitive` | Base Tailwind, number, spacing, radius, stroke, opacity, and neutral color tokens. |
| `Semantic` | Semantic mode tokens such as `--background`, `--primary`, `--sidebar`, and radius aliases. |
| `Component` | Component sections listed in `03-components.md`, each rendered as an interactive token-based preview. Screenshot and Figma fields in the data are archived example metadata. |

## Open

Open `index.html` in a browser, or serve the package folder locally and visit `/token-gallery/`.

## Sync

If the workspace contains the generator:

```bash
node tools/build-token-gallery.mjs
```

With an explicit package path:

```bash
node tools/build-token-gallery.mjs path/to/ui-design-system
```

This package may not include that generator. `data/tokens.css` holds the current token values. Color values in `data/tokens.json` and `data/token-gallery-data.js` are archived example data; `app.js` displays the color and shadow values loaded from `data/tokens.css` and adds the tokens those files do not list. The gallery shows the default palette; the `:root[data-theme]` blocks at the end of `data/tokens.css` override it for 海港晴光 Harbor Sun and 深色 Dark. Adopting a new project does not require replacing the source JSON or screenshots, and does not require regenerating the gallery from Figma. Put page HTML in `source-reference/html/`.

## Generated Files

| File | Purpose |
|---|---|
| `data/tokens.json` | Token and component registry with Figma IDs, source files, spec references, screenshots, and generated code mapping. |
| `data/token-gallery-data.js` | Browser-ready data bundle used by `app.js`; keeps the gallery working from a plain local file. |
| `data/tokens.css` | CSS custom properties with the current token values. The gallery displays these values. The color part is maintained by hand; see Source Chain. |

## Source Chain

The files below are archived generator inputs, not the design source priority. Design source priority is `01-source-of-truth.md`. Page HTML is not a gallery input.

| Source | Role |
|---|---|
| `source-reference/figma/variables-and-styles/*.json` | Figma-exported variables and styles. |
| `.cursor/skills/ui-design-system/references/*.md` | Design spec references and token usage notes. |
| `source-reference/figma/figma-links.md` | Figma node links for visual traceability. |
| `source-reference/screenshots/Design System/*.png` | Visual evidence for component and foundation usage. |

Edit the source files, then rerun the generator when it is available. The color part of `data/tokens.css` (`--color-*`, semantic colors, glows, and shadows) is maintained by hand with the 多彩活力 Vivid values, and the generator must not overwrite it. `variables-and-styles/mode.json` still holds the archived example colors, so a plain rebuild would put those values back. Make the generator skip those parts, or restore them after a rebuild.

Tailwind color exports are intentionally filtered to the `neutral` scale only; other Tailwind palettes are excluded from generated gallery data and CSS.
