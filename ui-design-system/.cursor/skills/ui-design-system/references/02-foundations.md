# 02 Foundations

> Source of Truth: color, type, spacing, radius, and shadow values in this file and `token-gallery/data/tokens.css` are the semantic tokens. This project inherits the 多彩活力 Vivid palette below as its default; 海港晴光 Harbor Sun and 深色 Dark override it when a user switches. Those values override the archived example hex in `mode.json`, the token gallery data, and screenshots. When a page in `source-reference/html/` conflicts with an example layout, the HTML wins. Component shape and states still come from `03-components.md`. Project logo files, when supplied, live in `assets/logo/`.

> 實作時一律使用 CSS Variables `var(--token)` 或 Tailwind token utilities，禁止在元件程式碼中寫死 HEX。本文的 HEX 僅用於說明 token 來源與全域變數定義。

---

## Visual Foundation

這包是可套用到不同專案的工作台視覺範例。它不該做成行銷站，也不該過度裝飾。它應該像一個可信任、可長時間操作的工作系統。色票數值先留著，換專案時整組替換。

| 原則 | Foundation 含義 | 落地方式 |
|---|---|---|
| 清楚 | 以 `--foreground`、`--background`、`--primary` 建立層次 | 主標使用 `--foreground`，Sidebar 使用 `--sidebar`，CTA 使用 `--primary` |
| 專業 | 資料密度清楚，操作路徑穩定 | 列表頁以表格、篩選列、狀態 pill 呈現 |
| 可信任 | 白色背景、白色卡片、細邊框、頂邊高光 | App shell 使用 `--background`，卡片使用 `--card` 加 `--edge-highlight` |
| 克制 | 每個顏色都有固定用途：藍是動作，橘藍紫是工作區，綠琥珀紅橘紅是狀態 | 彩度不拿來裝飾。光暈只用 `--glow-*`。不導入非 `neutral` 的 Tailwind 色板，除非使用者指定 |
| 有效率 | 操作按鈕集中，狀態與下一步明確 | 表單、列操作、日期與狀態篩選都以明確控制元件呈現 |

### Product Surface Principles

- **Authenticated app surface**: `--background` 作為工作底，`--sidebar` 固定左側，內容以 `--card` 承載。側欄與頁面同色，外框用 `1px solid var(--sidebar-border)`，主內容優先。卡片與頁面也同色，靠 `--border` 與 `--edge-highlight` 分層；色彩只留給主要動作與需要注意的狀態。
- **Atmosphere**: 登入、對外頁、總覽頂部、空狀態可以有光暈。光暈是裝飾層，不承接文字，也不擋點擊。
- **Work surface**: 列表、看板、表單、對話框維持實色。這些頁面不加頁面光暈，也不做英雄區。
- **Mobile pages**: 保留同一色彩階層與同一組光暈規則，內容改為窄版 cards、內部可捲動表格或堆疊統計卡；整個 page / body 不可出現水平捲動，不新增另一套視覺語言。

### Atmosphere

光暈只用主色藍與強調琥珀，透明度要低，邊緣收到全透明。一個畫面最多兩團，位置錯開。實作用獨立裝飾層，`pointer-events: none`，並由該層自己 `overflow: clip`，避免撐出水平捲動。光暈不作為文字或按鈕的底色。

| Token | 定義 | 用在 |
|---|---|---|
| `--glow-primary` | 橢圓放射，中心在左上，`--color-primary` 22% 收到透明 | 登入、對外頁、總覽標題與指標卡後方 |
| `--glow-accent` | 橢圓放射，中心在右上，`--color-accent` 14% 收到透明 | 只和 `--glow-primary` 一起用在登入與對外頁 |
| `--glow-empty` | 較小的橢圓，中心在圖示後方，`--color-primary` 18% 收到透明 | 空狀態圖示後方 |
| `--edge-highlight` | 上緣 1px，`--color-text` 12% | `--card` 與 `--popover` 的頂邊 |
| `--shadow-glow` | 主色 35% 的小範圍光 | 只有 Button `primary` |

| 畫面 | 光暈 |
|---|---|
| 登入、未登入入口、對外分享頁 | `--glow-primary` 與 `--glow-accent` |
| Overview、Metrics Overview | 只有 `--glow-primary`，停在標題與 Stat Card 後方；圖表與列表回到實色卡片 |
| Data Management、Form Editor、Record Detail、Dialog、Alert Dialog | 無頁面光暈 |
| 空狀態 | 內容表面內的圖示後方用 `--glow-empty` |

### Voice

文案以操作導向、清楚可靠為主。優先使用短句與明確動詞，例如「儲存」、「查看詳情」、「篩選」。避免行銷式口吻或過度解釋 UI。

---

## Responsive Foundation

這是高頻工作台的 RWD 範例。目標是讓使用者在手機、平板、桌機都能完成同一任務，而不是做出另一套 mobile visual language。任何 breakpoint 都必須維持同一組 tokens、同一組 component variants、同一套狀態語言。

### Viewport Targets

