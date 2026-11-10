# 實作計畫

| 項目 | 內容 |
|---|---|
| 版本 | v0.1 |
| 日期 | 2026-11-10 |
| 依據 | `docs/spec/`（正式規格）、`docs/architecture.md`（技術架構）、`docs/decision-record.md` |
| 讀者 | 使用者、主 agent、各線的實作與測試 agent |

只排順序與分工，不排時程。

## 1. 原則

- **先做共用、再分線平行。** 每條功能線都會用到的東西（資料表、共用型別、API 契約、App Shell、儲存佇列、UI 元件、登入、測試環境）由主 agent 一次做完（階段 1）。之後彼此不相關的功能才分線同時做（階段 2），最後由主 agent 整合（階段 3）。
- **用 git worktree 隔離、依檔案分工**（D-006）。每條線在自己的 worktree 開發，隨時可以跑全部測試；每條線只改自己擁有的檔案（第 4.2 節），要改共用檔案時先停下來回報，由主 agent 改，減少合併衝突。
- **每項功能都照同一個流程**（`AGENTS.md`）：
  1. `test-writer` 依該功能的規格寫測試。
  2. 實作。
  3. `test-runner` 跑測試並照實回報，有失敗就修實作，直到全部通過。
  4. 前端改動要截圖（至少 320 px 與 1280 px），對照 `ui-design-system/source-reference/html/` 的原型頁面。
- **階段結束時全部測試都要通過**，才進下一個階段。

## 2. 階段總覽

| 階段 | 內容 | 誰做 | 完成條件 |
|---|---|---|---|
| 0 規格定稿 | 把暫時規格轉成 `docs/spec/`，每個功能一份、寫出驗收條件 | 主 agent；使用者同時準備 aiborn | `docs/spec/` 可以直接拿來寫測試 |
| 1 地基 | 專案骨架、測試環境、資料表、API 契約、共用元件、App Shell、登入、部署 | 主 agent，依序 | 全部測試通過；本機 Docker 映像可執行；部署到 aiborn 一次 |
| 2 功能 | 四條線同時進行：員工名單、參與人員、座位安排、自動排座與匯出 | 每線一組 agent，平行 | 各線的測試通過、截圖對照原型 |
| 3 整合 | 接上跨線的功能，跑完整情境與全部測試 | 主 agent | 核心情境 E2E 通過；全部頁面在六種寬度截圖無問題 |
| 4 上線 | 正式環境、Google 登入、匯入真實名單、和承辦人演練 | 主 agent ＋ 使用者 | 承辦人用正式網址完成一次完整排座 |

## 3. 階段 0：規格定稿

把 `docs/product-spec.md`（v0.16）轉成正式規格，分檔讓各線只讀自己需要的部分：

| 檔案 | 內容 | 給哪條線 |
|---|---|---|
| `docs/spec/README.md` | 範圍、使用者、用語、共用規則：App Shell、立即儲存與儲存狀態、多人衝突（D-004）、登入與登出（D-003）、通用狀態、設計與文案規範 | 全部 |
| `docs/spec/employees.md` | 員工名單（EMP-01～06），含匯入通訊錄 | A |
| `docs/spec/participants.md` | 參與人員（PPL-01～07）與加入尾牙（EMP-03） | B |
| `docs/spec/seating.md` | 座位安排（SEAT-01～09、11）：座位圖、人員面板、桌次詳情、工作人員桌、復原 | C |
| `docs/spec/auto-arrange.md` | 自動排座（SEAT-10） | D |
| `docs/spec/export.md` | 匯出座位表（PLT-03） | D |

- 每份都要有「驗收條件」，`test-writer` 直接照著寫測試。
- 暫時規格的確認事項都已有答案：Q3（Logo 與配色）、Q20（同仁都有公司 Google 帳號）已和承辦人確認，Q7（參與人員匯入格式）依 D-010。各功能規格自己列的待確認，依 D-008 照目前假設實作。
- 只有原型才有的內容（示範工具列、示範資料、確認點）不寫進正式規格。

使用者同時要做的事：在 aiborn 建立專案（動態網站）並建立 MySQL 資料庫，並告知用的是個人方案還是商務方案。

## 4. 階段 1：地基（主 agent 依序做）

這些檔案每條線都會用到，所以不平行。

### 4.1 工作項目

1. **專案骨架**：Next.js（App Router，`output: "standalone"`）、TypeScript strict、ESLint、Prettier、Tailwind CSS 接上 `tokens.css`、Lucide。
2. **測試環境**：
   - Vitest（單元、整合）與 Playwright（E2E，分 320 px 與 1280 px 兩組）。
   - `docker-compose.yml` 起 MySQL 8.4，所有 worktree 共用同一個 MySQL。測試資料庫名稱與 E2E 用的埠號都由環境變數指定，每條線用自己的一組，平行跑測試不會互相干擾。
   - `npm test` 跑全部測試，並把指令補進 `AGENTS.md` 的測試指令表。
