# Seat Arrangement

Cursor、Claude Code、Codex 都從這個檔案讀取專案規則；`CLAUDE.md` 以 `@AGENTS.md` 引用本檔。

目前階段：依 `docs/plan/implementation-plan.md` 實作。實作依據是正式規格 `docs/spec/`；標「待確認」的項目照目前假設做，規格沒寫到的不要自行假設需求。

## 依照文件開發

- 實作前先讀 `docs/` 中相關的規格。規格沒寫到或彼此矛盾時，先問使用者，不要自己決定。
- 決策事項統一寫入 `docs/decision-record.md`，包括待決議事項、已決議的決定，以及決策過程（考慮過的選項、取捨、討論經過）。在對話中問使用者得到的決定也要寫入（`product-spec.md` 的修改除外，見下方），不要只留在對話裡，也不要分散寫在其他文件；其他文件需要提到某個決定時，引用條目編號。已決議的條目要保留，作為決策依據。寫法見該檔開頭。
- 所有專案文件都放在 `docs/`，不要在其他位置新增文件。
- 只產生、保留當下重要且有價值的文件。內容過時就直接修改或刪除，不要另開新檔，也不要保留舊版段落，避免文件量膨脹。

文件架構：

```text
docs/
├── product-spec.md       # 暫時的產品規格：只用來產生第一版 HTML 原型、和使用者討論，討論完即刪除
├── decision-record.md    # 決策紀錄：待決議與已決議事項，以及決策過程
├── architecture.md       # 技術架構草案：模組設計、資料、API、認證與部署
├── questionnaire-*.md    # 暫時問卷：給使用者或其他人填寫，答案寫回後刪除
├── glossary/             # 名詞與參考資料（例如外部資料表），依專案需要補充；已加入 .gitignore
├── spec/                 # 正式規格：和使用者確認後的需求，實作依據
├── plan/                 # 實作計畫
└── standard/             # 文件模板與規範，只當範本，不放專案內容
    ├── PRD.md、SRS.md、SAD.md、API.md、DB.md    # 各類文件的模板
    └── LOG_Design_Guideline.md                   # Log 設計規範，寫 log 時要遵守
```

`product-spec.md` 是獨立的暫時文件：對它的任何修改（包括確認事項與需求決定）都直接改在檔內，不寫入 `decision-record.md`，也不和 `docs/` 其他文件互相引用或同步。和使用者討論完後會刪除，之後以 `spec/` 為準。

視覺規範與 HTML 原型頁面不在 `docs/`，在 `ui-design-system/`（見最後一節）。

專案自建的 skill（`/grill-me`、`/to-questionnaire`、`/sync-prototype`、`/publish-prototype`）本體放在 `.agents/skills/`，`.claude/skills/` 只放指向本體的入口，不要重複內容。

線上原型只在使用者輸入 `/publish-prototype` 時更新。不要主動提議發佈，也不要自行更新。

## 測試與驗證

- 開始實作新功能前，先依規格新增或更新對應的測試。測試要完整：正常流程、邊界條件、錯誤情況、角色權限差異，以及規格中的每一條驗收條件。
- 每次改動後都要執行**全部**測試，不能只跑相關的部分。全部通過才算完成。
- 寫測試和跑測試由兩個獨立的 sub-agent 負責：寫的不跑，跑的不改。Claude Code 使用 `.claude/agents/` 的 `test-writer` 和 `test-runner`；其他工具依同樣分工開兩個 sub-agent。流程：
  1. `test-writer` 依規格新增或更新測試
  2. 主 agent 實作
  3. `test-runner` 執行全部測試並回報
  4. 有失敗就修實作，再交給 `test-runner` 重跑，直到全部通過