| Target | Width | Design Intent |
|---|---:|---|
| Narrow mobile | 320px-374px | 不出現 page-level horizontal overflow；控制元件滿版堆疊。 |
| Standard mobile | 375px-430px | 單欄內容、drawer sidebar、完整可點擊 hit target。 |
| Tablet | 768px-1023px | 表單仍以單欄為主；資料表可在 card 內部橫向捲動。 |
| Desktop | 1024px-1279px | Sidebar + content layout；toolbar/filter 可同列但必須可換行。 |
| Wide desktop | 1280px+ | 有 max-width 的頁面內容在 Sidebar 右側可用區置中，兩側留白相同。工作台總覽與資料表仍用滿版。Header / breadcrumb 維持靠左。 |

### Horizontal Overflow Rules

- `html`, `body`, app root, page shell, and main content must not create horizontal scrolling at any supported viewport.
- Do not use `width: 100vw` for nested page containers, cards, toolbars, dialogs, tables, or main content. Use `width: 100%`, `max-width: 100%`, and parent padding instead.
- Use `box-sizing: border-box` globally so padding and border do not push components beyond their container.
- In CSS Grid / Flex layouts, children that contain tables, long text, tabs, filters, or cards must support shrinkage with `min-width: 0`.
- Use `grid-template-columns: minmax(0, 1fr)` for flexible columns; avoid fixed multi-column tracks that cannot fit mobile width.
- Images, SVGs, charts, and decorative patterns must use `max-width: 100%` and must not extend outside their section unless explicitly positioned as clipped decoration.
- Long IDs, emails, order numbers, URLs, serial numbers, and status text must wrap, truncate, or move to secondary lines inside their component. They must not widen the whole viewport.
- Horizontal scrolling is allowed only inside an intentional local container, such as a data table wrapper. The scroll container must be inside the card / content area, not on `body`.
- `overflow-x: hidden` or `overflow-x: clip` may be used only as a final safety guard on decorative wrappers; it must not be the primary fix for layout overflow.

### Spacing Scale by Width

| Surface | Mobile | Tablet | Desktop |
|---|---:|---:|---:|
| Page padding | `16px` | `20px-24px` | `24px-32px` |
| Card padding | `16px` | `20px` | `20px-24px` |
| Dense table shell padding | `12px-16px` | `16px-20px` | `20px-24px` |
| Form field gap | `12px-16px` | `16px` | `16px-20px` |

---

## Logo and Icons

### Logo slot

這包不附帶特定 Logo。換專案時把 SVG 放到 `assets/logo/`。Sidebar 範例尺寸保持不變：展開 lockup `208px x 72px`，收合 symbol `24px x 24px`。

| 場景 | 版本 |
|---|---|
| `--sidebar`、`--background`、`--card` 等淺色表面 | 使用 `var(--color-text)` 的單色版本，不改變 path |
| 深色表面（例如 Tooltip、海港晴光的 `--sidebar`、深色配色） | 淺色 Logo |
| Favicon、compact mark | 僅 Symbol，`24px x 24px` |

Logo 禁止改變比例、加陰影、描邊、使用高彩度漸層，或放在複雜圖片上。沒有資產時保留尺寸佔位，不可只用小型文字標代替。

### Icon Style

- 操作用 icon library 使用 **Lucide Icons** 或 **Phosphor Icons**，延續範例設計稿的 outline 語言。
- Stroke width 使用 `var(--stroke-width)`，預設 `2px`。
- 常用尺寸（依 `prototype.css`）：Sidebar `16px`，Button `16px`，Icon Button `16px`（Desktop Header 收合鈕 `20px`），Stat Card `20px`，Badge 與 Checkbox 勾號 `12px`，空狀態 `24px`。
- Icon 顏色跟隨文字色，不使用厚重填色 icon。
- 在資料表與管理頁中，icon 只用來輔助掃描，不單獨承擔狀態語意。
- 專案自訂 icon 放到 `assets/icons/`，不要用截圖裁切代替。

---

## Color System

所有顏色都必須透過 CSS Variable 引用，禁止在元件程式碼中直接使用 HEX。

### 多彩活力 Vivid

這是本專案沿用的預設色票，不另引範例包的 `#C4473E`。元件程式只引用語意 token；語意 token 指向 `--color-*`（例外見下方「直接寫值的語意 token」）。

| Token | Value | 角色 |
|---|---|---|
| `--color-bg` | `#FFFFFF` | 頁面背景、卡片、側選單、浮層 |
| `--color-surface` | `#F3F5F9` | 中性區塊、Tabs 底、禁用態 |
| `--color-primary` | `#2563EB` | 主色藍：主要動作、選取、產品圖書館。上面的字用白，對比 5.17:1 |
| `--color-accent` | `#F59E0B` | 強調琥珀：待處理、次要按鈕。上面的字用 `--color-text`，對比 7.23:1 |
| `--color-text` | `#1F2430` | 主要文字 |
| `--color-muted` | `#5B6472` | 次要文字 |
| `--color-on-primary` | `#FFFFFF` | 主色上的文字 |
| `--color-violet` | `#7C3AED` | 數據洞察、圖表單序列 |
| `--color-orange` | `#EA580C` | 客戶線索、圖表第二序列 |
| `--color-amber` | `#D97706` | 警告圖示。`--color-accent` 在白底上對比不足時用這個 |
| `--color-green` | `#16A34A` | 正向狀態與成功圖示 |
| `--color-red` | `#DC2626` | 已逾期、錯誤與危險操作 |
| `--color-slate` | `#64748B` | 圖表的最後一個類別 |

