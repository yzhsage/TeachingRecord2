import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function text(value) { return String(value ?? "").trim(); }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function sortedEntries(value) { return Object.entries(isRecord(value) ? value : {}).sort(([a], [b]) => a.localeCompare(b)); }

export function prepareLegacyRecordsCompat(migrated, backup) {
  const oldToNew = migrated.classIdMap || {};
  const migratedClassesByOld = Object.fromEntries(Object.values(migrated.classes || {}).map((cls) => [cls.legacyClassId, cls]));
  const students = migrated.students || {};
  const backupClasses = Array.isArray(backup?.classIndex) ? backup.classIndex : [];
  const classIndex = [];
  const studentIndex = {};
  const attendance = {};
  const quiz = {};
  const exam = {};
  const fee = {};

  for (const student of Object.values(students)) {
    const enrollments = {};
    const classes = {};
    for (const enrollment of Object.values(student.enrollments || {})) {
      const classId = text(enrollment.classId);
      enrollments[classId] = {
        joinDate: text(enrollment.joinDate),
        endDate: text(enrollment.endDate),
        resumeDate: text(enrollment.resumeDate),
        school: text(enrollment.school),
        group: text(enrollment.group),
        grade: text(enrollment.grade),
      };
      classes[classId] = { name: text(enrollment.className), subject: text(enrollment.subject), grade: text(enrollment.grade) };
    }
    const firstEnrollment = Object.values(enrollments)[0] || {};
    studentIndex[student.id] = {
      id: student.id,
      name: text(student.displayName),
      school: text(firstEnrollment.school),
      grade: text(firstEnrollment.grade),
      group: text(firstEnrollment.group),
      enrollments,
      classes,
      sourceRefs: student.sourceRefs || [],
    };
  }

  for (const oldClass of backupClasses) {
    const oldId = text(oldClass.id);
    const newClass = migratedClassesByOld[oldId];
    const classId = oldToNew[oldId];
    if (!newClass || !classId) continue;
    const roster = [];
    for (const student of Object.values(students)) {
      const enrollment = Object.values(student.enrollments || {}).find((item) => item.classId === classId);
      if (!enrollment) continue;
      roster.push({
        id: student.id,
        name: student.displayName,
        school: enrollment.school,
        group: enrollment.group,
        joinDate: enrollment.joinDate,
        endDate: enrollment.endDate,
        resumeDate: enrollment.resumeDate,
        membership: enrollment.status === "ended" ? "stopped" : "active",
        isTrial: false,
      });
    }
    classIndex.push({
      id: classId,
      name: newClass.name,
      displayName: newClass.displayName,
      subject: newClass.subject,
      subjects: oldClass.subjects || [],
      grade: newClass.grade,
      academicYear: newClass.academicYear,
      stage: newClass.stage,
      archived: Boolean(oldClass.archived),
      hasFee: Boolean(oldClass.hasFee),
      scheduleRules: oldClass.scheduleRules || [],
      overrides: oldClass.overrides || [],
      students: roster,
    });
    const rawRecords = backup.records?.[oldId] || {};
    attendance[classId] = rawRecords.attendance || {};
    quiz[classId] = rawRecords.quiz || { columns: [], scores: {} };
    exam[classId] = rawRecords.exam || { columns: [], scores: {} };
    fee[classId] = rawRecords.fee || { charges: [] };
  }

  // Rewrite record student IDs from the legacy class-local IDs to the merged stu_ IDs.
  const legacyNameByClassId = new Map();
  for (const oldClass of backupClasses) {
    const classId = oldToNew[text(oldClass.id)];
    const map = new Map((oldClass.students || []).map((s) => [text(s.id), text(s.name)]));
    legacyNameByClassId.set(classId, map);
  }
  const studentIdByName = Object.fromEntries(Object.values(students).map((s) => [text(s.displayName), s.id]));
  for (const cls of classIndex) {
    const nameByLegacyId = legacyNameByClassId.get(cls.id) || new Map();
    const rewriteDayRecords = (days) => Object.fromEntries(sortedEntries(days).map(([date, day]) => [date, {
      ...day,
      records: Object.fromEntries(sortedEntries(day?.records).map(([legacyId, value]) => {
        const name = nameByLegacyId.get(legacyId);
        return [studentIdByName[name] || legacyId, value];
      })),
    }]));
    attendance[cls.id] = rewriteDayRecords(attendance[cls.id]);
    for (const type of ["quiz", "exam"]) {
      const data = type === "quiz" ? quiz[cls.id] : exam[cls.id];
      const scores = Object.fromEntries(sortedEntries(data?.scores).map(([columnId, scoreMap]) => [columnId,
        Object.fromEntries(sortedEntries(scoreMap).map(([legacyId, value]) => {
          const name = nameByLegacyId.get(legacyId);
          return [studentIdByName[name] || legacyId, isRecord(value) ? value : { score: value }];
        }))
      ]));
      const next = { ...data, scores };
      if (type === "quiz") quiz[cls.id] = next; else exam[cls.id] = next;
    }
    fee[cls.id] = {
      ...(fee[cls.id] || {}),
      charges: (fee[cls.id]?.charges || []).map((charge) => {
        const name = nameByLegacyId.get(text(charge.studentId));
        return { ...charge, studentId: studentIdByName[name] || charge.studentId };
      }),
    };
  }

  return {
    records: {
      classIndex,
      studentIndex,
      attendance,
      quiz,
      exam,
      fee,
      calendar: { events: backup.calendarEvents || [] },
      lastBackupAt: backup.exportedAt || new Date().toISOString(),
    },
    compatibility: {
      forAppVersion: "current-records-reader",
      usesStudentIds: true,
      usesClassIds: true,
      sourceMigrationSchemaVersion: migrated.schemaVersion,
      note: "過渡相容資料；App 完成直接讀取學生本位路徑後可移除 records。",
    },
  };
}

function main() {
  const migratedPath = process.argv[2];
  const backupPath = process.argv[3];
  const outputPath = process.argv[4] || path.join(process.cwd(), "firebase-records-compat.json");
  if (!migratedPath || !backupPath) throw new Error("用法：node scripts/prepare-legacy-records-compat.mjs <class-ids.json> <backup.json> [輸出.json]");
  const migrated = JSON.parse(fs.readFileSync(migratedPath, "utf8"));
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  const result = prepareLegacyRecordsCompat(migrated, backup);
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`已產生 App 相容資料：${outputPath}`);
  console.log(`班級 ${result.records.classIndex.length} 個；學生 ${Object.keys(result.records.studentIndex).length} 位。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`相容資料產生失敗：${error.message}`); process.exit(1); }
}
