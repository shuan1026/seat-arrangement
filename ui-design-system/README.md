# UI Design System

這是一包可放到前端專案裡的 UI Design System。Cursor、Claude Code、Codex 共用同一份規格。
新專案把頁面 HTML 放到 `source-reference/html/`。HTML 決定頁面區塊與排列；元件形狀與狀態用 `03-components.md`；顏色、字級、間距、圓角與陰影用語意 token。不必換 Figma，也不必整包替換截圖。

現有前端 UI 只可作業務邏輯參考，不可當作視覺來源。

## 安裝方式

1. 將整個資料夾放進前端專案，例如 `frontend/ui-design-system/`。規格、HTML、token 都留在這個資料夾，不要把 `.cursor/skills` 再複製一份到前端根目錄。
2. 把下面四個入口複製到前端專案根目錄，讓 Cursor、Claude Code、Codex 在改前端程式時讀得到：
   - `AGENTS.md`
   - `CLAUDE.md`
   - `.claude/`
   - `.cursor/rules/ui-design-system-gate.mdc`，放到前端的 `.cursor/rules/`
3. 若這個資料夾不叫 `ui-design-system`，改 `AGENTS.md`、`.claude/skills/ui-design-system/SKILL.md` 與 gate 裡的資料夾名稱。
4. 若專案已有自己的資產目錄，可把 logo 與 custom icon 放到正式位置，但需同步更新 Skill references 內的路徑。
5. 匯入後先閱讀設計系統根目錄下的 `.cursor/skills/ui-design-system/SKILL.md`，依它的 Progressive Loading 只讀需要的章節。遇到來源優先順序、資產或 HTML 與元件規格衝突時，再讀 `references/01-source-of-truth.md`。
6. 換專案時，把頁面 HTML 放到這包的 `source-reference/html/`，並把專案 Logo 放到 `assets/logo/`。不必替換截圖或 Figma JSON。

## Docker

這包只給開發人員與 AI 讀規格，不進執行中的前端。建 image 時在前端專案的 `.dockerignore` 排除整個資料夾：

```text
ui-design-system/
```

資料夾若改名，排除路徑跟資料夾名稱一致。Logo、icon 與 CSS 變數放在前端專案自己的程式與靜態資源裡，不從這個資料夾在 runtime 載入。

## 交付包內容

```text
ui-design-system/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── .claude/
│   └── skills/
│       └── ui-design-system/
│           └── SKILL.md
├── .cursor/
│   ├── rules/
│   │   └── ui-design-system-gate.mdc
│   └── skills/
│       └── ui-design-system/
│           ├── SKILL.md
│           └── references/
│               ├── 01-source-of-truth.md
│               ├── 02-foundations.md
│               ├── 03-components.md
│               ├── 04-patterns-and-ux.md
│               ├── 05-retrofit-and-qa.md
│               └── 06-token-gallery.md
├── assets/
│   ├── logo/
│   └── icons/
├── token-gallery/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── data/
│       ├── tokens.json
│       ├── token-gallery-data.js
│       └── tokens.css
└── source-reference/
    ├── html/
    ├── figma/
    │   ├── figma-links.md
    │   ├── designer-notes.md
    │   └── variables-and-styles/
    └── screenshots/
        └── Design System/
```

海港晴光與深色都在 `html/` 同一份原型，由 `data-theme` 切換，色票在 `token-gallery/data/tokens.css` 的覆寫段（見 `references/01-source-of-truth.md`）。

## Source Priority

實作時請以 `references/01-source-of-truth.md` 為準，來源優先級如下：

1. `source-reference/html/`：有對應檔時，決定頁面區塊、文案與排列。
2. `03-components.md`：元件形狀、變體、狀態與尺寸。
3. `02-foundations.md` 與 `token-gallery/data/tokens.css`：顏色、字體、間距、圓角、陰影。
4. Designer notes：已確認的設計決策。
5. `source-reference/screenshots/Design System/` 與 Figma 連結：封存的元件庫範例，新專案不必替換。
6. 舊 ds 草稿文件：僅作背景，不作 source of truth。
7. 目前前端 UI：只可參考業務邏輯，不可作為設計來源。

