# 學生優先資料庫：身分、班級與 ID 規則

## 核心結論

學生是一個跨學年、跨學習階段、跨學校名稱變更仍然存在的**長期身分**。因此，學生 ID 不得由姓名、學校、年級、班級、分組或日期組合而成；這些欄位都可能改變。學生 ID 必須在建立學生時隨機產生，之後永久保留。

> **學生是主檔；班級是學生在某一段時間參與的學習關係；學校、年級與分組是這段關係的歷史屬性。**

## 一、ID 產生規則

| 實體 | 建議 ID | 是否可更改 | 不可使用的欄位 |
|---|---|---:|---|
| 學生 | `stu_` + UUID v4 | 否 | 姓名、學校、年級、班級、電話 |
| 班級實例 | `cls_` + UUID v4 | 否 | 班級名稱、年級、學校、年度 |
| 班級延續線 | `lin_` + UUID v4 | 否 | 顯示名稱、學年、學習階段 |
| 學生 enrollment | `enr_` + UUID v4 | 否 | 學生姓名、班級名稱 |
| 遷移對照項 | `map_` + UUID v4 | 否 | 舊 ID 本身 |

新的 UUID 由系統使用密碼學安全的亂數產生；不可使用姓名雜湊、Firebase push key 的重新計算結果、舊版 `s1`／`s2` 或「學校＋姓名」作為新 ID。新 ID 的唯一責任是辨識同一個長期學生身分，不承載任何可變資料。

若系統需要顯示較短的識別碼，可以另外保存 `displayCode`，但它只是畫面顯示用，不能作為資料關聯鍵。

## 二、學生主檔

```text
students/{studentId}
  id                 // stu_...，不可變
  displayName        // 目前顯示姓名，可修正
  aliases[]          // 歷史姓名或匯入時的姓名，不作為 ID
  createdAt
  updatedAt
  notes
```

學校、年級與分組不放在學生主檔作為唯一現況，因為這些欄位會隨時間或學習階段改變。若要顯示目前狀態，可由有效中的 enrollment 計算，或另保存帶有效日期的 profile history。

## 三、班級必須分成「延續線」與「班級實例」

同一班級名稱在不同年份不一定是同一個班；反過來，不同名稱也可能是同一條教學延續線。因此需要兩層：

```text
classLineages/{lineageId}
  id                 // lin_...，代表一條經人工確認的班級延續線
  label              // 例如「國中理化班延續線」
  subjectFamily      // 例如「理化」
  stage              // junior_high 或 senior_high 等

classes/{classId}
  id                 // cls_...，代表一個學期／學年中的實際班級
  lineageId          // 可為 null，未確認前不可自行推測
  name               // 例如「國二理化班」
  school
  academicYear
  term
  grade
  subject
  stage
  startDate
  endDate
  continuationStatus // new、continuation、closed、uncertain
```

「國二理化班 → 國三理化班」可以在人工確認後使用同一個 `lineageId`，但仍然是兩個不同的 `classId`，因為年級、年度與實際名單可能不同。「國三理化班 → 高一物化班」預設建立新的 `lineageId` 與新的 `classId`；除非使用者明確認定兩者是同一條教學延續線，系統不自行延續。

## 四、enrollment 才保存學生的時間脈絡

```text
students/{studentId}/enrollments/{enrollmentId}
  id                 // enr_...
  studentId          // stu_...
  classId            // cls_...
  lineageId          // 快取欄位，來源仍以 classes/{classId} 為準
  school             // 此班、此時期的學校
  grade              // 此班、此時期的年級
  stage              // 國中或高中
  group              // 數A、數B、未分組
  joinDate
  endDate
  resumeDate
  status             // active、ended、paused、uncertain
  sourceRefs[]       // 舊備份來源位置
```

因此，陳宥晴可以被保存為同一個 `stu_...`：