每個顏色都有固定用途，不拿來裝飾，也不要另外新增。琥珀、綠、橘在白底上不到 4.5:1（分別是 2.15、3.30、3.56），只當填色與圖示；當文字時用 `--status-pending-fg`、`--status-positive-fg`、`--module-leads-text`。紅色只用在錯誤、逾期與危險操作，所以危險按鈕和一般主按鈕看得出差別。

#### 直接寫值的語意 token

下面幾個語意 token 直接寫 hex 或 rgba，不指向 `--color-*`。原因都是對比：功能色本身太淺，放在白底或淡色底上當文字不到 4.5:1，或上面要放白字，所以另取同色系較深的值。這是固定的例外清單，新增顏色時仍先指向 `--color-*`，不要擴大這份清單。

| Token | 值 | 原因 |
|---|---|---|
| `--destructive-text` | `#B91C1C` | 錯誤與危險文字。`--color-red` 當文字不夠深，改用較深的紅，對比 6.47:1 |
| `--status-positive-fg` | `#14532D` | 正向徽章文字，放在綠色淡色底上 |
| `--status-pending-fg` | `#713F12` | 待處理徽章文字，放在琥珀淡色底上 |
| `--status-hot` | `#C2410C` | 熱度「熱」的實心底，上面放白字，所以比 `--color-orange` 深 |
| `--module-leads-text` | `#C2410C` | 客戶線索工作區的文字。`--color-orange` 在白底上只有 3.56:1 |
| `--shadow-destructive` | `0px 0px 0px 3px rgba(220, 38, 38, 0.35)` | 錯誤光環，等於 `--color-red` 的 35%，寫成 rgba |

### 海港晴光 Harbor Sun

第二套配色，使用者用 Header 的配色鈕切換（`03-components.md` `Header / App Shell Block`）。版面、元件與文案都不變，只換顏色。所有值都在 `token-gallery/data/tokens.css` 的 `:root[data-theme="harbor-sun"]`，這裡不重複列出。

- 配色只靠覆寫 token。元件只用語意 token，不寫色碼，不判斷目前是哪一套配色，也不直接引用 `--harbor-*`。
- `data-theme` 放在 `<html>`。語意 token 在 `:root` 就算好了，放在子元素會有部分顏色換不到。
- 在第一次繪製前套用，否則開頁會先閃預設色。
- 沒有 `data-theme` 就是多彩活力。主頁也能切換，對外分享頁固定用多彩活力。
- 三個工作區不分色，`--module-*` 全部是同一個藍，靠圖示與名稱區分。
- 日光黃 `--harbor-sun` 在白底上看不清楚，只當填色。新元件兩套配色都要檢查。
- 覆寫段裡的色碼屬於各自的色票，不算上面「直接寫值的語意 token」的例外。

下面這些 token 讓配色調得到元件細節，預設值就是多彩活力原本的做法：

| Token | 多彩活力 | 海港晴光 | 用途 |
|---|---|---|---|
| `--nav-icon` | 未設定，跟著工作區顏色 | `currentColor` | 導覽圖示顏色 |
| `--nav-icon-stroke` | `var(--stroke-width)` | `1.5px` | 導覽圖示線寬 |
| `--nav-active-bg` | 未設定，工作區顏色 12% 的淡色底 | `var(--sidebar-primary)` | 目前頁面的底色 |
| `--nav-active-fg` | `var(--foreground)` | `var(--sidebar-primary-foreground)` | 目前頁面的文字 |
| `--sidebar-avatar-bg`, `--sidebar-avatar-fg` | `var(--primary)`, `var(--primary-foreground)` | `var(--harbor-sky)`, `var(--color-text)` | 使用者頭像 |
| `--sidebar-avatar-open-bg`, `--sidebar-avatar-open-fg` | 同上 | `var(--harbor-blue)`, 白色 | 使用者區塊展開時的頭像 |
| `--stat-icon-pos`, `--stat-icon-leads` | `var(--color-green)`, `var(--color-orange)` | `var(--harbor-teal)`, `var(--harbor-gold)` | 正向指標、客戶線索指標的圖示 |
| `--lead-new-border` | `var(--accent)` | `var(--harbor-blue)` | 新進線索卡片的外框 |
| `--timeline-share` | `var(--accent)` | `var(--harbor-teal)` | 時間軸的分享事件標記 |
| `--home-fact` | `var(--foreground)` | `var(--harbor-blue)` | 主頁規模列的數字 |
| `--home-rail-logo-border` | `var(--border)` | `var(--sidebar-border)` | 主頁產品畫面的 Logo 框 |
| `--theme-swatch-vivid`, `--theme-swatch-harbor-sun`, `--theme-swatch-dark` | 兩色對半 | 不變 | 配色選單的色塊。要顯示各配色自己的顏色，所以直接寫色碼，不指向會被覆寫的 `--color-*` |

### 深色 Dark

第三套配色，切換方式與規則同上一節。以多彩活力為基礎，所有值都在 `token-gallery/data/tokens.css` 的 `:root[data-theme="dark"]`，這裡不重複列出。

