# CWA 氣象與海象綜合數據整合儀表板（GitHub Pages 修正版）

本專案為純前端 SPA（ES Modules，無需編譯），可直接部署於 GitHub Pages。本次改版針對「GitHub Pages 上無法顯示」進行 code review 與重寫優化。

---

## 🔧 本次修正的關鍵問題

### 1. 啟動流程卡死（頁面空白的主因）
* 原本 `app.js` 使用 `window.onload` 啟動 — 只要任一 CDN 資源（Google Fonts、圖磚、FontAwesome）載入緩慢或被擋，`load` 事件延遲觸發，整頁空白。ES Module 本身具 defer 特性，現改為模組載入後**立即啟動**。
* 原本金鑰驗證失敗（包含**網路/CORS 錯誤**）一律擋在金鑰輸入閘。現改為三態判斷：只有金鑰**確定無效**才顯示輸入閘；網路異常時照常進入儀表板並顯示提示。
* 初始化例外會顯示在頁面上（不再無聲空白）。

### 2. File API 的 CORS 限制（多個分頁壞掉的主因）
`fileapi/v1/opendataapi` 會 302 轉址到 S3（`cwaopendata.s3.amazonaws.com`），瀏覽器端 fetch 可能因 CORS 被擋。所有 fileapi 呼叫（雷達格點、衛星雲圖、日射量、海象測站座標、天文日曆）現在：
* 全部 `catch` 並優雅降級（toast 提示，不再 `alert()` 中斷、不再拖垮整個分頁）。
* 海象分頁在座標檔取不到時，自動降級為**測站列表模式**，觀測數據與 48h 圖表照常可用。

### 3. API 回應格式解析錯誤（資料抓到了卻顯示不出來）
* `O-B0075-001`（海象觀測）實際結構為 `Records.SeaSurfaceObs.Location[]`（大寫），原程式讀 `records.Station` → 永遠空白。已修正。
* `W-C0033-001`(警特報) 實際結構為 `records.location[].hazardConditions.hazards[]`，原程式讀 `records.warning` → 警報永遠不顯示。已修正。
* `A-B0062-001`（日出日沒）為新版欄位 `CountyName / SunRiseTime / SunSetTime`，原程式解析舊版 `parameterName` 格式 → 永遠顯示預設值。已修正。

### 4. 過度抓取資料（每次載入數 MB → 數十 KB）
| 資料集 | 原本 | 現在 |
| :--- | :--- | :--- |
| O-B0075-001 海象 | 全部測站完整 48h 序列（數 MB） | 初載僅抓近 3 小時快照（~80KB）；點選測站才抓**單站** 48h |
| A-B0062-001 日出日沒 | 全台 22 縣市整年（數 MB） | 僅「選定縣市＋今日」（<1KB） |
| E-A0015/0016 地震 | 全部歷史報告 | `limit=15 / 30` |
| O-A0091 日射量 (fileapi) | 每次進分頁就抓 | 使用者選「日射量」變數時才抓 |
| 雷達/QPESUMS 格點 | （原本即為選用）| 維持選用載入，快取 5 分鐘 |

另外：
* 快取三層化：記憶體 + `localStorage` 持久快取（預報/曆法/氣候值跨頁重整免重抓）+ in-flight 去重（同資源同時只發一個請求）。
* 各分頁改用 `Promise.allSettled` 平行抓取：載入更快、單一資料集失敗不影響其它。
* 所有請求加 30 秒逾時（AbortController）。

### 5. API 金鑰
預設金鑰 `CWA-A2436D95-6750-4FD1-BB03-E4B9148C5FC6` 已內建於 `js/api.js`，開頁即用；「金鑰管理」可隨時更換（存於瀏覽器 localStorage）。

---

## 🚀 GitHub Pages 部署檢查清單

1. **index.html 必須位於儲存庫根目錄**（最常見的失敗原因：解壓縮後把整個資料夾推上去，變成 `repo/CWAdataVIS-main/index.html` → 網址開起來 404 或只顯示 README）。
2. Settings → Pages → Source 選 `Deploy from a branch`，Branch 選 `main` / `/(root)`。
3. 已加入 `.nojekyll`（避免 Jekyll 處理干擾）。
4. 部署後網址格式：`https://<帳號>.github.io/<repo>/`。修改推送後記得等 1-2 分鐘並強制重新整理（Ctrl+F5）。
5. 開啟後若有問題，按 F12 看 Console — 現在所有錯誤都會顯示成頁面右下角 toast 與 console 訊息，不會再無聲空白。

## 🧪 本地測試

```bash
# 專案根目錄執行（ES Modules 不能用 file:// 直接開）
py -m http.server 8000
# 瀏覽 http://localhost:8000
```

驗證重點：六個分頁切換、測站點選 Popup、海象測站點選後 48h 圖表（延遲載入）、警特報跑馬燈、天文分頁縣市切換。
