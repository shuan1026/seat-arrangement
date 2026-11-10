# 01 Source of Truth

## 優先順序 (Priority)

在進行任何 UI 實作與翻新時，請嚴格遵守以下來源優先級：

1. **Project HTML** (Page Layout)
   - 位於 `source-reference/html/`。一頁一個檔，檔首以 `<!-- page: ... -->` 標頁名。
   - 有對應 HTML 時，頁面區塊、文案與排列以該檔為準，蓋過 `04-patterns-and-ux.md` 的範例頁。
   - 海港晴光 Harbor Sun 與深色 Dark 在同一份原型，由 `data-theme` 切換，色票在 `token-gallery/data/tokens.css` 的覆寫段（見 `docs/decision-record.md` D-001、D-002）。
   - HTML 裡的色碼、字級、間距與元件尺寸是草稿。色票對回語意 token；元件形狀與狀態對回 `03-components.md`。
2. **Component Specs** (Component Shape)
   - `03-components.md` 決定元件解剖、變體、狀態與尺寸。
   - HTML 裡近似的按鈕高度、圓角或 Sidebar 寬度不覆蓋這些規格。
3. **Semantic Tokens** (Color, Type, Spacing)
   - 顏色、字級、間距、圓角、陰影以 `02-foundations.md` 與 `token-gallery/data/tokens.css` 為準。
   - 本專案沿用的預設色票是多彩活力 Vivid，海港晴光與深色以 `:root[data-theme]` 覆寫。`--color-*` 與由它們帶出的語意 token 蓋過 `mode.json`、token gallery 產生資料與截圖裡的範例色。
   - `source-reference/figma/variables-and-styles/` 的 JSON 是封存範例，不是每次換專案都要重匯的 Figma 檔。
4. **Designer Notes** (已確認之設計決策)
5. **Archived Examples**
   - `source-reference/screenshots/Design System/` 與 `source-reference/figma/figma-links.md` 是這包元件庫的封存範例。
   - 新專案不必替換截圖或 Figma 連結。截圖裡的深綠（例如 Sidebar 底色 `#003521`）與金色（例如 Badge `default` 的 `#E6A738`）不再當色票。多彩活力的 `--color-green`、`--color-accent`、`--color-amber` 照常使用，不受這條影響。
6. **Existing draft ds files** (過去的草稿文件，僅作背景知識參考)
7. **Current frontend UI** (不可視為設計來源，程式碼僅作業務邏輯參考)

沒有對應 HTML 的頁面，沿用 `04-patterns-and-ux.md` 的頁面 pattern，不另發明版面。

## 本地資產來源

| Asset Type | Path | 使用原則 |
|---|---|---|
| Logo | `assets/logo/` | 換專案時放入該專案的 SVG。這包不附帶特定 Logo。若使用這個色票，需要深色與淺色兩個單色版 Logo。Sidebar 範例尺寸見 `03-components.md`。 |
| Custom icons | `assets/icons/` | 僅在設計指定 custom icon 時使用。一般操作 icon 用 Lucide 或 Phosphor。 |

Logo 與 custom icon 不得以截圖裁切或手繪近似替代。未提供資產時，保留元件尺寸佔位，不要自行畫一套標誌。

## 封存的 Figma 連結

以下連結與 `source-reference/figma/figma-links.md` 是這包元件庫的封存範例。新專案不必替換。

- **Example Figma Design File Key**: `S3TR2GgfacHzjnBNomvaMG`
- **Page: Design System**: <https://www.figma.com/design/S3TR2GgfacHzjnBNomvaMG?node-id=3139-50304>

## 舊文件狀態說明

以前開發期間留下的 `ds-*.md` 等草稿**不是** source of truth。請依照本 References 內的規範進行開發。換專案後，放入 `source-reference/html/` 的頁面 HTML，並沿用這包的元件規格與語意 token。