`token-gallery/` 的 source order 是生成輸入順序，不是設計優先級。若 Gallery、截圖、token reference 之間有疑義，先回到 `01-source-of-truth.md` 判斷。

## 如何開始

在 Cursor Chat 或 Composer 中，準備翻新某個頁面或元件時，使用 `@ui-design-system`，或觸發 `design system`、`retrofit`、`UI update` 等關鍵字，以觸發 `ui-design-system-gate.mdc`。

使用流程採三段式：先依 Progressive Loading Protocol 讀取相關章節；若 `source-reference/html/` 有對應頁面，先讀該 HTML，再載入畫面用到的元件章節；沒有 HTML 時，才用 `04-patterns-and-ux.md` 的 `New Feature Unit Composition` 選 base pattern。找到規格後依 `SKILL.md` 的 Spec Execution Protocol 萃取 spec contract、實作並回報 spec coverage。

### Prompt 範例

- 「請根據 @ui-design-system 翻新這個表單頁，保留現有的驗證邏輯。」
- 「我要實作資料列表，請參考 @ui-design-system 的 Data Management Pattern。」
- 「請檢查目前這份表單是否符合 @ui-design-system 裡的 Form UX 與 Accessibility 標準。」

## 使用規則總覽

| Area | Rule |
|---|---|
| Loading | 不要每次全量閱讀 `references/01-06`；依 `SKILL.md` router 只讀必要章節。 |
| Source | 現有前端 UI 只作業務邏輯參考。頁面跟 `source-reference/html/`；元件跟 `03-components.md`；顏色與字級跟語意 token。 |
| Execution | Reference section 是 spec contract，不是靈感；完成後需回報 spec coverage。 |
| Tokens | 使用 CSS variables / token utilities；不寫死 HEX/RGB；非 `neutral` Tailwind 色系除非使用者指定，不預設導入。 |
| Typography | 使用 `source-reference/figma/variables-and-styles/text-styles.json` 的文字 token。 |
| Surface | Dropdown / Popover 使用 `--popover`；一般 Card / Dialog / Table / Alert / Sonner 使用 `--card`；Tooltip 使用 `--popover-foreground` 背景與 `--popover` 文字。 |
| Radius | 主要 Panel / Dialog / Stat Card / Table / Alert Dialog 使用 `--radius-xl`；Dropdown Menu / Alert / Sonner 使用 `--radius-lg`。 |
| Overlay | Dropdown / Popover 在 clipping ancestor 內必須用 portal / floating layer；不可只靠 `z-index`；scroll / resize 時需重新定位。 |
| Action menu | Row action 3-dot menu 是 command / navigation menu，不顯示 checkmark 或 selected state。 |
| App shell | Header / Sidebar / Mobile Drawer 依 `03-components.md`；mobile Drawer 與 desktop Sidebar 是互斥 render modes。 |
| RWD | 防止 page-level horizontal overflow；水平捲動只允許在明確的 table / comparison local wrapper 內。 |
| Assets | Logo 放到 `assets/logo/`。範例 Sidebar lockup 為 `208px x 72px`，收合 symbol 為 `24px x 24px`。不要用文字重組 Logo。 |

## Token Gallery

`token-gallery/index.html` 是 token 與元件預覽。換專案不必從 Figma 重建 Gallery，頁面 HTML 也不是 Gallery 的輸入。檔案裡的 Figma 欄位與截圖是封存範例。它可用來檢視：

- Token preview、分類、搜尋與來源集合。
- Primitive / Semantic token 與 `03-components.md` 的 component tab；Component tab 會渲染可互動的 token-based component preview。
- Figma variable/style 來源、規範文件行號、生成 CSS custom properties。
- 對應的 Design System 截圖與 Figma node link。
- Tailwind color primitives 只保留 `neutral` scale，其他 Tailwind palette 不會輸出到 Gallery / CSS。

Gallery 若有產生器，歷史輸入順序為：

