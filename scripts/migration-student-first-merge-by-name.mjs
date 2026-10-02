import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

function text(value) { return String(value ?? "").trim(); }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function sortedEntries(value) { return Object.entries(isRecord(value) ? value : {}).sort(([a], [b]) => a.localeCompare(b)); }
function newId(prefix) { return `${prefix}${crypto.randomUUID()}`; }

function buildNameIndex(classes) {
  const byClassLegacy = new Map();
  const byName = new Map();
  const ambiguous = [];
  for (const cls of classes) {
    const local = new Map();
    for (const [index, roster] of (Array.isArray(cls.students) ? cls.students : []).entries()) {
      const legacyId = text(roster?.id);
      const name = text(roster?.name);
      if (!legacyId || !name) continue;
      const previous = local.get(legacyId);
      if (previous && previous.name !== name) {
        ambiguous.push({ classId: cls.id, legacyId, names: [previous.name, name] });
      }
      local.set(legacyId, { name, index, roster });
      byName.set(name, byName.get(name) || new Map());
      byName.get(name).set(cls.id, { legacyId, index, roster });
    }
    byClassLegacy.set(cls.id, local);
  }
  if (ambiguous.length) {
    throw new Error(`同一班級內同一舊學生 ID 對應不同姓名，無法安全合併：${JSON.stringify(ambiguous)}`);
  }
  return { byClassLegacy, byName };
}

function ensureStudent(students, name) {
  if (!students[name]) {
    const id = newId("stu_");
    students[name] = {
      id,
      displayName: name,
      aliases: [],
      enrollments: {},
      sourceRefs: [],
    };
  }
  return students[name];
}

function addSource(student, ref) {
  if (ref && !student.sourceRefs.includes(ref)) student.sourceRefs.push(ref);
}

function addEnrollment(student, cls, roster, index) {
  const enrollmentKey = `${cls.id}:${roster.id}`;
  if (!student.enrollments[enrollmentKey]) {
    const status = roster.membership === "stopped" || roster.endDate ? "ended" : "active";
    student.enrollments[enrollmentKey] = {
      id: newId("enr_"),
      studentId: student.id,
      classId: text(cls.id),
      className: text(cls.name),
      subject: text(cls.subject),
      school: text(roster.school),
      grade: text(cls.grade || roster.grade),
      group: text(roster.group),
      joinDate: text(roster.joinDate),
      endDate: text(roster.endDate),
      resumeDate: text(roster.resumeDate),
      status,
      sourceRefs: [`classIndex/${cls.id}/students/${index}`],
    };
  } else {
    addSource(student.enrollments[enrollmentKey], `classIndex/${cls.id}/students/${index}`);
  }
  return student.enrollments[enrollmentKey];
}

function rosterStudentId(byClassLegacy, classId, legacyId) {
  const item = byClassLegacy.get(classId)?.get(text(legacyId));
  if (!item) return null;
  return item.name;
}

function addAttendance(output, students, classInfo, records, byClassLegacy) {
  for (const [date, day] of sortedEntries(records)) {
    for (const [legacyId, status] of sortedEntries(day?.records)) {
      if (status === "" || status == null || (Array.isArray(status) && status.length === 0)) continue;
      const name = rosterStudentId(byClassLegacy, classInfo.id, legacyId);
      if (!name) { output.unresolved.push({ type: "attendance", classId: classInfo.id, date, legacyStudentId: legacyId }); continue; }
      output.attendance.push({ studentId: students[name].id, classId: classInfo.id, date, status, sourceLegacyStudentId: legacyId });
    }
  }
}

function addAssessments(output, students, classInfo, data, type, byClassLegacy) {
  const columns = Array.isArray(data?.columns) ? data.columns : [];
  for (const [columnId, scoreMap] of sortedEntries(data?.scores)) {
    const column = columns.find((item) => item?.id === columnId) || {};
    for (const [legacyId, score] of sortedEntries(scoreMap)) {
      if (score === "" || score == null) continue;
      const name = rosterStudentId(byClassLegacy, classInfo.id, legacyId);
      if (!name) { output.unresolved.push({ type, classId: classInfo.id, assessmentId: columnId, legacyStudentId: legacyId }); continue; }
      output.assessments.push({ studentId: students[name].id, classId: classInfo.id, type, assessmentId: columnId, name: text(column.name), date: text(column.date), range: text(column.range), score, sourceLegacyStudentId: legacyId });
    }
  }
}

function addFees(output, students, classInfo, data, byClassLegacy) {
  for (const [index, charge] of (Array.isArray(data?.charges) ? data.charges : []).entries()) {
    const legacyId = text(charge?.studentId);
    const name = rosterStudentId(byClassLegacy, classInfo.id, legacyId);
    if (!name) { output.unresolved.push({ type: "fee", classId: classInfo.id, index, legacyStudentId: legacyId }); continue; }
    output.fees.push({ ...charge, studentId: students[name].id, classId: classInfo.id, sourceLegacyStudentId: legacyId, sourceChargeIndex: index });
  }
}

