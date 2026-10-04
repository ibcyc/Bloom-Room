# Bloom Room

A local roommate demo with a shared 3D home, a sandbox house editor, household tasks, Pip the cat, music and two visual moods. Built with vanilla HTML/CSS/JavaScript, Three.js and Anime.js.

這份專案已包含執行所需的圖片、字型、音樂、函式庫及預設房屋。**不需要 API key、帳號服務、資料庫或建置步驟。**

## 下載後啟動（建議）

1. 從 GitHub 下載 ZIP，先完整解壓縮。
2. 在包含 `index.html` 的資料夾開啟終端機。
3. 使用 Node.js 20 以上版本執行：

   ```sh
   npm start
   ```

   或直接執行 `node tools/serve.cjs`。**不用先跑 `npm install`。**

4. 瀏覽器開啟 **http://127.0.0.1:8767/**。展示結束後，在終端機按 Ctrl+C 停止。

Windows、macOS 和 Linux 使用相同指令。若 8767 已被其他程式使用，執行 `node tools/serve.cjs 8768`，改開 http://127.0.0.1:8768/。

如果已安裝 Python 3，也可以使用：

```sh
python3 -m http.server 8767 --bind 127.0.0.1
```

Windows 可使用 `py -m http.server 8767 --bind 127.0.0.1`。

### 不安裝任何工具的快速預覽

完整解壓後直接雙擊 `index.html`。本機腳本與預設房屋支援 `file://`；但不同瀏覽器對本機檔案的存檔、IndexedDB 和音訊限制不同。**需要展示匯入、自訂模型、媒體及穩定保存時，請使用上方的本機伺服器方式。**

## Demo 路線

1. 等開場動畫結束，或按 **Skip to login**。
2. 輸入任意展示用 ID；這是本機示範，沒有真實登入驗證。
3. **My Community → Create a Room**，輸入房名並進入預設房屋。
4. 點家具操作互動；右下角齒輪進入編輯。**Object → ＋** 新增物件，**R** 旋轉、**M** 移動選取物件，**SAVE** 保存。
5. 右上角 **Help** 查看操作；Window 可以切換天氣與日夜，Mood 選單可以切換兩種風格。
6. 需要從頭展示：離開房間 → **My Profile → Reset demo**。這會清除目前網址下的本機示範資料，保留程式與預設房屋；需要留存的房屋先 Export。

也可以 **Join a Room**，使用 `RB42` 或 `SUNNY3` 查看加入流程；`FULL4` 示範房間已滿。

## 瀏覽器與存檔

- 使用支援 WebGL 2 的桌面瀏覽器，並啟用 JavaScript 與硬體加速。觸控裝置也有對應控制；大型模型與多盞陰影燈會提高 GPU 負擔。
- 圖片、音樂、字型及函式庫均從本專案載入，啟動後不需 CDN。第一次互動前，瀏覽器可能限制自動播放音樂。
- 資料只存在使用者自己的 `localStorage` / `IndexedDB`。下載者會建立自己的資料，不會取得作者瀏覽器中的存檔。
- 瀏覽器、網域和連接埠不同，就是不同存檔空間；例如 `localhost` 與 `127.0.0.1` 不共用資料。Demo 時建議固定使用同一網址。
- 上傳的照片、模型、音樂保存在瀏覽器；要搬到另一台裝置，請使用房屋的 Export / Import。
- HanziPen TC 使用裝置已安裝字型；沒有此字型時改用隨專案附上的 Caveat。開場使用 Barriecito，細長按鈕使用 Amatic SC。
- 帳號、配對、邀請、門的通知與公開設定都是**本機原型流程**，沒有跨裝置同步或對外通知服務。

## 上傳 GitHub

將**此資料夾裡的內容**放在 repository 根目錄，讓 `index.html` 和本 README 位於最外層。不要只上傳 ZIP 本身，也不要漏掉 `assets/`、`house/` 或 `vendor/`。

這份上傳版已排除設計參考原圖、Logo 中間檔、錄影、系統隱藏檔及本機工具設定，並提供 `.gitignore` 防止之後誤加。GitHub 網頁手動上傳不會替你套用 `.gitignore`，請直接使用這份乾淨資料夾。

原始 `.js`、CSS、預設 JSON、測試程式及授權資訊都保留；測試截圖、快取和 `node_modules` 不需上傳。所有頁面與素材使用相對路徑，可放在靜態網站的子目錄下。

## 檔案與驗證

| 路徑 | 用途 |
| --- | --- |
| `index.html`、`script.js`、`style.css` | App 入口與流程 |
| `design.js`、`design.css`、`fonts.css` | 動畫、主題與字體 |
| `house/` | 3D 房屋、互動、預設配置與音樂 |
| `assets/`、`vendor/` | 執行資源與附屬授權 |
| `tools/serve.cjs` | 不需依賴套件的本機伺服器 |
| `tests/` | 開發用測試；不需執行也能展示 |
| `README.txt`、`ARCHITECTURE.txt` | 完整操作手冊與程式架構 |

檢查包內檔案及資料測試（只需 Node.js）：

```sh
npm run check
npm test
```

瀏覽器回歸測試供開發者使用，另需安裝 Chrome 和 Playwright：`npm install --no-save --package-lock=false playwright`。保持 `npm start` 執行，再於另一個終端機執行例如 `node tests/design.test.cjs`。測試使用獨立瀏覽器設定檔；輸出截圖放在已被忽略的 `test-artifacts/`。可用 `ROOMBLOOM_URL` 環境變數指定其他測試網址。

## 素材與授權

- Three.js / GLTFLoader：MIT，見 `vendor/THREE-LICENSE.txt`。
- Anime.js：MIT，見 `vendor/ANIME-LICENSE.md`。
- 附帶字型：各自的 SIL Open Font License，見 `assets/fonts/*-OFL.txt`。
- 預設 lofi：HoliznaCC0，CC0，曲目及來源見 `house/audio/CREDITS.txt`。
- 設計素材來源見 `assets/design/CREDITS.txt`；未打包裝置上的 HanziPen TC 系統字型。

品牌顯示為 Bloom Room；內部 `RoomBloomHouse` 命名與 `roombloom-*` 存檔鍵保留以相容現有資料。
