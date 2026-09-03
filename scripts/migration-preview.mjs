#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const inputPath = process.argv[2];
const outputDir = process.argv[3] || path.join(process.cwd(), "migration-preview");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizedName(value) {
  return text(value).replace(/\s+/g, "").toLocaleLowerCase();
}

function ensureStudent(map, id, details = {}) {
  if (!id) return null;
  if (!map.has(id)) {
    map.set(id, {
      id,
      names: new Set(),
      schools: new Set(),
      grades: new Set(),
      classes: new Map(),
      sources: new Set(),
    });
  }
  const item = map.get(id);
  if (text(details.name)) item.names.add(text(details.name));
  if (text(details.school)) item.schools.add(text(details.school));
  if (text(details.grade)) item.grades.add(text(details.grade));
  if (details.classId) {
    item.classes.set(details.classId, {
      className: text(details.className),
      joinDate: text(details.joinDate),
      endDate: text(details.endDate),
      resumeDate: text(details.resumeDate),
      group: text(details.group),
    });
  }
  if (details.source) item.sources.add(details.source);
  return item;
}

function countAttendance(attendance, studentMap, classInfo) {
  let dates = 0;
  let cells = 0;
  for (const [date, day] of Object.entries(attendance || {})) {
    const records = day?.records && typeof day.records === "object" ? day.records : {};
    const ids = Object.keys(records).filter((id) => records[id] !== "" && records[id] != null && (!Array.isArray(records[id]) || records[id].length > 0));
    if (ids.length > 0) dates += 1;
    for (const id of ids) {
      cells += 1;
      ensureStudent(studentMap, id, { classId: classInfo.id, className: classInfo.name, source: "attendance", name: "" });
    }
  }
  return { dates, cells };
}

function countScores(data, studentMap, classInfo, source) {
  let cells = 0;
  const scores = data?.scores && typeof data.scores === "object" ? data.scores : {};
  for (const scoreMap of Object.values(scores)) {
    for (const id of Object.keys(scoreMap || {})) {
      cells += 1;
      ensureStudent(studentMap, id, { classId: classInfo.id, className: classInfo.name, source });
    }
  }
  return { columns: Array.isArray(data?.columns) ? data.columns.length : 0, cells };
}

function countFees(data, studentMap, classInfo) {
  const charges = Array.isArray(data?.charges) ? data.charges : [];
  for (const charge of charges) {
    ensureStudent(studentMap, text(charge?.studentId), { classId: classInfo.id, className: classInfo.name, source: "fee" });
  }
  return { charges: charges.length };
}

