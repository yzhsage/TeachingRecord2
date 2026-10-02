# 學生優先資料庫遷移方案

## 目前狀態

`TeachingRecord2` 目前仍使用舊 Firebase 專案與 `records/` 根節點。實際正式資料仍以班級名單為主要入口；`studentIndex` 目前是相容索引，不是獨立的新資料庫，也不會自動取代舊班級資料。

## 第二階段目標

第二階段先產生一份**學生優先匯入檔**，不直接連線 Firebase。每一個學生 ID 都獨立成為主檔，學生在不同班級的加入日、停班日、復課日、學校與數A／數B 分組則保存在該學生的 enrollment 中。出缺勤、平時考、段考與收費紀錄同樣以學生 ID 為主鍵，並保留班級 ID 與日期脈絡。

## 建議的新資料結構

```text
students/{studentId}
  name
  school
  grade
  group
  enrollments/{classId}
    className
    subject
    grade
    joinDate
    endDate
    resumeDate
    school
    group

students/{studentId}/attendance/{classId}/{date}
  status

students/{studentId}/assessments/{classId}/{assessmentId}
  type
  name
  date
  score
  range

students/{studentId}/fees/{classId}/{chargeId}
  amount
  date
  description

classes/{classId}
  name
  subject
  grade
  sourceRef

calendarEvents/{eventId}
  title
  type
  dates
  schools
```

這個結構不以姓名合併學生。姓名只作為顯示與人工比對資料；不同學生 ID 即使同名，也必須保持為不同學生。學生在多個班級出現時，仍是同一個 `students/{studentId}`，但擁有多筆 enrollment。

## 班級頁面的相容方式

新資料庫的正規資料以學生為主，但班級頁面仍可保留。載入班級時，先從 `classes/{classId}` 取得班級資料，再依學生 enrollment 篩選該班學生，最後讀取每位學生在該班的紀錄。這樣可以維持班級點名的操作方式，同時避免同一學生在不同班級被複製成不同主檔。

若未來需要大量班級矩陣查詢，可以另外建立可重建的 `classViews/{classId}` 衍生索引；它不是正規資料來源，任何時候都能由 `students/*/enrollments` 與學生紀錄重新產生。

## 安全遷移流程

第一步是從現行系統匯出 JSON 備份，並執行只讀預覽。第二步使用本次提供的轉換工具產生 `student-first-import.json`，檢查學生數量、同名候選、孤兒紀錄與各班 enrollment。第三步建立新的 Firebase 專案與測試資料庫，只匯入測試環境。第四步以新系統逐項核對學生、班級、出缺勤、成績、收費與行事曆。最後才由使用者明確確認是否切換 App 的 Firebase 設定。

在使用者確認以前，不會寫入舊 Firebase，也不會刪除舊資料。轉換工具的輸出仍應視為候選匯入檔，不應直接當作正式資料庫覆蓋檔。

## 必須人工確認的項目

同名不同 ID、只有歷史紀錄而已不在名單的學生、同一學生在不同班級的學校或分組衝突、停班日與復課日互相矛盾，以及成績或收費沒有對應班級的紀錄，都必須列入人工確認清單。工具不會根據姓名自行合併，也不會自行刪除孤兒紀錄。
