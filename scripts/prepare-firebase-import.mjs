import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function safeKey(value) {
  return String(value ?? "").replace(/[.#$[\]/]/g, "_");
}
function text(value) { return String(value ?? "").trim(); }

export function prepareFirebaseImport(input) {
  const data = {
    students: {},
    classes: {},
    attendance: {},
    assessments: {},
    fees: {},
    calendarEvents: input.calendarEvents || {},
  };

  for (const [studentId, student] of Object.entries(input.students || {})) {
    data.students[studentId] = {
      id: studentId,
      displayName: text(student.displayName || student.name),
      aliases: student.aliases || [],
      enrollments: student.enrollments || {},
      sourceRefs: student.sourceRefs || [],
    };
  }

  for (const [classId, cls] of Object.entries(input.classes || {})) {
    data.classes[classId] = { ...cls, id: classId };
  }

  for (const [index, record] of (input.attendance || []).entries()) {
    const key = `att_${safeKey(record.classId)}_${safeKey(record.studentId)}_${safeKey(record.date)}_${index}`;
    data.attendance[key] = { ...record, id: key };
  }
  for (const [index, record] of (input.assessments || []).entries()) {
    const key = `asm_${safeKey(record.type)}_${safeKey(record.classId)}_${safeKey(record.assessmentId)}_${safeKey(record.studentId)}_${index}`;
    data.assessments[key] = { ...record, id: key };
  }
  for (const [index, record] of (input.fees || []).entries()) {
    const key = `fee_${safeKey(record.classId)}_${safeKey(record.studentId)}_${index}`;
    data.fees[key] = { ...record, id: key };
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceMigrationSchemaVersion: input.schemaVersion,
    importMode: "new-database-only",
    safety: {
      containsNoFirebaseCredentials: true,
      sourceFirebaseWasNotModified: true,
      targetFirebaseMustBeEmptyOrBackedUp: true,
    },
    data,
    totals: {
      students: Object.keys(data.students).length,
      classes: Object.keys(data.classes).length,
      attendance: Object.keys(data.attendance).length,
      assessments: Object.keys(data.assessments).length,
      fees: Object.keys(data.fees).length,
      calendarEvents: Array.isArray(data.calendarEvents) ? data.calendarEvents.length : Object.keys(data.calendarEvents || {}).length,
    },
  };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || path.join(process.cwd(), "firebase-import-data.json");
  if (!inputPath) throw new Error("用法：node scripts/prepare-firebase-import.mjs <student-first-with-class-ids.json> [輸出.json]");
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const result = prepareFirebaseImport(input);
  fs.writeFileSync(outputPath, `${JSON.stringify(result.data, null, 2)}\n`);
  fs.writeFileSync(`${outputPath}.manifest.json`, `${JSON.stringify({ ...result, data: undefined }, null, 2)}\n`);
  console.log(`已產生 Firebase 可匯入資料：${outputPath}`);
  console.log(`學生 ${result.totals.students} 位；班級 ${result.totals.classes} 個；出缺勤 ${result.totals.attendance} 筆；成績 ${result.totals.assessments} 筆；收費 ${result.totals.fees} 筆。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`Firebase 匯入資料產生失敗：${error.message}`); process.exit(1); }
}