- 表面分三層：頁面 `--background` 最深，卡片與側選單 `--card` 亮一階，浮層 `--popover` 再亮一階。
- 填色變亮，上面的字改用深色：`--primary-foreground`、`--accent-foreground`、`--secondary-foreground` 都是深色。
- 當文字用的顏色換成淺色版：`--destructive-text`、`--status-positive-fg`、`--status-pending-fg`、`--module-leads-text`。
- 三個工作區維持分色，和多彩活力相同。
- 遮罩 `--background-color` 用黑色，不用文字色；陰影透明度調高，否則在深底上看不見。
- `color-scheme: dark`，讓捲軸與瀏覽器原生控制項跟著變深。
- 白底產品照在深色頁面上會比較亮，尚未和客戶確認。

### Color Roles

| 視覺角色 | Token | 主要用途 |
|---|---|---|
| High-contrast text | `--foreground` | 頁面主標題、高對比文字 |
| Work surface | `--background` | 登入後 app 背景、頁面主底色 |
| Elevated content | `--card` | 主要 Panel、Dialog、Stat Card、Table、Alert、Sonner / Toast |
| Anchored overlay | `--popover`, `--popover-foreground` | Dropdown Menu、Select、Date Picker、Month Picker、Generic Popover |
| Tooltip overlay | `--popover-foreground`, `--popover` | Tooltip 是 popover 的反轉：深色背景、淺色文字 |
| Main action | `--primary` | 主要按鈕、選取。文字用 `--primary-foreground` |
| Support action | `--secondary` | 次要按鈕。與 `--accent` 同色，文字用 `--secondary-foreground` |
| Emphasis | `--accent` | 強調、待處理。文字用 `--accent-foreground`，不可用白字 |
| Pending | `--status-pending-bg`, `--status-pending-fg` | 待處理徽章。`--status-warning` 是實心的琥珀 |
| Positive | `--status-positive-bg`, `--status-positive-fg` | 正向徽章 |
| Work area | `--module-leads`, `--module-products`, `--module-insights` | 導覽圖示與目前頁面、該區的分頁底線。`--module` 是目前頁面所屬的工作區 |
| Quiet metadata | `--muted-foreground` | Placeholder、breadcrumb、表格輔助文字、弱化說明 |
| Structure | `--border`, `--input` | Card border、table divider、input border |
| Destructive / Negative | `--destructive` | 錯誤、逾期與危險操作（例如刪除）的填色與邊框 |
| Destructive text | `--destructive-text` | 欄位錯誤訊息、危險操作的文字 |
| Sidebar | `--sidebar` | 與頁面同色的側選單，選中項使用所屬工作區顏色的淡色底 |

### Semantic Colors

| Token | Value | 用途 |
|---|---|---|
| `--background` | `var(--color-bg)` | App 整體背景底色 |
| `--foreground` | `var(--color-text)` | 主要文字、高對比 |
| `--card` | `var(--color-bg)` | 普通 cards、tables、panels、dialogs、Alert、Sonner / Toast 背景。與頁面同色，靠 `--border` 與 `--edge-highlight` 分層 |
| `--card-foreground` | `var(--color-text)` | 卡片內主要文字 |
| `--popover` | `var(--color-bg)` | Dropdown / Popover 背景，與卡片同色，靠陰影浮起；Tooltip 文字 |
| `--popover-foreground` | `var(--color-text)` | Dropdown / Popover 文字；Tooltip 背景 |
| `--primary` | `var(--color-primary)` | 主要 CTA、選取 |
| `--primary-foreground` | `var(--color-on-primary)` | Primary 背景上的文字 |
| `--secondary` | `var(--color-accent)` | 次要按鈕 |
| `--secondary-foreground` | `var(--color-text)` | Secondary 背景上的文字 |
| `--muted` | `var(--color-surface)` | 禁用態背景、弱化區塊、Tabs 底、中性徽章 |
| `--muted-foreground` | `var(--color-muted)` | Placeholder、次要說明文字 |
| `--accent` | `var(--color-accent)` | 強調、待處理 |
| `--accent-foreground` | `var(--color-text)` | 強調態上的文字 |
| `--destructive` | `var(--color-red)` | 錯誤、逾期與危險操作的填色與邊框 |
| `--destructive-text` | `#B91C1C` | 錯誤與危險文字，對比 6.47:1 |
| `--border` | `color-mix(in srgb, var(--color-text) 12%, var(--color-surface))` | 元件邊框、Table divider、Card border |
| `--input` | `color-mix(in srgb, var(--color-text) 16%, var(--color-bg))` | 輸入框預設邊框或弱化填色 |
| `--ring` | `var(--color-muted)` | Focus 狀態外層光環 |
| `--background-color` | `color-mix(in srgb, var(--color-text) 40%, transparent)` | Overlay 遮罩色 |

### Semantic Overlay Colors

| Token | Value | 用途 |
|---|---|---|
| `--semantic-background` | `var(--popover-foreground)` | Tooltip 語意背景 alias |
| `--semantic-border` | `color-mix(in srgb, var(--popover-foreground) 76%, var(--popover))` | Tooltip / Badge 語意邊框 |
| `--semantic-foreground` | `var(--color-bg)` | Badge `secondary`、Button `destructive-secondary` 在深色填色上的淺字 |

### Status Usage

