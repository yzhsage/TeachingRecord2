覆蓋方式：把本資料夾裡的 index.html、src、scripts 整個複製到專案根目錄，遇到同名檔案選「取代」。
不需要刪除任何舊檔；package.json、firebase.rules.json、public 等其他檔案完全沒有動。

【修改的既有檔案 13 個】
  index.html
  scripts/studentRecords.test.mjs
  src/App.jsx
  src/AuthGate.jsx
  src/ParentPortal.jsx
  src/StudentCard.jsx
  src/StudentOverview.jsx
  src/assessment.js
  src/main.jsx
  src/portalPublish.js
  src/studentFirstStorage.js
  src/studentRecords.js
  src/students.js

【新增的檔案 13 個】
  scripts/assessmentRows.test.mjs
  scripts/assessmentTabs.test.mjs
  scripts/classSync.test.mjs
  scripts/dateFormat.test.mjs
  scripts/friendlyError.test.mjs
  scripts/membership.test.mjs
  scripts/theme.test.mjs
  src/DateTimeFields.jsx
  src/assessmentRows.js
  src/classSync.js
  src/dateFormat.js
  src/friendlyError.js
  src/theme.js

覆蓋後請執行：npm test（應為 60 項全過）、npm run build。
