# 05 Retrofit and QA

> ⚠️ **注意**：
> - 待工程師確認：Temporary UI Audit 細節（目前專案中有哪些暫時性 UI 需要替換，請工程師盤點後列在本檔最後的表格）。這是 references 目前唯一的待確認項目，視覺規格不在此列。

## Retrofit 原則與順序 (Retrofit Strategy)

由於目前前端使用的是另一套暫時性設計，我們在翻新 (Retrofit) 時，必須嚴格遵守以下原則：

### 1. Preserve Existing Logic (保留既有業務邏輯)
**絕對不可破壞現有的業務邏輯。**
這包含但不限於：
- 表單驗證邏輯 (Form validation)
- API 串接與資料獲取 (API Calls, Data fetching)
- 狀態管理 (State management, hooks)
- 事件綁定 (Event handlers)
- 路由跳轉 (Routing)

翻新時，只替換 CSS 樣式 (classNames, styled-components)、DOM 結構 (HTML tags) 與 UI 元件，背後的行為必須百分之百原封不動。

### 2. Retrofit 順序 (Retrofit Order)
建議依循由小到大、由內而外的順序進行：
1. **Design Tokens**: 先將專案內的 raw HEX 取代為對應的 CSS Variables。
2. **Primitives / Shared UI Components**: 翻新底層的共用元件（Button, Icon Button, Input, Checkbox, Dropdown Menu, Tabs, Pagination 等）。Surface、overlay、Tooltip、radius 與 scrollbar inset 依 `02-foundations.md`, `03-components.md`, `04-patterns-and-ux.md` 的規則實作。
3. **Layout**: 套用 App Shell、Header、Sidebar / Mobile Drawer 結構；desktop Sidebar 與 mobile Drawer 必須是互斥 render modes。
4. **Pages / Flows**: 若 `source-reference/html/` 有該頁，區塊與排列跟 HTML，元件仍用 `03-components.md`。沒有 HTML 時，才將頁面切換至 Overview、Metrics Overview、Data Management 或 Form Editor 等對應 pattern。

## QA Checklist (品質驗證清單)

在完成每個元件或頁面的翻新並準備提交 PR 前，請務必依循此清單進行自我檢查：

### Source and Spec

- [ ] **Spec Coverage**：列出本次使用的 reference sections；讀到的 layout、variant、token、state、RWD、accessibility、禁止事項皆已實作、標註不適用，或標註待確認。
- [ ] **Asset**：專案 Logo 使用 `assets/logo/` 的 SVG。沒有檔案時保留 Sidebar 尺寸佔位，不使用截圖裁切或文字重組。
- [ ] **Visual Source**：有對應 HTML 時，頁面區塊與排列比對 `source-reference/html/`；元件形狀與狀態比對 `03-components.md`。不以目前暫時性 UI 作為視覺依據。

### Visual System

- [ ] **Token**：完全使用 `var(--token-name)`，沒有 hardcoded HEX/RGB。
- [ ] **Surface / Radius**：Dropdown Menu / Popover 使用 `--popover`；Tooltip 使用 `--popover-foreground` 背景與 `--popover` 文字；普通 Card / Dialog / Table / Alert / Sonner 使用 `--card`；`--card` 與 `--popover` 頂邊使用 `--edge-highlight`；主要 Panel / Dialog / Stat Card / Table / Alert Dialog 使用 `--radius-xl`，Dropdown / Alert / Sonner 使用 `--radius-lg`；Badge 使用 `--radius-full` 或 `--radius-sm`。
- [ ] **Atmosphere**：光暈只用 `--glow-primary`、`--glow-accent`、`--glow-empty`。登入與對外頁可兩團；Overview / Metrics Overview 只有主光，且停在標題與 Stat Card 後方；列表、表單、詳情、Dialog 沒有頁面光暈。裝飾層 `pointer-events: none`，不造成 page-level horizontal overflow，也不當文字底色。Button `primary` 才使用 `--shadow-glow`。
- [ ] **Typography**：字體尺寸、line-height、weight 對應 `source-reference/figma/variables-and-styles/text-styles.json`，不臨時硬寫。
- [ ] **Functional color**：每個顏色只用在規定的用途，不拿來裝飾，也不另外新增。琥珀、綠、橘當文字時改用 `--status-pending-fg`、`--status-positive-fg`、`--module-leads-text`。紅色只用在錯誤、逾期與危險操作。
- [ ] **Badge**：Status Badge 使用 `03-components.md` `Badge` variants；互動 Badge / filter chip focus 使用 `box-shadow: var(--shadow-focus-ring)`；靜態 Badge 不只靠顏色傳達狀態。

### Structure and Interaction