| 狀態 | 建議 token | Badge 變體 | 用途 |
|---|---|---|---|
| Positive / Active | `--status-positive-bg`，文字 `--status-positive-fg` | `positive` | 啟用中、成交、上架。綠色 16% 的淡色底 |
| Warning / Pending | `--status-pending-bg`，文字 `--status-pending-fg` | `pending` | 待處理、今天跟進、熱度「溫」。琥珀 22% 的淡色底 |
| Neutral / Completed | `--muted`，文字 `--muted-foreground` | `neutral` | 已完成、已下架、已停用、已撤回或取消、熱度「冷」 |
| Negative / Overdue | `--destructive`，文字 `--primary-foreground` | `destructive` | 已逾期、錯誤 |
| Hot | `--status-hot`，文字 `--primary-foreground` | `hot` | 熱度「熱」 |

Badge 變體名稱依 `03-components.md` `Badge`。不代表業務狀態的標籤（例如標籤名稱）用 `third` 或 `outline`。

實心徽章只留給需要立刻注意的狀態，例如已逾期與熱度「熱」。每一列都會出現的狀態用淡色底，避免畫面失去層次。停用、取消不是需要立刻處理的狀態，用中性的 `neutral`，不用紅色。

狀態不可只靠顏色辨識，必須保留文字 label 或 icon + label。

### Chart Colors

| Token | 值 | 說明 |
|---|---|---|
| `--chart-1` | `var(--color-bg)` | 最淺 |
| `--chart-2` | `var(--color-surface)` | 表面色 |
| `--chart-3` | `var(--color-violet)` | 單序列，對比 5.70:1 |
| `--chart-4` | `var(--color-orange)` | 第二序列，對比 3.56:1 |
| `--chart-5` | `var(--color-green)` | 第三序列，對比 3.30:1 |
| `--chart-cat-1` 到 `--chart-cat-6` | 藍、紫、橘、琥珀、綠、灰藍 | 長條圖依項目循環用色。旁邊一定要有文字與數值 |

### Sidebar Colors

| Token | 值 | 用途 |
|---|---|---|
| `--sidebar` | `var(--color-bg)` | 側選單背景 |
| `--sidebar-foreground` | `var(--color-text)` | 側選單文字 |
| `--sidebar-primary` | `var(--color-surface)` | 使用者區塊展開時的背景。目前頁面用工作區顏色的淡色底 |
| `--sidebar-primary-foreground` | `var(--color-text)` | 使用者區塊展開時的文字 |
| `--sidebar-accent` | `var(--color-surface)` | 側選單表面色 |
| `--sidebar-accent-foreground` | `var(--color-text)` | 側選單表面色上的文字 |
| `--sidebar-border` | `color-mix(in srgb, var(--color-text) 12%, var(--color-bg))` | 側選單邊框 |
| `--sidebar-ring` | `var(--color-muted)` | 側選單 Focus ring |

### Primitive Aliases

> **Deprecated**：下表的 alias 是舊文件留下的 shorthand，已不再使用。`tokens.css` 沒有定義它們，新程式不要使用，一律改用「舊對應」欄的語意 token。表格只留著，方便看懂舊文件。

名稱和現在的色票對不上，容易用錯：`--accent-500`、`--color-accent-500` 指到藍色的 `--primary`，不是琥珀色的 `--color-accent`；`--primary-700`、`--color-primary-700` 指到琥珀色的 `--secondary`。`--color-primary` 是多彩活力的主色藍；`--color-primary-900` 這類帶數字的名稱不是主色色階。

| Alias（deprecated） | 舊對應 | 用途 |
|---|---|---|
| `--primary-900` | `var(--foreground)` | 舊文件 shorthand，對應 `--foreground` |
| `--primary-700` | `var(--secondary)` | 舊文件 shorthand，對應 `--secondary` |
| `--accent-500` | `var(--primary)` | 舊文件 shorthand，對應 `--primary` |
| `--color-primary-900` | `var(--foreground)` | `--foreground` |
| `--color-primary-700` | `var(--secondary)` | `--secondary` |
| `--color-accent-500` | `var(--primary)` | `--primary` CTA |
| `--color-neutral-0` | `var(--card)` | 卡片表面 |
| `--color-neutral-50` | `var(--background)` | App 背景 |
| `--color-neutral-200` | `var(--border)` | Divider / border |
| `--color-neutral-300` | `var(--input)` | Input border / weak fill |
| `--color-neutral-400` | `var(--muted-foreground)` | 弱化文字 |
| `--color-neutral-500` | `var(--ring)` | Focus ring |
| `--color-neutral-600` | `var(--muted)` | Muted fill |
| `--color-neutral-700` | `var(--card-foreground)` | 卡片內文字 |

不要任意補出不存在於 Figma token 的色階，例如 `primary-800` 或 `accent-600`。需要 hover / pressed 時，優先使用 opacity、color-mix 或設計稿已定義的 component state token。

### Neutral Palette (Tailwind 基礎灰階)

| Token | HEX | | Token | HEX |
|---|---|---|---|---|
| `neutral-50` | `#FAFAFA` | | `neutral-600` | `#525252` |
| `neutral-100` | `#F5F5F5` | | `neutral-700` | `#404040` |
| `neutral-200` | `#E5E5E5` | | `neutral-800` | `#262626` |
| `neutral-300` | `#D4D4D4` | | `neutral-900` | `#171717` |
| `neutral-400` | `#A3A3A3` | | `neutral-950` | `#0A0A0A` |
| `neutral-500` | `#737373` | | | |

非 neutral Tailwind 色系（amber, blue, emerald, red 等）預設不要出現在 UI 或 token gallery 中。只有在使用者明確指定需要某個 Tailwind 顏色時，才可局部使用該色，且不得取代 semantic tokens 作為主視覺。

