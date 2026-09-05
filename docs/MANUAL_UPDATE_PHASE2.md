# TeachingRecord2 第二階段手動更新指南

本次更新只修改前端介面與行事曆呈現方式，不建立新 Firebase 專案，也不修改 Firebase 資料。現有 Firebase 設定、`records/` 資料根節點、出缺勤、成績、收費、學生主檔與遷移預覽工具均保留。

## 本次更新內容

`src/App.jsx` 已加入學習手冊風格的新首頁、彩色摘要卡、較寬的桌面版配置、活潑卡片式班級清單，以及行事曆的月曆／週曆切換。週曆會以七欄呈現每一天的事件與上課班級；點選日期後仍可進入該日的班級點名。既有事件新增、編輯、刪除、多日與不連續日期功能仍使用原本的資料邏輯。

## 建議的手動更新方式：GitHub Desktop

請先下載本次提供的 `TeachingRecord2-ui-refresh.zip` 並解壓縮。開啟 GitHub Desktop，選擇本機的 `TeachingRecord2` repository，將解壓縮資料夾中的內容複製到本機 repository 根目錄並覆蓋同名檔案。請確認至少覆蓋 `src/App.jsx`；若要一併保留本指南，也可覆蓋 `docs/MANUAL_UPDATE_PHASE2.md`。

在 GitHub Desktop 檢查變更，確認只有預期的前端檔案與文件被修改。輸入 commit 訊息 `feat: refresh dashboard and add month-week calendar views`，按下 **Commit to main**，再按 **Push origin**。這是唯一需要推送的地方，不需要啟用任何其他整合。

## 若只想用 GitHub 網頁更新

在 `TeachingRecord2` repository 中進入 `src/`，選擇 **Add file → Upload files**，上傳新版 `src/App.jsx`，並確認檔名與路徑仍是 `src/App.jsx`。Commit 訊息可使用 `feat: refresh dashboard and add month-week calendar views`。接著在 `docs/` 資料夾上傳 `MANUAL_UPDATE_PHASE2.md`，或暫時略過文件上傳。

GitHub 網頁上傳時不要上傳 `node_modules/`、`dist/`、`.git/`、`.env` 或 Firebase 備份 JSON。不要把整個壓縮檔當成唯一檔案上傳，否則 GitHub 不會自動展開專案結構。

## 本機驗證

在 repository 根目錄執行：

```bash
npm ci
npm test
npm run build
```

測試應顯示 33 項通過。建置成功後，使用 `npm run dev` 開啟本機預覽；登入後，首頁應看到新版彩色摘要區與新版行事曆。行事曆右上方應有「月曆／週曆」切換鈕。切換週曆後，應看到週日到週六七欄；點選任何一天，下面的班級與事件內容應跟著改變。

## 資料安全注意事項

本次更新不會執行資料匯入、資料庫切換、資料刪除或永久清除學生紀錄。正式 Firebase 資料仍由原本的 `teaching-record` 專案提供。若未來要切換到新的 Firebase 專案，應另行建立新專案、建立備份、進行唯讀遷移預覽，並在確認轉換結果後才匯入。

## GitHub Pages 資產 404 修正

如果瀏覽器錯誤顯示資產請求為 `/TeachingRecord/assets/...`，而 repository 是 `TeachingRecord2`，表示 `vite.config.js` 仍使用舊的 base 路徑。請將：

```js
base: "/TeachingRecord/",
```

改成：

```js
base: "/TeachingRecord2/",
```

修改後重新建置並提交。部署網址應為 `https://yzhsage.github.io/TeachingRecord2/`，而不是舊的 `https://yzhsage.github.io/TeachingRecord/`。建置後的 `dist/index.html` 應引用 `/TeachingRecord2/assets/...`。若您刻意把 GitHub Pages 綁定在舊的 `/TeachingRecord/` 網址，則必須反過來確認實際部署的 repository 與 workflow；一般情況下，repository 名稱與 Vite base 必須一致。
