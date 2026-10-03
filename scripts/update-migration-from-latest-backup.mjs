import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildMergedStudentFirstImport } from "./migration-student-first-merge-by-name.mjs";

function text(value) { return String(value ?? "").trim(); }

export function updateFromLatestBackup(latest, previous) {
  const fresh = buildMergedStudentFirstImport(latest);
  const latestClassesById = Object.fromEntries((latest.classIndex || []).map((item) => [text(item.id), item]));
  const previousByName = Object.fromEntries(Object.values(previous.students || {}).map((student) => [text(student.displayName || student.name), student]));
  const fixedStudentIdByName = Object.fromEntries(Object.entries(previousByName).map(([name, student]) => [name, student.id]));
  const fixedClassIdMap = previous.classIdMap || {};
  const fixedClasses = {};
  for (const [legacyClassId, newClassId] of Object.entries(fixedClassIdMap)) {
    const freshClass = fresh.classes?.[legacyClassId] || {};
    const previousClass = previous.classes?.[newClassId] || {};
    const latestClass = latestClassesById[legacyClassId] || {};
    fixedClasses[newClassId] = {
      ...previousClass,
      ...freshClass,
      scheduleRules: latestClass.scheduleRules || previousClass.scheduleRules || [],
      overrides: latestClass.overrides || previousClass.overrides || [],
      subjects: latestClass.subjects || previousClass.subjects || [],
      archived: Boolean(latestClass.archived),
      hasFee: Boolean(latestClass.hasFee),
      id: newClassId,
      legacyClassId,
    };
  }

  const fixedEnrollmentId = (name, legacyClassId) => {
    const previousStudent = previousByName[name];
    const existing = Object.values(previousStudent?.enrollments || {}).find((item) => text(item.legacyClassId) === legacyClassId);
    return existing?.id || `enr_latest_${fixedStudentIdByName[name] || name}_${legacyClassId}`;
  };

  const students = {};
  for (const freshStudent of Object.values(fresh.students || {})) {
    const name = text(freshStudent.displayName || freshStudent.name);
    const studentId = fixedStudentIdByName[name] || freshStudent.id;
    const previousStudent = previousByName[name] || {};
    const enrollments = {};
    for (const freshEnrollment of Object.values(freshStudent.enrollments || {})) {
      const legacyClassId = text(freshEnrollment.legacyClassId || freshEnrollment.classId);
      const enrollmentId = fixedEnrollmentId(name, legacyClassId);
      const classId = fixedClassIdMap[legacyClassId] || freshEnrollment.classId;
      enrollments[enrollmentId] = {
        ...freshEnrollment,
        id: enrollmentId,
        studentId,
        classId,
        legacyClassId,
      };
    }
    students[studentId] = {
      ...previousStudent,
      ...freshStudent,
      id: studentId,
      displayName: name,
      enrollments,
    };
  }

  const remapStudent = (oldStudentId, classId, legacyId) => {
    const name = fresh.legacyMap?.[`${classId}::${legacyId}::0`]?.name;
    if (name && fixedStudentIdByName[name]) return fixedStudentIdByName[name];
    const entry = Object.values(fresh.legacyMap || {}).find((item) => item.classId === classId && item.legacyStudentId === legacyId);
    return entry ? (fixedStudentIdByName[entry.name] || oldStudentId) : oldStudentId;
  };

  const classId = (legacyId) => fixedClassIdMap[text(legacyId)] || legacyId;
  const rewriteRecords = (records) => records.map((record) => {
    const legacyClassId = text(record.legacyClassId || record.classId);
    const oldStudentId = text(record.studentId);
    const entry = Object.values(fresh.legacyMap || {}).find((item) => item.classId === legacyClassId && item.legacyStudentId === text(record.sourceLegacyStudentId));
    const studentId = entry ? (fixedStudentIdByName[entry.name] || oldStudentId) : oldStudentId;
    return { ...record, studentId, classId: classId(legacyClassId), legacyClassId };
  });

  const legacyMap = Object.fromEntries(Object.entries(fresh.legacyMap || {}).map(([key, item]) => {
    const studentId = fixedStudentIdByName[item.name] || item.studentId;
    const enrollmentId = fixedEnrollmentId(item.name, item.classId);
    return [key, { ...item, studentId, enrollmentId, classId: classId(item.classId), legacyClassId: item.classId }];
  }));

  const result = {
    ...fresh,
    schemaVersion: 4,
    generatedAt: new Date().toISOString(),
    source: { ...fresh.source, exportedAt: latest.exportedAt, fileRole: "latest-legacy-backup" },
    classes: fixedClasses,
    students,
    legacyMap,
    classIdMap: fixedClassIdMap,
    classIdMapReverse: Object.fromEntries(Object.entries(fixedClassIdMap).map(([oldId, newId]) => [newId, oldId])),
    attendance: rewriteRecords(fresh.attendance || []),
    assessments: rewriteRecords(fresh.assessments || []),
    fees: rewriteRecords(fresh.fees || []),
    calendarEvents: latest.calendarEvents || [],
    safety: { ...fresh.safety, readOnly: true, writesFirebase: false, deletesData: false, canImport: true },
  };
  result.totals = {
    ...result.totals,
    classes: Object.keys(result.classes).length,
    students: Object.keys(result.students).length,
    attendance: result.attendance.length,
    assessments: result.assessments.length,
    fees: result.fees.length,
  };
  return result;
}

function main() {
  const latestPath = process.argv[2];
  const previousPath = process.argv[3];
  const outputPath = process.argv[4] || path.join(process.cwd(), "student-first-import-latest.json");
  if (!latestPath || !previousPath) throw new Error("用法：node scripts/update-migration-from-latest-backup.mjs <最新備份.json> <前一版.json> [輸出.json]");
  const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  const previous = JSON.parse(fs.readFileSync(previousPath, "utf8"));
  const result = updateFromLatestBackup(latest, previous);
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`已更新最新學生本位遷移檔：${outputPath}`);
  console.log(`來源 ${latest.exportedAt}；學生 ${result.totals.students} 位；班級 ${result.totals.classes} 個；出缺勤 ${result.totals.attendance} 筆；成績 ${result.totals.assessments} 筆；收費 ${result.totals.fees} 筆。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`最新備份更新失敗：${error.message}`); process.exit(1); }
}