export function buildMergedStudentFirstImport(bundle) {
  const classes = Array.isArray(bundle?.classIndex) ? bundle.classIndex.filter((item) => item?.id) : [];
  const records = isRecord(bundle?.records) ? bundle.records : {};
  const { byClassLegacy, byName } = buildNameIndex(classes);
  const studentsByName = {};
  const output = { attendance: [], assessments: [], fees: [], unresolved: [] };
  const legacyMap = {};

  for (const cls of classes) {
    for (const [index, roster] of (Array.isArray(cls.students) ? cls.students : []).entries()) {
      const name = text(roster?.name);
      if (!name) continue;
      const student = ensureStudent(studentsByName, name);
      const enrollment = addEnrollment(student, cls, roster, index);
      addSource(student, `classIndex/${cls.id}/students/${index}`);
      legacyMap[`${cls.id}::${text(roster.id)}::${index}`] = {
        studentId: student.id, enrollmentId: enrollment.id, name, legacyStudentId: text(roster.id), classId: cls.id,
      };
    }
  }

  for (const [name, student] of Object.entries(studentsByName)) {
    for (const enrollment of Object.values(student.enrollments)) enrollment.sourceRefs.sort();
    student.sourceRefs.sort();
    studentsByName[name] = { ...student, enrollments: Object.fromEntries(Object.values(student.enrollments).map((item) => [item.id, item])) };
  }

  for (const cls of classes) {
    const classInfo = { id: text(cls.id), name: text(cls.name), subject: text(cls.subject), grade: text(cls.grade) };
    const classRecords = records[cls.id] || {};
    addAttendance(output, studentsByName, classInfo, classRecords.attendance, byClassLegacy);
    addAssessments(output, studentsByName, classInfo, classRecords.quiz, "quiz", byClassLegacy);
    addAssessments(output, studentsByName, classInfo, classRecords.exam, "exam", byClassLegacy);
    addFees(output, studentsByName, classInfo, classRecords.fee, byClassLegacy);
  }

  const students = Object.fromEntries(Object.values(studentsByName).map((student) => [student.id, student]));
  const classOutput = Object.fromEntries(classes.map((cls) => [cls.id, {
    id: text(cls.id), name: text(cls.name), subject: text(cls.subject), grade: text(cls.grade),
    studentCount: Array.isArray(cls.students) ? cls.students.length : 0,
  }]));
  const duplicateNames = [...byName.entries()].filter(([, classesForName]) => classesForName.size > 1).map(([name, classesForName]) => ({ name, classIds: [...classesForName.keys()] }));

  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    source: { schemaVersion: bundle?.schemaVersion ?? null, exportedAt: bundle?.exportedAt ?? null, fileRole: "legacy-backup" },
    identityPolicy: {
      decision: "same_exact_name_is_same_student",
      note: "依使用者確認：目前沒有同名不同人的情況；相同姓名跨班級直接合併。",
      studentIdFormat: "stu_ + UUID v4",
      oldIdsAreSourceOnly: true,
    },
    safety: { readOnly: true, writesFirebase: false, deletesData: false, unresolvedCount: output.unresolved.length, canImport: output.unresolved.length === 0 },
    classes: classOutput,
    students,
    legacyMap,
    duplicateNameMerges: duplicateNames,
    attendance: output.attendance,
    assessments: output.assessments,
    fees: output.fees,
    unresolved: output.unresolved,
    calendarEvents: bundle?.calendarEvents || bundle?.events || {},
    totals: {
      classes: classes.length,
      rosterRows: classes.reduce((sum, cls) => sum + (Array.isArray(cls.students) ? cls.students.length : 0), 0),
      students: Object.keys(students).length,
      mergedRosterRows: classes.reduce((sum, cls) => sum + (Array.isArray(cls.students) ? cls.students.length : 0), 0) - Object.keys(students).length,
      duplicateNamesMerged: duplicateNames.length,
      attendance: output.attendance.length,
      assessments: output.assessments.length,
      fees: output.fees.length,
    },
  };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || path.join(process.cwd(), "student-first-import-merged-by-name.json");
  if (!inputPath) throw new Error("用法：node scripts/migration-student-first-merge-by-name.mjs <備份.json> [輸出.json]");
  const bundle = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const result = buildMergedStudentFirstImport(bundle);
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`已產生依姓名合併的只讀學生本位匯入檔：${outputPath}`);
  console.log(`班級 ${result.totals.classes} 個；名單列 ${result.totals.rosterRows} 筆；學生 ${result.totals.students} 位；合併 ${result.totals.duplicateNamesMerged} 個姓名；未解析 ${result.unresolved.length} 筆。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`依姓名合併失敗：${error.message}`); process.exit(1); }
}