---

## Typography

Figma text styles 以 `Inter` 匯出。介面若使用繁體中文，實作需保留 CJK fallback，避免中文字體落到不可控的瀏覽器預設。

`text-styles.json` 是已組合好的語意型 typography recipe（font family、size、line-height、weight 的成品），應歸在 Semantic 層使用；Primitive 層只放可被組合的基礎 size / weight / line-height token。
實作與文件標註使用 `source-reference/figma/variables-and-styles/text-styles.json` 內的文字 token 名稱，對應 `tokens.css` 的 `--text-*-*`。元件該用哪個文字 token 以 `03-components.md` 為準；`source-reference/screenshots/` 的截圖只是封存範例，不拿來判斷文字 token。`03` 沒寫到時，選用途最接近的 token，不要自行推測新的 font size、line-height、font weight。

| 屬性 | 設定 |
|---|---|
| **Font Family** | `Inter`, `Noto Sans TC`, `PingFang TC`, `Microsoft JhengHei`, sans-serif |
| **Font Weights** | Follow `text-styles.json` exported text-style tokens; do not create ad hoc numeric weights outside those recipes. |
| **Default Tracking** | `0px` |

### Type Scale

| Token | Size | Line Height | 常見用途 |
|---|---:|---:|---|
| `text-xs` | 12px | 16px | Caption、表格輔助資訊、狀態 pill |
| `text-sm` | 14px | 20px | Body、表單內容、按鈕文字、資料表 |
| `text-base` | 16px | 24px | Body Large、主要內文 |
| `text-lg` | 18px | 28px | 區塊標題 H3 |
| `text-xl` | 20px | 28px | 次標題 |
| `text-2xl` | 24px | 32px | 頁面主標題 H1、卡片主標題 H2 |
| `text-3xl` | 30px | 36px | 未登入入口頁的區塊標題 |
| `text-4xl` | 36px | 40px | Display |
| `text-5xl` | 48px | 48px | Display / chapter cover |

### Type Usage

- 頁面 H1 使用 `--foreground`，字重 700，保持短而明確。
- 管理頁表格與篩選列以 `text-sm` 為主，不放大成行銷型版面。
- 中文標題不要使用 negative tracking；Figma text styles 的 letter spacing 為 `0px`。
- 數字金額與統計值使用最接近的 `text-styles.json` value / emphasis token；同一卡片內不要混用過多文字 token 層級。

---

## Spacing (4px base)

| Token | px | rem | | Token | px | rem |
|---|---:|---:|---|---|---:|---:|
| `0` | 0 | 0 | | `6` | 24 | 1.5 |
| `0.5` | 2 | 0.125 | | `7` | 28 | 1.75 |
| `1` | 4 | 0.25 | | `8` | 32 | 2 |
| `1.5` | 6 | 0.375 | | `9` | 36 | 2.25 |
| `2` | 8 | 0.5 | | `10` | 40 | 2.5 |
| `2.5` | 10 | 0.625 | | `11` | 44 | 2.75 |
| `3` | 12 | 0.75 | | `12` | 48 | 3 |
| `3.5` | 14 | 0.875 | | `14` | 56 | 3.5 |
| `4` | 16 | 1 | | `16` | 64 | 4 |
| `5` | 20 | 1.25 | | `20` | 80 | 5 |

適用於 `p-*`, `m-*`, `gap-*`, `w-*`, `h-*` 等所有 Tailwind spacing utilities。`var(--space-*)` 定義在 `token-gallery/data/tokens.css`，數值同上表。

### Product Spacing Notes

- App page padding 優先使用 `--space-6` 到 `--space-8`。
- Card / panel 內距優先使用 `--space-5` 或 `--space-6`。
- 表單 label 與 input 間距使用 `--space-2`。
- 觸控裝置的點擊區至少 `44px`；視覺尺寸較小的控制項用外擴的點擊區補足（見 `03-components.md` `Icon Button`）。表格互動列至少 `40px`。這兩條不改變元件的外觀高度，Button、Input 等尺寸依 `03-components.md`。

---

## Radius

| Token | px | 適用場景 |
|---|---:|---|
| `--radius-none` | 0 | 無圓角 |
| `--radius-xs` | 2 | 極小元件（目前原型未使用） |
| `--radius-sm` | 6 | Checkbox、Badge、小型 Input、Chip |
| `--radius-md` | 8 | Button、Input 預設、Menu active |
| `--radius-lg` | 10 | Dropdown Menu、Alert、Sonner / Toast、小尺寸內層浮層或被包在內容中的元件 |
| `--radius-xl` | 14 | 主要 Panel、Dialog、Stat Card、Table、Alert Dialog |
| `--radius-2xl` | 18 | 僅保留給特殊大型展示面板；標準 Dialog / Alert Dialog 不使用此值 |
| `--radius-3xl` | 22 | 大面板 |
| `--radius-4xl` | 26 | 最大圓角容器 |
| `--radius-full` | 9999 | Avatar、Pill |

基本判斷原則：直接出現在頁面上的外層內容容器用 `--radius-xl`；需要點開的 overlay、被包在內層的元件、或本身尺寸較小的 feedback 元件用 `--radius-lg`。除 Avatar / Pill 外，不要任意放大成過度圓潤的 consumer app 風格。