| 時期 | classId | lineageId | 學校 | 年級 | 班級 | 狀態 |
|---|---|---|---|---|---|---|
| 國二 | `cls_j2_physics` | `lin_junior_physics` | 港明 | 國二 | 國二理化班 | ended |
| 國三 | `cls_j3_physics` | `lin_junior_physics` | 港明 | 國三 | 國三理化班 | ended |
| 高一 | `cls_s1_physics` | `lin_senior_physics` | 港明 | 高一 | 高一物化班 | active 或 ended |

廖婕茹同樣是另一個獨立的 `stu_...`，但 enrollment 的學校可不同：

| 時期 | classId | lineageId | 學校 | 年級 | 班級 | 狀態 |
|---|---|---|---|---|---|---|
| 國二 | `cls_j2_physics` | `lin_junior_physics` | 安南 | 國二 | 國二理化班 | ended |
| 國三 | `cls_j3_physics` | `lin_junior_physics` | 安南 | 國三 | 國三理化班 | ended |
| 高一 | `cls_s1_physics` | `lin_senior_physics` | 港明 | 高一 | 高一物化班 | active 或 ended |

這兩個例子證明：**學校不能作為學生 ID 的一部分**，而必須成為 enrollment 的有效期間屬性。

## 五、紀錄的正規關聯

出缺勤、成績與收費都必須同時保存 `studentId` 與 `classId`；不能只有學生 ID，因為同一學生可能同時參加多個班級，也不能只有班級內的舊 ID。

```text
attendance/{attendanceId}
  studentId
  classId
  date
  status

assessments/{assessmentId}
  studentId
  classId
  assessmentColumnId
  type
  score
  date

fees/{feeId}
  studentId
  classId
  amount
  date
```

`classId` 保留班級脈絡，`studentId` 保留跨班級的學生身分；兩者缺一不可。班級矩陣是查詢畫面，不是正規資料來源，可以由學生與紀錄重新組合產生。

## 六、舊資料 ID 的處理方式

舊版 `s1`、`s2` 等值只能作為**來源參考**，不能直接升格為新學生 ID。對舊紀錄的定位至少使用：

```text
sourceBackupId + classId + legacyStudentId + occurrenceIndex
```

例如 `s1` 在高中物化班代表陳宥晴，在國中自然班代表鄭育安，兩者應先形成兩個待確認的遷移 occurrence，再各自指向不同的新 `stu_...`。同一個舊 ID 在不同班級重複使用時，`classId` 是拆分上下文；如果同一班內仍有多個姓名使用相同舊 ID，則再使用 roster occurrence index 與人工確認。

在人工對照完成前，匯入工具必須輸出 `canImport: false`。系統不可以用姓名、學校或年級自動猜測合併結果。

## 七、建立與修改原則

新增學生時先建立不可變的 `studentId`，再建立一筆 enrollment；不要先建立班級內的臨時學生再期待日後自動合併。學生轉班時新增或結束 enrollment，不建立新的學生主檔。學校或年級改變時更新新的 enrollment 或 profile history，不更換學生 ID。學生停班時填寫 enrollment 的 `endDate`；復課時填寫 `resumeDate` 或建立新的 enrollment，依是否仍屬同一班級實例決定。

任何自動化合併都必須先產生候選清單，再由使用者確認。確認紀錄本身應保存操作者、時間、原始來源與決定理由，以便日後追溯。

## 八、案例驗證：陳宥晴與廖婕茹

以下使用示意性的全新 ID，刻意不沿用備份中的 `s1`、`s5` 等舊 ID。兩位學生各自只有一個長期學生 ID；即使兩人經歷相同的班級名稱，也不會因班級名稱相同而共用 ID。