1. `source-reference/figma/variables-and-styles/`
2. `.cursor/skills/ui-design-system/references/`
3. `source-reference/figma/figma-links.md`
4. `source-reference/screenshots/Design System/`

若 workspace 內有產生器，從根目錄重建：

```bash
node tools/build-token-gallery.mjs
```

重建後會同步更新 `token-gallery/data/tokens.json`、`token-gallery/data/token-gallery-data.js` 與 `token-gallery/data/tokens.css`。這包不一定包含該腳本。

`tokens.css` 的色彩段（`--color-*`、語意色、glow、shadow）是手動維護的多彩活力值，產生器不可覆寫。產生器的輸入 `source-reference/figma/variables-and-styles/mode.json` 仍是封存色，直接重建會把這些 token 蓋回封存值。要重建時，先讓產生器跳過這幾段，或重建後把這幾段還原。

從含驗證腳本的 workspace 根目錄執行機械驗證：

```bash
node tools/verify-token-gallery.mjs
```

驗證會啟動本地靜態 server，使用 Playwright + 本機 Chrome 檢查 Component dialog 在 desktop / mobile viewport 的 grid 欄數、水平 overflow 與關鍵元件尺寸；目前覆蓋 Dropdown Menu、Sonner / Toast、Sidebar。

## 交付後工程師需補齊

目前的 Design System reference 中，待確認的只有工程實作細節（`05-retrofit-and-qa.md` 的 Temporary UI Audit、`designer-notes.md` 的 Needs Engineer Confirmation），視覺規格已確認。
匯入到具體專案後，請補齊：

1. 編輯 `.cursor/skills/ui-design-system/references/03-components.md`，補上專案中實際的 UI Component 路徑（例如：`@/components/ui/button.tsx`）。
2. 編輯 `.cursor/skills/ui-design-system/references/05-retrofit-and-qa.md`，列出目前的暫時性 UI 清單與實際的 Route 結構。
3. 把專案 Logo 放到 `assets/logo/`。沒有檔案時，保留 Sidebar 範例尺寸，不要用文字或截圖裁切代替。
4. 目前只有 `Table` 尚無 `03-components.md` 的獨立元件章節。Tabs / Pills 用 `03-components.md` 的 `## Tabs`；Status Pill 用 `## Badge`，變體依 `02-foundations.md` 的 Status Usage 選擇。若工程端需要共用的 Table 規格，建議補一個 dedicated `Table` component section；補齊前請依 `04-patterns-and-ux.md` 的 Table Rules，以及 `03-components.md` 的 Dropdown Menu / Scrollbar / Pagination 規格實作。

## Retrofit 驗收重點

- UI 結構、顏色、字體、radius、shadow、狀態與互動必須來自本 Skill references，不以目前暫時性 UI 為準。
- 現有 route、state、API calls、validation、permission、business logic 必須保留。
- 完成後需回報 spec coverage：使用哪些 reference sections、主要規格是否已落實、是否有 intentional deviation 或待確認事項。
- Surface / radius / typography 需符合 `02-foundations.md` 與 `03-components.md`：尤其是 `--card` / `--popover` / Tooltip token、`text-styles.json`、`--radius-xl` / `--radius-lg`。
- 新功能若已有 `source-reference/html/` 的頁面，區塊與排列跟該 HTML，元件仍用 `03-components.md`。沒有 HTML 時，才依 `04-patterns-and-ux.md` 的 `New Feature Unit Composition` 選擇 base pattern。
- Header / Sidebar 需符合 `03-components.md`：desktop collapsed `48px` icon-only、desktop Header 非預設 fixed、mobile Header fixed top、Mobile Drawer 獨立 overlay render。
- Dropdown / Popover / Tooltip / Dialog / Alert Dialog 的 overlay 行為要符合 clipping、focus、keyboard、collision 規則。
- 表格頁要包含 loading、empty、pagination、row action、local horizontal scroll、scrollbar inset 與 mobile strategy。
- 完成後至少檢查 `320px`, `375px`, `430px`, `768px`, `1024px`, `1280px`，確認沒有 page-level horizontal overflow。
