# CWA 氣象與海象綜合數據整合儀表板

以中華民國交通部中央氣象署（CWA）開放資料為基礎，整合氣象觀測、二維格點、預報警戒、海象監測、航線安全、休閒指數、地震報告以及天文曆法數據的**全方位氣象海象整合儀表板**。

本專案為 **純前端單頁 Web 應用程式 (SPA)**（HTML5 + Vanilla CSS + ES6+ Modules），無需任何後端伺服器，適合直接佈署於 **GitHub Pages**。

👉 **[點此訪問線上展示版](https://chichawang.github.io/CWAopendataVIS/)** *(請將連結替換為您的實際 GitHub Pages 網址)*

---

## 🌟 核心整合功能分頁 (6大主題)

本儀表板將氣象署 100+ 個開放資料集進行了系統化分類，設計為六大功能分頁：

1. **即時觀測與格點分析**：
   - 整合綜觀氣象站、雨量站、日射量及 UV 指數觀測。
   - 採用 Leaflet Canvas 渲染二維**雷達整合回波 (dBZ)** 與 **QPESUMS 定量降雨估計**，支援滑鼠游標移入即時數值檢索。
   - 支援 Himawari-9 台灣衛星雲圖覆蓋與落雷即時監測。
2. **天氣預報與災害警報**：
   - 即時顯示 CWA 天氣警特報（豪大雨、強風、低溫特報）跑馬燈橫幅。
   - 視覺化各縣市 36 小時、7 天預報及冷/熱傷害健康氣象指數。
   - 颱風期間自動疊加颱風即時位置、路徑預測與暴風圈半徑。
3. **即時海象與藍色公路**：
   - 地圖標記全台浮標（浪高/週期/海溫）與潮位站（潮位高度），並提供 48h 歷史觀測圖表（Chart.js）。
   - 繪製台灣主要藍色公路渡輪航線，整合船長與噸位參數，評估未來 4 天各航線的航行舒適度與波浪翻覆風險。
4. **地震海嘯與地球物理**：
   - 繪製本年度震央位置（圓圈大小代表規模，顏色代表深度），可檢索等震度圖影像（`L.imageOverlay`）。
   - 疊加 GNSS 地表位移向量場，以向量箭頭直觀展現台灣板塊構造運動速度。
5. **休閒育樂與景點預報**：
   - 提供 🚴單車、🏕️山區/國家公園、🏄海灘/衝浪、🌌觀星 等戶外景點之專屬適合度指數計算器（結合雲量、降雨率與相對濕度）。
6. **天文曆法與氣候統計**：
   - 天文日曆（國農曆、二十四節氣對照）與當前月相 3D 光影模擬。
   - 可視化各縣市太陽/月亮天空高度角與方位軌跡弧線。
   - 分析今年實測值相較於 30 年氣候平均值（Climatological Normal）的氣候距平對比圖。

---

## 📊 介接 CWA 開放資料集代號 (CWA Data Catalog)

本系統所介接之氣象署開放資料集代號對照如下：

| 功能分頁 | 資料集 ID | 資料集名稱 | 資料格式與介接方式 |
| :--- | :--- | :--- | :--- |
| **Tab 1: 即時觀測** | `O-A0003-001`<br>`O-A0002-001`<br>`O-A0091-001`<br>`O-A0005-001`<br>`O-A0059-001`<br>`O-B0045-001`<br>`O-B0028-003` | 10分鐘綜觀氣象資料<br>雨量站雨量資料<br>氣象站日射量資料<br>每日紫外線指數最大值<br>雷達整合回波資料 (網格)<br>QPESUMS 過去1小時定量降雨估計 (網格)<br>紅外線彩色衛星雲圖 (台灣) | JSON (REST datastore API)<br>JSON (REST datastore API)<br>JSON (Fileapi)<br>JSON (REST datastore API)<br>JSON (Fileapi)<br>JSON (Fileapi)<br>JPG (Fileapi) |
| **Tab 2: 預報警報** | `W-C0033-001`<br>`W-C0033-002`<br>`W-C0034-005`<br>`F-C0032-001`<br>`F-C0032-005`<br>`F-A0085-002`<br>`M-A0085-001` | 各縣市天氣警特報情形<br>天氣警特報之內容及受影響區域<br>熱帶氣旋/颱風路徑資料<br>今明 36 小時天氣預報<br>一週縣市天氣預報<br>冷傷害及溫差指數五日預報<br>熱傷害指數五日預報 | JSON (REST datastore API)<br>JSON (REST datastore API)<br>JSON (REST datastore API)<br>JSON (REST datastore API)<br>JSON (REST datastore API)<br>JSON (REST datastore API)<br>JSON (REST datastore API) |
| **Tab 3: 海象航線** | `O-B0075-001`<br>`O-B0076-001`<br>`O-B0069-001`<br>`O-B0070-001`<br>`F-A0012-001`<br>`F-A0037-xxx`<br>`F-B0080-001`<br>`F-B0082-001` | 48小時浮標與潮位海況觀測<br>浮標與潮位站測站資訊<br>大潮監測資料<br>長浪監測資料<br>海面天氣預報<br>藍色公路航線逐時海氣象預報<br>船舶安全舒適度預報 (4天)<br>船舶噸位作業風險預報 (4天) | JSON (REST datastore API)<br>JSON (Fileapi)<br>JSON (Fileapi)<br>JSON (Fileapi)<br>JSON (Fileapi)<br>JSON (REST datastore API)<br>JSON (REST datastore API)<br>JSON (REST datastore API) |
| **Tab 4: 地震物理** | `E-A0015-001`<br>`E-A0015-003`<br>`E-A0015-005`<br>`E-A0016-001`<br>`O-B0057-002` | 顯著有感地震報告<br>等震度圖影像<br>行政區觀測震度資料<br>小區域有感地震報告<br>地表 GPS 位移速度場資料 | JSON (REST datastore API)<br>JPG (REST datastore API)<br>JSON (Fileapi)<br>JSON (REST datastore API)<br>JSON (Fileapi) |
| **Tab 5: 休閒景點** | `F-B0053-xxx` | 遊樂區、農場、單車道、觀星、水上活動等景點預報 | JSON (REST datastore API) |
| **Tab 6: 天文統計** | `A-A0087-001`<br>`A-B0062-001`<br>`C-B0027-001` | 國農曆/月相/節氣對照表<br>全台年度日出日落時刻資料<br>地面測站月氣候平均值 (30年正常值) | JSON (Fileapi)<br>JSON (REST datastore API)<br>JSON (REST datastore API) |

---

## 📁 專案檔案結構

本專案採用高度模組化且對 GitHub Pages 友善的相對路徑結構：

```
CWAdataVIS/
├── index.html                  # 統一入口與毛玻璃 Dashboard 骨架
├── css/
│   └── main.css                # 統一的 Glassmorphism UI 樣式表
├── js/
│   ├── app.js                  # 核心控制器（路由、地圖初始化與切換）
│   ├── api.js                  # API 統一管理（記憶體+localStorage 雙層快取、請求去重、逾時控制）
│   ├── utils.js                # 連續/離散色階著色、風向量 SVG、天文軌跡算法
│   ├── tab_observation.js      # Tab 1: 觀測、格點 Canvas 疊加與衛星雲圖
│   ├── tab_forecast.js         # Tab 2: 天氣/颱風預報、警特報、健康預警
│   ├── tab_marine.js           # Tab 3: 海象指標、航線安全與船舶風險評估
│   ├── tab_earthquake.js       # Tab 4: 地震震央、等震圖、GNSS 位移場
│   ├── tab_recreation.js       # Tab 5: 休閒主題分類與景點適合度指數
│   └── tab_astronomy.js        # Tab 6: 天文曆法軌跡與氣候距平對比
└── README.md
```

---

## 🚀 GitHub Pages 部署步驟

本專案無需任何編譯（Build）或依賴安裝步驟，上傳後即可直接運行：

1. **將程式碼推送至 GitHub 儲存庫**：
   ```bash
   git init
   git add .
   git commit -m "feat: implement unified modular weather dashboard"
   git remote add origin https://github.com/您的帳號/CWAdataVIS.git
   git branch -M main
   git push -u origin main
   ```
2. **開啟 GitHub Pages 服務**：
   - 前往您的 GitHub 專案頁面，點選頂部的 **Settings**。
   - 點選左側選單的 **Pages**。
   - 在 **Build and deployment** 下方的 **Source** 選擇 `Deploy from a branch`。
   - 在 **Branch** 下拉選單選擇 `main` 分支與 `/ (root)` 資料夾，然後點選 **Save**。
3. **完成部署**：
   - 等待約 1-2 分鐘，GitHub 會自動在頁面頂端生成您的專案網址（格式通常為 `https://您的帳號.github.io/CWAdataVIS/`）。

> ⚠️ **常見部署失敗原因**：`index.html` 必須位於**儲存庫根目錄**。若解壓縮後將整個資料夾推上去（變成 `repo/CWAdataVIS-main/index.html`），Pages 網址只會顯示 404 或 README。
>
> ⚠️ **File API 限制**：`fileapi` 資料集（雷達格點、衛星雲圖、日射量、海象測站座標、天文日曆）由 S3 供檔，瀏覽器可能因 CORS 無法取得；本系統已對這些圖層優雅降級（顯示提示、不影響其它功能）。REST datastore API 支援 CORS，所有核心功能均正常。

---

## 🔑 安全性與金鑰管理

* **金鑰儲存**：本專案已在 `js/api.js` 中預載入您的 API 授權碼，打開頁面即可直接瀏覽。
* **安全性保證**：所有的 API 請求皆直接由瀏覽器發送至 CWA 官方伺服器，**絕不上傳至任何第三方伺服器**。用戶亦可透過主介面的「金鑰管理」功能隨時變更儲存在瀏覽器 `localStorage` 中的授權碼。