```json
{
  "students": {
    "stu_chen_you_qing": {
      "id": "stu_chen_you_qing",
      "displayName": "陳宥晴",
      "enrollments": [
        {"classId": "cls_j2_physics", "lineageId": "lin_junior_physics", "school": "港明", "grade": "國二", "stage": "junior_high"},
        {"classId": "cls_j3_physics", "lineageId": "lin_junior_physics", "school": "港明", "grade": "國三", "stage": "junior_high"},
        {"classId": "cls_s1_physics", "lineageId": "lin_senior_physics", "school": "港明", "grade": "高一", "stage": "senior_high"}
      ]
    },
    "stu_liao_jie_ru": {
      "id": "stu_liao_jie_ru",
      "displayName": "廖婕茹",
      "enrollments": [
        {"classId": "cls_j2_physics", "lineageId": "lin_junior_physics", "school": "安南", "grade": "國二", "stage": "junior_high"},
        {"classId": "cls_j3_physics", "lineageId": "lin_junior_physics", "school": "安南", "grade": "國三", "stage": "junior_high"},
        {"classId": "cls_s1_physics", "lineageId": "lin_senior_physics", "school": "港明", "grade": "高一", "stage": "senior_high"}
      ]
    }
  }
}
```

在這個案例中，`cls_j2_physics` 與 `cls_j3_physics` 共用 `lin_junior_physics`，表示國二到國三是同一條國中理化班延續線；`cls_s1_physics` 使用新的 `lin_senior_physics`，表示升上高中後是新班級延續線。兩位學生的 `studentId` 不變，但學校由 enrollment 各自記錄，因此陳宥晴可以始終是港明，廖婕茹則可以由安南轉為港明。

## 九、這個模型對遷移的直接影響

舊資料若只有「姓名、班級、舊 ID」，系統可以先建立一筆**待確認 occurrence**，但不能立即建立正式學生主檔。每個 occurrence 必須包含舊備份檔、班級實例、舊 ID、原始姓名、學校、年級、分組與紀錄範圍。人工確認後，才把多個 occurrence 指向某一個正式 `stu_...`，或建立新的 `stu_...`。

因此，下一版遷移工具不應直接把 `s1` 轉成一個學生，而應先輸出：

```text
legacy occurrence -> confirmed studentId -> enrollmentId -> classId
```

這會讓「同一舊 ID 在不同班級代表不同人」與「同一個人跨多班延續」都能被清楚分開處理。

## 十、第一版身分對照模板

工具 `scripts/migration-identity-template.mjs` 會從備份建立 `identity-map.template.json`。每一筆 occurrence 都有穩定的 `occurrenceKey`，例如 `class:...:roster:0:legacy:s1`；這個鍵只代表備份中的一列，不代表正式學生身分。

人工確認時，應將同一位長期學生的多筆 occurrence 填入相同的 `confirmedStudentId`，並為每筆班級關係確認 `confirmedEnrollmentId`。`classInstances` 則需要填寫學校、學年、學期與 `suggestedLineageId`；國二、國三若確認是同一班延續線就使用同一個 `lineageId`，跨國高中則預設使用新的 `lineageId`。

```bash
node scripts/migration-identity-template.mjs /path/to/教學紀錄備份.json ./identity-map.template.json
```

模板中所有 `confirmedDecision`、`confirmedStudentId`、`confirmedEnrollmentId` 與 `lineageDecision` 預設為待確認。只要仍有任何待確認欄位，匯入工具就必須保持 `canImport: false`。

## 十一、補習班情境覆寫規則

本文件前段的通用 `classLineages` 設計是早期草案；針對本補習班實際需求，現行規則以 `DATA_MODEL_TUTORING_CENTER.md` 為準。班級不保存學校，不強制學期，也不要求使用者填寫延續群組。班級使用系統自動產生且不可變的 `classId`；顯示名稱與年級可依年度更新。學生的學校與年級則保存於該年度／班級的 `classRecord` 中。

人工確認畫面不顯示任何 UUID，也不要求輸入 ID。使用者只需對班級選擇「沿用同一班」或「建立新班」，對學生選擇「建立新學生」或「與既有學生相同」。正式 `studentId`、`classId` 與 `classRecordId` 均由系統在確認後自動產生。