---

## Borders & Strokes

| Token | 數值 |
|---|---:|
| `--border-width` | 1px |
| `--stroke-width` | 2px |

資料密集頁面優先用細邊框、`--edge-highlight` 與低陰影建立層級，不加頁面光暈。表格 row divider 使用 `--border`，不要用重色塊做分隔。

---

## Shadow

淺色介面用較低的陰影透明度，避免卡片看起來發髒。深色配色覆寫成較高的透明度。

| Token | CSS Value | 用途 |
|---|---|---|
| `--shadow-2xs` | `0px 1px 0px 0px rgba(0, 0, 0, 0.05)` | 極輕微邊緣 |
| `--shadow-xs` | `0px 1px 2px 0px rgba(0, 0, 0, 0.1)` | Panel、Stat Card、Table 外框、小卡片（都搭配 `--edge-highlight`） |
| `--shadow-sm` | `0px 1px 3px 0px rgba(0, 0, 0, 0.1)` | Tabs pill 選中項、Pagination 目前頁 |
| `--shadow-md` | `0px 2px 4px -2px rgba(0, 0, 0, 0.1), 0px 4px 6px -1px rgba(0, 0, 0, 0.1)` | Sonner / Toast、固定在底部的表單操作列、拖曳中的卡片 |
| `--shadow-lg` | `0px 4px 6px -4px rgba(0, 0, 0, 0.1), 0px 10px 15px -3px rgba(0, 0, 0, 0.1)` | Dropdown / Popover、Dialog、Alert Dialog |
| `--shadow-xl` | `0px 8px 10px -6px rgba(0, 0, 0, 0.1), 0px 20px 25px -5px rgba(0, 0, 0, 0.1)` | 大型 Overlay |
| `--shadow-2xl` | `0px 25px 50px -12px rgba(0, 0, 0, 0.25)` | 特殊高層級 Overlay |
| `--shadow-inner` | `inset 0px 2px 4px 0px rgba(0, 0, 0, 0.06)` | 內陰影 |
| `--shadow-glow` | `0px 8px 28px color-mix(in srgb, var(--color-primary) 35%, transparent)` | 只有 Button `primary` |
| `--edge-highlight` | `inset 0px 1px 0px color-mix(in srgb, var(--color-text) 12%, transparent)` | `--card`、`--popover` 頂邊 |

### Focus & Error Ring

| Token | CSS Value |
|---|---|
| `--shadow-focus-ring` | `0px 0px 0px 3px var(--color-muted)` |
| `--shadow-destructive` | `0px 0px 0px 3px rgba(220, 38, 38, 0.35)` |

所有可互動元素都必須有 focus 狀態。Button、Icon Button、Badge 等 boxed interactive variants focus 狀態使用 `box-shadow: var(--shadow-focus-ring)`，不使用會改變版面尺寸的 outline。Focus ring 使用實色 `--color-muted`，spread 為 3px。錯誤狀態除了 `--destructive` 邊框，也必須有錯誤文字，文字用 `--destructive-text`。

---

## CSS Variables (`:root`)

以下是 `token-gallery/data/tokens.css` 的節錄，以 `tokens.css` 為準；兩邊不一致時改這裡。海港晴光與深色的覆寫只在 `tokens.css` 最後兩段，這裡不列。這裡只列色彩、狀態、工作區、圖表、側欄、光暈、圓角、陰影、字級與間距；文字樣式 `--text-*-*`、`--tw-*`、`--primitive-*` 等只在 `tokens.css`。實作時直接載入 `tokens.css`，不要只複製這段。色彩以多彩活力為準，light mode。

