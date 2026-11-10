---
name: publish-prototype
description: 把本機 HTML 原型驗證後更新到線上連結。使用者輸入 /publish-prototype 時使用。
disable-model-invocation: true
---

# Publish Prototype

把本機 HTML 原型更新到線上連結：https://claude.ai/artifact/3K1fGw3BCBtHB5KjiuVfQk

這個連結只給公司內部使用，`shared/roster.js` 含真實員工姓名與分機，`shared/registrations-2026.js` 含 2026 年尾牙報名表的真實姓名（決策 D-002）。拿到連結的人更新後會立刻看到，所以要先驗證，再由使用者確認。

- 只更新這個網址，不要另開新的，也不要改分享設定。
- 只有 Artifact 工具能發佈。沒有這個工具時，做完第 1 步就清掉發佈版本並說明，不要改用其他方式上傳。
- 發佈版本只由腳本產生。不要手動改 `.build` 裡的檔案，也不要為了發佈改原型原檔。
- 使用者取消或中途停止時，執行 `node .agents/skills/publish-prototype/scripts/build.js --clean`。

指令都在專案根目錄執行，以下把腳本簡寫成 `build.js`，路徑是 `.agents/skills/publish-prototype/scripts/build.js`。

## 1. 產生發佈版本

執行 `node build.js`。它會把頁面、`prototype/` 和 `tokens.css` 轉成發佈結構，放到 `.agents/skills/publish-prototype/.build/site/`，並和上次發佈的內容比對。

- **回報錯誤：** 通常是頁面引用了不存在的檔案。把錯誤轉告使用者並停止，不要繞過。
- **`changed`、`added`、`removed` 都是空的：** 告訴使用者線上版已是最新，執行 `--clean` 後結束。
- **`skipped` 有內容：** 這些檔案不會發佈，告訴使用者。

完成條件：取得腳本輸出的差異清單。

## 2. 檢查線上版

用 Artifact 的 `read` 和 `list`（`scope: "files"`）查線上網址，取得目前版本。

目前版本和腳本輸出的 `lastVersion` 不同時，代表上次記錄之後有人更新過線上版，差異清單不可靠。停下來告訴使用者，問要怎麼處理，不要覆蓋。使用者同意以線上版為新基準時，用 `read` 的 `paths` 下載所有線上檔案，執行 `node build.js --baseline <下載的資料夾> <版本>`，再回到第 1 步。

完成條件：線上版本和 `lastVersion` 一致。

## 3. 本機驗證

路徑轉換可能讓資源載入失敗，所以要開發佈版本，不是開原型原檔。頁面內容應該在修改時就驗證過，這一步只確認轉換後的版本沒有壞，不用逐頁目視。

執行 `node .agents/skills/sync-prototype/scripts/serve.js .agents/skills/publish-prototype/.build/site 4175`，再開 `http://localhost:<port>/seating.html`，port 以指令印出的為準。Claude 桌面版可以直接用 `.claude/launch.json` 的 `prototype-build`。

依序做：

1. 在這頁執行 `(await import('/__check.js')).default()`。它會用系統管理員視角，以 320 px 和 1280 px 載入每個頁面和詳情頁，回傳水平捲動、資源載入失敗和畫面空白的問題，完成後還原視角。`notRendered` 列出沒有檢查到實際內容的頁面，改到其中的頁面時要自己開來看。`__check.js` 只供本機檢查，不在 `publishFiles` 裡，不會發佈。
2. 讀 Console，確認沒有錯誤。
3. 截 `seating.html` 和最多 2 個改動最大的頁面，每頁 320 px 和桌面兩種寬度，確認元件沒有被裁切。

有問題就停下來告訴使用者。

工具能截圖但不能在頁面執行程式時，改成開 `seating.html` 和每個改到的頁面，每頁截兩種寬度。工具沒有現成的瀏覽器或截圖功能時，不要為此下載或安裝工具。照實說沒有驗證，由使用者決定是否仍要發佈。

完成條件：檢查結果和截圖都已看過，或已說明沒有驗證。

## 4. 讀過內容並確認

讀 `changed` 和 `added` 的每個檔案。發佈就是把內容交給所有拿到連結的人，要看過才發。原型應該只有示範資料；看到真實客戶資料、帳號或金鑰，停下來問使用者。

向使用者列出：

- 規格版本（`specVersion`）
- 會更新、新增、移除的檔案
- 本機驗證的結果，以及實際截圖看過哪幾頁
- 確認後，開著連結的人會立刻看到新版

等使用者看過清單後明確同意。輸入 `/publish-prototype` 本身不算同意。

完成條件：使用者看過清單並同意。

## 5. 發佈

用 Artifact 發佈：

- `url`：線上網址
- `file_path`：`.agents/skills/publish-prototype/.build/site/index.html`
- `root`：`.agents/skills/publish-prototype/.build/site`
- `files`：腳本輸出的 `publishFiles`，值是 `null` 的檔案會從線上移除

不要使用 `force`。發佈被拒絕時，例如線上版剛被更新，停下來告訴使用者，不要重試或覆蓋。

完成條件：Artifact 回報發佈成功。

## 6. 發佈後確認

1. 再用 `list` 查一次，確認發佈的檔案大小和 `.build/manifest.json` 一致。`index.html` 不用比，平台會替它包上外框。
2. 能開線上連結時，確認主頁和一個內頁正常；開不了就照實說明。原型放在 iframe 裡，頁面工具可能讀不到內容，這時用截圖確認。
3. 有問題時先不要記錄版本，告訴使用者線上版可能有問題，並保留 `.build`。
4. 都正常時，執行 `node build.js --record <線上版本>`。它會記錄這次的內容，並清掉 `.build`。

回報網址、新版本、更新的檔案和驗證結果，並提醒使用者：

- 已開著的頁面要重新整理才看得到新版。
- 改了示範資料時，看過的人要按示範工具列的「重設資料」才看得到新資料。