- 前端改動要截圖驗證：用瀏覽器開啟改到的頁面，至少截 320px 和桌面兩種寬度，檢查版面、文案、整頁水平捲動與元件裁切。原型階段改的就是 `ui-design-system/source-reference/html/` 本身，所以對照 `docs/product-spec.md` 第 7 節與設計系統的 references；寫正式程式時，再對照 `ui-design-system/source-reference/html/` 的對應頁面。回覆中說明截了哪些頁面、發現什麼問題。
- 不能為了讓測試通過而刪除、跳過或放寬既有測試。如果是測試本身寫錯，先說明原因再改。
- 測試沒跑、跑不起來或有失敗，回覆中要照實說明並附上失敗的輸出，不能說已完成。

### 測試指令

若日後拆成多個 repo，各 repo 在自己的 `AGENTS.md` 寫自己的測試指令。找不到指令時先問使用者，不要自己猜。

| Repo／目錄 | 執行全部測試 | 備註 |
|---|---|---|
| 根目錄（Next.js 應用程式） | `npm test` | 依序跑型別檢查、lint、單元測試、整合測試、E2E。先 `npm run db:up` 啟動本機 MySQL（Docker），並有 `.env`（複製 `.env.example`）。平行的功能線用自己的 `TEST_DATABASE_NAME` 與 `E2E_PORT`（`docs/plan/implementation-plan.md` 第 5.3 節）。E2E 用本機的 Google Chrome，先 `next build` 再用 `next start` 跑（開發模式會整頁重新載入，測試不穩）；除錯時可設 `E2E_DEV=1` 改用 `next dev` |
| `ui-design-system/source-reference/html/`（HTML 原型） | 無自動化測試 | 用瀏覽器截圖驗證 |

## Git

- 不要自行執行 `git add`、`git commit`、`git stash`、`git tag`、`git push`。只修改工作目錄中的檔案，git 操作由使用者自己做。
- 不要開 PR／MR：不要用 `gh`、`glab` 或 GitLab API 建立 merge request。

## 改完之後

在回覆最後附一句 commit message，放在 code block 裡方便複製：

- 單行、一句話，格式 `<type>: <中文描述>`
- type 只用 `feat`、`fix`、`chore`、`docs`、`refactor`
- 例：`feat: 增加 runner 頁面`、`fix: sonarqube page log`

## UI Design System

> 本段同步自 `ui-design-system/AGENTS.md`。更新設計系統套件時只替換這一段，不要覆蓋整個檔案，以免蓋掉上面的專案規則。

Cursor, Claude Code, and Codex use this file to find the same design system. The specification itself stays in `SKILL.md`. Do not copy that file.

### Design system root

Resolve `<root>` before reading any design-system path:

- If `source-reference/html/` exists at the project root, `<root>` is `.`
- Otherwise, if `ui-design-system/source-reference/html/` exists, `<root>` is `ui-design-system/`

All `source-reference/`, `token-gallery/`, and `.cursor/skills/ui-design-system/` paths below are relative to `<root>`. If this package folder is renamed, update that folder name here.

### When doing UI

For any UI component, layout, styling, or retrofit:

1. Read `<root>/.cursor/skills/ui-design-system/SKILL.md` and follow its Progressive Loading protocol. Do not read every reference file.
2. Page regions, copy, and arrangement come from `<root>/source-reference/html/` when that folder has a matching page file.
3. Component shape, variants, states, and dimensions come from `<root>/.cursor/skills/ui-design-system/references/03-components.md`.
4. Color, type, spacing, radius, and shadow come from the semantic tokens in `02-foundations.md` and `<root>/token-gallery/data/tokens.css`.

### Do not

- Do not treat the host app's current UI as the visual source. Keep its business logic.
- Do not invent colors, spacing, or component structures. Map HTML colors back to semantic tokens.
- Do not introduce page-level horizontal overflow. Layouts must work from 320px to desktop.
- Do not fix Dropdown or Popover clipping by raising `z-index`. Use the portal / floating layer behavior in `03-components.md`.
- Do not introduce non-neutral Tailwind palettes unless the user explicitly requests a specific Tailwind color.
- Do not invent a page structure. Follow the matching HTML file. If none exists, use `04-patterns-and-ux.md` `New Feature Unit Composition`.
- Do not treat loaded reference sections as loose inspiration. Follow the Spec Execution Protocol in `SKILL.md`.