function values(set) {
  return [...set].sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function serializeStudent(item) {
  return {
    id: item.id,
    names: values(item.names),
    schools: values(item.schools),
    grades: values(item.grades),
    classes: Object.fromEntries([...item.classes.entries()].sort()),
    sources: values(item.sources),
  };
}

function buildPreview(bundle) {
  const classes = Array.isArray(bundle?.classIndex) ? bundle.classIndex : [];
  const records = bundle?.records && typeof bundle.records === "object" ? bundle.records : {};
  const index = bundle?.studentIndex && typeof bundle.studentIndex === "object" ? bundle.studentIndex : {};
  const students = new Map();
  const classSummaries = [];

  for (const cls of classes) {
    if (!cls?.id) continue;
    const classInfo = { id: cls.id, name: text(cls.name), subject: text(cls.subject), grade: text(cls.grade) };
    const classStudents = Array.isArray(cls.students) ? cls.students : [];
    for (const student of classStudents) {
      ensureStudent(students, text(student?.id), {
        name: student?.name,
        school: student?.school,
        grade: student?.grade || cls.grade,
        classId: cls.id,
        className: cls.name,
        joinDate: student?.joinDate,
        endDate: student?.endDate,
        resumeDate: student?.resumeDate,
        group: student?.group,
        source: "classIndex",
      });
    }

    const classRecords = records[cls.id] || {};
    const attendance = countAttendance(classRecords.attendance, students, classInfo);
    const quiz = countScores(classRecords.quiz, students, classInfo, "quiz");
    const exam = countScores(classRecords.exam, students, classInfo, "exam");
    const fee = countFees(classRecords.fee, students, classInfo);
    classSummaries.push({
      ...classInfo,
      rosterStudents: classStudents.length,
      attendance,
      quiz,
      exam,
      fee,
    });
  }

  for (const [id, profile] of Object.entries(index)) {
    ensureStudent(students, id, { name: profile?.name, school: profile?.school, grade: profile?.grade, source: "studentIndex" });
    for (const [classId, enrollment] of Object.entries(profile?.enrollments || {})) {
      ensureStudent(students, id, {
        classId,
        className: classes.find((cls) => cls.id === classId)?.name || "",
        school: enrollment?.school,
        grade: enrollment?.grade,
        joinDate: enrollment?.joinDate,
        endDate: enrollment?.endDate,
        resumeDate: enrollment?.resumeDate,
        group: enrollment?.group,
        source: "studentIndex.enrollment",
      });
    }
  }

  const serializedStudents = [...students.values()].map(serializeStudent).sort((a, b) => a.id.localeCompare(b.id));
  const names = new Map();
  for (const student of serializedStudents) {
    for (const name of student.names) {
      const key = normalizedName(name);
      if (!key) continue;
      if (!names.has(key)) names.set(key, []);
      names.get(key).push(student.id);
    }
  }
  const duplicateCandidates = [...names.entries()]
    .filter(([, ids]) => new Set(ids).size > 1)
    .map(([normalized, ids]) => ({
      normalizedName: normalized,
      students: [...new Set(ids)].map((id) => serializedStudents.find((student) => student.id === id)).filter(Boolean),
    }))
    .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));

  const rosterIds = new Set(classes.flatMap((cls) => (cls.students || []).map((student) => text(student?.id)).filter(Boolean)));
  const recordOnlyStudents = serializedStudents.filter((student) => !rosterIds.has(student.id) && student.sources.some((source) => ["attendance", "quiz", "exam", "fee"].includes(source)));

  return {
    previewVersion: 1,
    sourceSchemaVersion: bundle?.schemaVersion ?? null,
    sourceExportedAt: bundle?.exportedAt ?? null,
    generatedAt: new Date().toISOString(),
    safety: {
      readOnly: true,
      writesFirebase: false,
      mergesStudents: false,
      deletesData: false,
    },
    totals: {
      classes: classSummaries.length,
      rosterStudents: rosterIds.size,
      uniqueStudentIds: serializedStudents.length,
      duplicateNameGroups: duplicateCandidates.length,
      recordOnlyStudents: recordOnlyStudents.length,
      attendanceDates: classSummaries.reduce((sum, item) => sum + item.attendance.dates, 0),
      attendanceCells: classSummaries.reduce((sum, item) => sum + item.attendance.cells, 0),
      quizCells: classSummaries.reduce((sum, item) => sum + item.quiz.cells, 0),
      examCells: classSummaries.reduce((sum, item) => sum + item.exam.cells, 0),
      feeCharges: classSummaries.reduce((sum, item) => sum + item.fee.charges, 0),
    },
    classes: classSummaries,
    students: serializedStudents,
    duplicateNameCandidates: duplicateCandidates,
    recordOnlyStudents,
  };
}