3. **資料**：完整的 Prisma schema（三張表一次定好，避免平行時各自加 migration 而衝突）、第一個 migration（含 30 桌與工作人員桌的 INSERT）、seed 的骨架（`src/server/seed.ts`，伺服器啟動時由 `src/instrumentation.ts` 執行；員工表空且有資料檔時才匯入，D-007）、產生虛構測試資料的工具。
4. **共用程式**：
   - `src/domain/`：`types.ts`、`layout.ts`（30 桌排列）、`display.ts`（顯示名稱、分機、桌次部門標示）。
   - `src/contracts/`：**所有 API 的 zod 輸入格式與回應型別**。各線照契約各自實作前端與後端，不必等別條線。
   - `src/server/`：`db.ts`、`http.ts`（錯誤格式）、`log.ts`、`csv.ts`（編碼判斷與解析，A、B 線共用）。
   - `GET /api/state`。
5. **前端共用**：
   - 依設計系統調整的 shadcn/ui 元件：Button、Icon Button、Input、Checkbox、Badge、Dropdown Menu（action-menu、select、user-menu）、Dialog、Alert Dialog、Alert、Sonner、Tooltip、Skeleton、Tabs、Pagination、Table。
   - App Shell：Sidebar、Header、Mobile Drawer、使用者區塊。
   - `src/client/`：store、儲存佇列、復原、儲存狀態。
   - 找不到頁面、載入中、空狀態。
6. **登入**：Auth.js v4 + Google、公司網域檢查、`src/proxy.ts`（Next.js 16 的 proxy，舊名 middleware）、登入頁、登出；E2E 用的測試登入工具（只在測試環境）。
7. **部署**：Dockerfile、`docker-entrypoint.sh`、`/api/health`。先在本機用 Docker 跑起來連 compose 的 MySQL，再部署到 aiborn 一次，確認 SSL 連線與 migrate。部署後拿到正式網址，**使用者立刻在平台送 Google OAuth 用戶端申請**（人工審核要等）。

### 4.2 檔案歸屬（給階段 2 用）

主 agent 擁有、各線不能直接改的共用檔案：`prisma/`、`src/contracts/`、`src/domain/{layout,display,auth-policy}.ts`、`src/server/{db,database-config,http,log,csv,auth,seed,seed-startup}.ts`、`src/server/services/state.ts`、`src/client/`、`src/components/ui/`、`src/components/shell/`、`src/styles/`、`src/app/layout.tsx`、`src/app/not-found.tsx`、`src/app/(main)/layout.tsx`、`src/app/login/`、`src/app/api/{auth,state,health}/`、`src/app/dev/`、`src/proxy.ts`、`src/instrumentation.ts`、`tests/helpers/`、`tests/setup/`、`tests/e2e/helpers/`、`package.json`、`package-lock.json`、設定檔。

各線的頁面（`src/app/(main)/page.tsx`、`people/page.tsx`、`employees/page.tsx`）在階段 1 只有標題，由對應的線改寫。頁面內要用 store 時用 `src/client/app-provider.tsx` 的 `useAppStore`、`useMutation`；要新增共用元件或 store 欄位時先回報主 agent。

### 4.3 完成條件

- 全部測試通過。
- 截圖：登入頁、App Shell 的三個頁面（先放空狀態），320 px 與 1280 px，和原型對照。
- 本機 Docker 映像可以啟動、`/api/health` 回 200。
- 部署到 aiborn 成功、資料庫連得上。
- 使用者 `git init`、確認 `.gitignore`（排除 `node_modules`、`.next`、`.env*`、`docs/glossary/` 的真實資料、測試產物），commit 基準版。

## 5. 階段 2：功能（四條線平行）

### 5.1 分線

| 線 | 範圍 | 擁有的檔案 | 測試重點 |
|---|---|---|---|
| A 員工名單 | EMP-01～06 | `src/domain/{employees,roster-import}.ts`、`src/server/services/employees.ts`、`src/app/api/employees/**`、`src/app/(main)/employees/**`、`src/components/features/employees/**`、對應的 `tests/**/employees*` | 匯入規則（略過設備列與「空位」、合併分機、N/A、以姓名加部門對應、錯誤列）；刪除已報名員工的連動；搜尋、篩選、分頁、勾選多筆 |
| B 參與人員 | PPL-01～07、加入尾牙（EMP-03 的 API） | `src/domain/{participants,participant-import}.ts`、`src/server/services/participants.ts`、`src/app/api/participants/**`、`src/app/(main)/people/**`、`src/components/features/people/**`、對應的 `tests/**/participants*` | 三種類別的規則；一位員工最多一位眷屬；取消報名與刪除的連動；工作人員勾選；匯入 |
| C 座位安排 | SEAT-01～09、11 | `src/domain/seating-rules.ts`、`src/server/services/seating.ts`、`src/app/api/{seating,tables}/**`、`src/app/(main)/page.tsx`、`src/components/features/seating/**`、對應的 `tests/**/seating*` | 每個指令的規則、回傳的復原資料與復原；兩人同時搶同一桌最後一個位子；拖移、縮放、找人的 E2E |
| D 自動排座與匯出 | SEAT-10 的演算法、PLT-03 | `src/domain/{auto-arrange,seating-sheet}.ts`、`src/server/excel.ts`、`src/app/api/export/**`、對應的 `tests/**/{auto-arrange,export}*` | 用示範資料驗證自動排座的結果（第 3–23 桌中沒有備註名稱的 18 桌填滿、第 24 桌 6 位、只有硬體設計組與維修拆成兩桌）；匯出版面模型每一格的位置與內容 |