- [ ] **Business Logic**：按鈕點擊、表單送出、錯誤驗證、route、permission、API calls 與翻新前維持一致。
- [ ] **Forms**：表單維持單欄設計（除非專案 HTML 另有排列）；Label 在上方，placeholder 不取代 label。
- [ ] **New Feature UX**：`source-reference/html/` 有該頁時，區塊與排列跟 HTML，並把每個區塊對到 `03-components.md` 的元件。沒有 HTML 時，才依 `04-patterns-and-ux.md` `New Feature Unit Composition` 判斷 primary job、main object、base pattern、必要 states 與 mobile behavior。
- [ ] **Header / Sidebar**：Desktop Sidebar 使用 fixed positioning，scroll 後 top 仍為 `24px`，不得用 default `position: sticky`；desktop collapsed Sidebar 為 `48px` icon-only rail；Desktop Header 跟隨 main content flow；Mobile Header fixed top；Mobile Drawer 是獨立 overlay render mode；desktop collapsed / expanded CSS 不污染 mobile drawer；desktop collapsed nav item hover 顯示右側 Tooltip 選單名稱。
- [ ] **App Shell Demo Details**：Expanded Sidebar logo 是 `208px x 72px`；expanded/mobile footer 為 `avatar | text column | chevron slot`；名稱與第二行說明必須兩行；collapsed footer trigger 是置中的 `32px x 32px` avatar 並隱藏 text/chevron；mobile drawer footer 預設透明、hover 才淡色、open 才 active。
- [ ] **Collapsed Desktop to Mobile Resize**：從 desktop collapsed 狀態縮到 `<768px` 後，desktop rail 不可仍佔位，`.app-main` 不可保留 desktop left padding，Mobile Header 必須出現，Mobile Drawer 開啟後必須顯示 logo、labels、兩行 footer text 與 chevron。
- [ ] **Header Toggle Scope**：Desktop Header toggle 是 `30px x 30px` button / `20px x 20px` icon；mobile menu trigger 不被 desktop toggle selector 影響。
- [ ] **Hover / Focus**：Desktop pointer 互動元素具備 hover；disabled / loading 停用 hover；hover 不取代 focus、selected、active；互動元素有可見 Focus Ring；collapsed Sidebar Tooltip 不可取代 nav item 的 `aria-label`。
- [ ] **Dropdown / Popover Layer**：Table / Card / Scroll wrapper 內的 row action menu、Dropdown、Popover 透過 portal / floating layer 顯示且不被裁切；不是只用 `z-index`；scroll / resize 時重新定位；測過 dense table 首列、末列、垂直捲動與水平捲動；user menu 使用 Sidebar footer 專屬 placement，不套用一般右對齊 action menu 規則。

### Responsive and Content

- [ ] **RWD**：在 `320px`, `375px`, `430px`, `768px`, `1024px`, `1280px` 下都能完成主要流程；卡片、表單、Toolbar、Stat Card、Pagination 正確堆疊或換行。
- [ ] **Overview**：Overview 頁面內容計算後為 `width: 100%; max-width: none; min-width: 0;`，內容填滿 Sidebar 右側可用寬度，Stat Card 使用 auto-fit，page 不套 `960px-1120px` max-width。class 名稱只是示意（`04-patterns-and-ux.md` 寫 `.page-content--overview`，原型用 `.page-content--full`），QA 檢查的是計算後的值。
- [ ] **Limited-width pages**：文件與常見問題整組（標題、內文、頁內目錄）`max-width: 1120px`，入口頁 `max-width: 1200px`，都在 Sidebar 右側可用區以 `margin-inline: auto` 置中。目錄留在這組裡面，不貼視窗右緣。Header / breadcrumb 不進置中群組。
- [ ] **Stat Card Grid**：Mobile Stat Card 不強制單欄；使用 auto-fit / minmax 規則，空間足夠時可兩欄，過窄時安全降為一欄，且不造成水平 overflow。
- [ ] **Horizontal Overflow**：`body` / app root / page shell 沒有 page-level horizontal scroll；資料表橫向捲動只發生在 table wrapper 內。
- [ ] **Scrollbar**：Table / Card / Dropdown 內的水平或垂直捲動條，滑動方向兩端有留白，沒有貼齊邊框或圓角。
- [ ] **Long Content**：Email、編號、URL、狀態文字、Button label、Tab label 不會撐破卡片或頁面。

### Targeted Source Checks

Run these checks against the source directory being retrofitted, adjusting the path if the project does not use `src/`:

```sh
rg -n "position:\\s*sticky" src
rg -n "data-sidebar=.collapsed.*\\.(sidebar-label|sidebar-logo|sidebar-user-text|sidebar-user-chevron)|\\.app-shell\\[data-sidebar=.collapsed.\\]\\s+\\.(sidebar-label|sidebar-logo|sidebar-user-text|sidebar-user-chevron)" src
```

- `position: sticky` findings are invalid for the default desktop Sidebar; they are allowed only for explicitly documented non-Sidebar sticky UI such as long-form footer actions.
- Broad collapsed Sidebar selectors must be rewritten with a desktop Sidebar scope, such as `.desktop-sidebar` or `[data-sidebar-scope="desktop"]`.

## Temporary UI Audit (暫時性 UI 清單 - 待工程師填寫)

請工程師盤點目前程式碼中需要被替換的暫時性設計：

| 檔案 / 路徑 / 元件 | 應對應的新設計與處理方式 | 負責人 | 狀態 |
|---|---|---|---|
| (請列出暫時性 UI) | (例如: 套用 Data Management Pattern) | | Pending |
| | | | |