function markdownReport(preview) {
  const { totals } = preview;
  const lines = [
    "# 學生為本遷移預覽",
    "",
    "> 本報告由只讀工具產生；不會寫入 Firebase、不會合併學生，也不會刪除資料。",
    "",
    `產生時間：${preview.generatedAt}`,
    `來源備份時間：${preview.sourceExportedAt || "未提供"}`,
    "",
    "## 盤點摘要",
    "",
    "| 項目 | 數量 |",
    "|---|---:|",
    `| 班級 | ${totals.classes} |`,
    `| 班級名單學生 ID | ${totals.rosterStudents} |`,
    `| 不重複學生 ID | ${totals.uniqueStudentIds} |`,
    `| 同名候選群組 | ${totals.duplicateNameGroups} |`,
    `| 只有紀錄、目前不在班級名單的學生 | ${totals.recordOnlyStudents} |`,
    `| 有紀錄日期 | ${totals.attendanceDates} |`,
    `| 出缺勤格數 | ${totals.attendanceCells} |`,
    `| 平時考分數格數 | ${totals.quizCells} |`,
    `| 段考分數格數 | ${totals.examCells} |`,
    `| 收費筆數 | ${totals.feeCharges} |`,
    "",
    "## 同名候選清單",
    "",
  ];
  if (preview.duplicateNameCandidates.length === 0) {
    lines.push("目前沒有發現不同學生 ID 共用相同姓名的候選群組。這不代表資料一定沒有同名同性，仍應在匯入前確認。", "");
  } else {
    lines.push("下列資料只代表姓名相同，不代表應該合併；請依學校、年級、班級與歷史紀錄人工確認。", "", "| 姓名 | 學生 ID | 學校 | 年級 | 班級 |", "|---|---|---|---|---|");
    for (const candidate of preview.duplicateNameCandidates) {
      for (const student of candidate.students) {
        const classes = Object.values(student.classes).map((item) => item.className).filter(Boolean).join("、") || "—";
        lines.push(`| ${student.names.join("、")} | \`${student.id}\` | ${student.schools.join("、") || "—"} | ${student.grades.join("、") || "—"} | ${classes} |`);
      }
    }
    lines.push("");
  }
  lines.push("## 只有紀錄的學生", "");
  if (preview.recordOnlyStudents.length === 0) {
    lines.push("沒有發現只存在於歷史紀錄、目前不在任何班級名單的學生。", "");
  } else {
    lines.push("| 學生 ID | 可辨識姓名 | 紀錄來源 |", "|---|---|---|");
    for (const student of preview.recordOnlyStudents) lines.push(`| \`${student.id}\` | ${student.names.join("、") || "未命名"} | ${student.sources.join("、")} |`);
    lines.push("");
  }
  lines.push("## 班級資料摘要", "", "| 班級 | 名單人數 | 出缺勤日期／格數 | 平時考格數 | 段考格數 | 收費筆數 |", "|---|---:|---:|---:|---:|---:|");
  for (const cls of preview.classes) lines.push(`| ${cls.name || cls.id} | ${cls.rosterStudents} | ${cls.attendance.dates}／${cls.attendance.cells} | ${cls.quiz.cells} | ${cls.exam.cells} | ${cls.fee.charges} |`);
  lines.push("", "## 下一步", "", "在任何匯入前，先逐一處理同名候選：確認為同一人時才建立合併對照表；無法確認時保留不同學生 ID。確認清單完成後，才進入第二階段的匯入預演。", "");
  return lines.join("\n");
}

export { buildPreview, markdownReport };

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!inputPath) {
    console.error("用法：node scripts/migration-preview.mjs <備份.json> [輸出目錄]");
    process.exit(1);
  }
  try {
    const bundle = readJson(inputPath);
    const preview = buildPreview(bundle);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "migration-preview.json"), `${JSON.stringify(preview, null, 2)}\n`);
    fs.writeFileSync(path.join(outputDir, "migration-preview.md"), `${markdownReport(preview)}\n`);
    console.log(`已產生只讀遷移預覽：${outputDir}`);
    console.log(`班級 ${preview.totals.classes} 個；學生 ID ${preview.totals.uniqueStudentIds} 個；同名候選 ${preview.totals.duplicateNameGroups} 組。`);
  } catch (error) {
    console.error(`遷移預覽失敗：${error.message}`);
    process.exit(1);
  }
}