- C 線最大、風險最高：**第一步先做縮放座位圖上的拖移最小驗證**（滑鼠、觸控、鍵盤），通過才繼續。
- D 線兩個都是純函式為主，彼此獨立，一條線做完兩個。

### 5.2 跨線的地方

照 `src/contracts/` 各做各的，留到階段 3 再接起來：

| 功能 | 誰做什麼 |
|---|---|
| 員工名單的「加入尾牙」 | A 做按鈕與對話框，呼叫 B 實作的 API |
| 自動排座 | D 做演算法；C 在座位異動 API 預留 `autoArrange` 指令與工具列按鈕；階段 3 接上 |
| 匯出座位表按鈕 | B 在參與人員頁放按鈕；D 做下載 API |
| 參與人員的「第 n 桌」徽章 | B 連到座位安排頁並標示那一桌；C 支援網址參數 |

### 5.3 平行時的規則

| 線 | 分支 | 測試資料庫 | E2E 埠號 |
|---|---|---|---|
| A | `lane/a-employees` | `seat_test_a` | 3101 |
| B | `lane/b-participants` | `seat_test_b` | 3102 |
| C | `lane/c-seating` | `seat_test_c` | 3103 |
| D | `lane/d-arrange-export` | `seat_test_d` | 3104 |

- 每條線在自己的 worktree（從基準版建立）開發，先 `npm ci`，再用上表的資料庫與埠號。
- 只改自己擁有的檔案。需要改共用檔案時停下來回報主 agent；主 agent 在主分支改好、使用者 commit 後，各線再合併主分支的更新。
- 每次改動都跑全部測試（`npm test`），全部通過才算完成那一步。
- agent 不 commit。線完成時回報：改了哪些檔案、測試結果、截圖與發現的問題；由使用者在該 worktree commit，再合併回主分支。
- 建議合併順序：D → A → B → C（由小到大，衝突最少）。每合併一條，主 agent 在主分支跑一次全部測試。

## 6. 階段 3：整合（主 agent）

1. 接上第 5.2 節的跨線功能，補上對應的整合測試。
2. 端到端測試：
   - 核心情境全流程：登入 → 匯入員工 → 加入尾牙 → 自動排座 → 拖移微調 → 設定備註名稱 → 名單異動 → 匯出 → 手機查詢。
   - 多人衝突：兩個瀏覽器同時操作同一桌。
3. 全部頁面在 320、375、430、768、1024、1280 px 截圖，對照原型；檢查整頁水平捲動與元件裁切。
4. seed 匯入真實名單（D-007）：寫 `registration-import.ts`（Google 表單報名表），seed 依序用 A 線的 `roster-import.ts` 與它匯入；測試用虛構的通訊錄與表單 CSV，涵蓋員工表已有資料時跳過、兩個執行個體同時啟動只匯入一次。
5. 全部測試通過。

## 7. 階段 4：上線

1. 使用者：OAuth 用戶端核准後在平台按「帶入環境變數」；設定 `ALLOWED_EMAIL_DOMAIN=program.com.tw`。
2. 部署正式版，用公司帳號登入，再用非公司帳號確認會被擋。
3. 用 seed 匯入真實名單（D-007）：第一次部署的手動 ZIP 帶上 `prisma/seed-data/roster.csv`（通訊錄加「組別」欄）與 `registrations.csv`（Google 表單報名表），看 Log 的匯入摘要確認筆數；成功後刪掉本機資料檔。再匯出座位表，和 2025 年的座位表比對版面。
4. 和承辦人實際演練一次完整排座，手機上也試一次。

## 8. 成本與注意事項

- 階段 2 同時有四條線，每條線各有寫測試、實作、跑測試的 agent，token 用量明顯比依序做高。
- `AGENTS.md` 規定 git 操作由使用者自己做：基準版 commit、各線 commit 與合併都由使用者執行，agent 只改工作目錄裡的檔案。
- 每個 worktree 都要各自 `npm ci`，會多佔一些磁碟空間與安裝時間。