```css
:root {
  color-scheme: light;

  /* 多彩活力 Vivid */
  --color-bg: #FFFFFF;
  --color-surface: #F3F5F9;
  --color-primary: #2563EB;
  --color-accent: #F59E0B;
  --color-text: #1F2430;
  --color-muted: #5B6472;
  --color-on-primary: #FFFFFF;

  /* 功能色：工作區、狀態與圖表用，不拿來裝飾 */
  --color-violet: #7C3AED;
  --color-orange: #EA580C;
  --color-amber: #D97706;
  --color-green: #16A34A;
  --color-red: #DC2626;
  --color-slate: #64748B;

  /* Semantic Colors */
  --background: var(--color-bg);
  --foreground: var(--color-text);
  --card: var(--color-bg);
  --card-foreground: var(--color-text);
  --popover: var(--color-bg);
  --popover-foreground: var(--color-text);
  --primary: var(--color-primary);
  --primary-foreground: var(--color-on-primary);
  --secondary: var(--color-accent);
  --secondary-foreground: var(--color-text);
  --muted: var(--color-surface);
  --muted-foreground: var(--color-muted);
  --status-positive-bg: color-mix(in srgb, var(--color-green) 16%, transparent);
  --status-positive-fg: #14532D;
  --status-pending-bg: color-mix(in srgb, var(--color-accent) 22%, transparent);
  --status-pending-fg: #713F12;
  --status-warning: var(--color-accent);
  --status-hot: #C2410C;

  /* 三個工作區 */
  --module: var(--color-primary);
  --module-leads: var(--color-orange);
  --module-leads-text: #C2410C;
  --module-products: var(--color-primary);
  --module-insights: var(--color-violet);
  --nav-icon: initial;
  --nav-icon-stroke: var(--stroke-width);
  --nav-active-bg: initial;
  --nav-active-fg: var(--foreground);
  --sidebar-avatar-bg: var(--primary);
  --sidebar-avatar-fg: var(--primary-foreground);
  --sidebar-avatar-open-bg: var(--sidebar-avatar-bg);
  --sidebar-avatar-open-fg: var(--sidebar-avatar-fg);
  --stat-icon-pos: var(--color-green);
  --stat-icon-leads: var(--color-orange);
  --lead-new-border: var(--accent);
  --timeline-share: var(--accent);
  --home-fact: var(--foreground);
  --home-rail-logo-border: var(--border);
  --theme-swatch-vivid: linear-gradient(135deg, #2563EB 50%, #F59E0B 50%);
  --theme-swatch-harbor-sun: linear-gradient(135deg, #006199 50%, #FFD444 50%);
  --theme-swatch-dark: linear-gradient(135deg, #0F1420 50%, #60A5FA 50%);
  --accent: var(--color-accent);
  --accent-foreground: var(--color-text);
  --destructive: var(--color-red);
  --destructive-text: #B91C1C;
  --border: color-mix(in srgb, var(--color-text) 12%, var(--color-surface));
  --input: color-mix(in srgb, var(--color-text) 16%, var(--color-bg));
  --ring: var(--color-muted);
  --background-color: color-mix(in srgb, var(--color-text) 40%, transparent);

  /* Semantic Overlay */
  --semantic-background: var(--popover-foreground);
  --semantic-border: color-mix(in srgb, var(--popover-foreground) 76%, var(--popover));
  --semantic-foreground: var(--color-bg);

  /* Chart */
  --chart-1: var(--color-bg);
  --chart-2: var(--color-surface);
  --chart-3: var(--color-violet);
  --chart-4: var(--color-orange);
  --chart-5: var(--color-green);
  --chart-cat-1: var(--color-primary);
  --chart-cat-2: var(--color-violet);
  --chart-cat-3: var(--color-orange);
  --chart-cat-4: var(--color-amber);
  --chart-cat-5: var(--color-green);
  --chart-cat-6: var(--color-slate);

  /* Sidebar */
  --sidebar: var(--color-bg);
  --sidebar-foreground: var(--color-text);
  --sidebar-primary: var(--color-surface);
  --sidebar-primary-foreground: var(--color-text);
  --sidebar-accent: var(--color-surface);
  --sidebar-accent-foreground: var(--color-text);
  --sidebar-border: color-mix(in srgb, var(--color-text) 12%, var(--color-bg));
  --sidebar-ring: var(--color-muted);

  /* Atmosphere */
  --glow-primary: radial-gradient(ellipse 72% 48% at 18% 0%, color-mix(in srgb, var(--color-primary) 22%, transparent), transparent 70%);
  --glow-accent: radial-gradient(ellipse 56% 42% at 88% 8%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 70%);
  --glow-empty: radial-gradient(ellipse 70% 60% at 50% 42%, color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 72%);
  --edge-highlight: inset 0px 1px 0px color-mix(in srgb, var(--color-text) 12%, transparent);
  --shadow-glow: 0px 8px 28px color-mix(in srgb, var(--color-primary) 35%, transparent);

  /* Radius */
  --radius-none: 0px;
  --radius-xs: 2px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 14px;
  --radius-2xl: 18px;
  --radius-3xl: 22px;
  --radius-4xl: 26px;
  --radius-full: 9999px;

  /* Borders */
  --border-width: 1px;
  --stroke-width: 2px;

  /* Shadow */
  --shadow-2xs: 0px 1px 0px 0px rgba(0, 0, 0, 0.05);
  --shadow-xs: 0px 1px 2px 0px rgba(0, 0, 0, 0.1);
  --shadow-sm: 0px 1px 3px 0px rgba(0, 0, 0, 0.1);
  --shadow-md: 0px 2px 4px -2px rgba(0, 0, 0, 0.1), 0px 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0px 4px 6px -4px rgba(0, 0, 0, 0.1), 0px 10px 15px -3px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0px 8px 10px -6px rgba(0, 0, 0, 0.1), 0px 20px 25px -5px rgba(0, 0, 0, 0.1);
  --shadow-2xl: 0px 25px 50px -12px rgba(0, 0, 0, 0.25);
  --shadow-inner: inset 0px 2px 4px 0px rgba(0, 0, 0, 0.06);
  --shadow-focus-ring: 0px 0px 0px 3px var(--color-muted);
  --shadow-destructive: 0px 0px 0px 3px rgba(220, 38, 38, 0.35);

  /* Font */
  --font-sans: "Inter", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 20px;
  --font-size-2xl: 24px;
  --font-size-3xl: 30px;
  --font-size-4xl: 36px;
  --font-size-5xl: 48px;

  /* Spacing aliases */
  --space-0: 0px;
  --space-0-5: 2px;
  --space-1: 4px;
  --space-1-5: 6px;
  --space-2: 8px;
  --space-2-5: 10px;
  --space-3: 12px;
  --space-3-5: 14px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 28px;
  --space-8: 32px;
  --space-9: 36px;
  --space-10: 40px;
  --space-11: 44px;
  --space-12: 48px;
  --space-14: 56px;
  --space-16: 64px;
  --space-20: 80px;
}
```
