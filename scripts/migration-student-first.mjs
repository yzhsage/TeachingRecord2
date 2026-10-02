import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeConflicts } from "./migration-conflicts.mjs";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function sortedEntries(value) {
  return Object.entries(isRecord(value) ? value : {}).sort(([a], [b]) => a.localeCompare(b));
}

function ensureStudent(students, id, details = {}) {
  const studentId = text(id);
  if (!studentId) return null;
  if (!students[studentId]) {
    students[studentId] = {
      id: studentId,
      name: "",
      school: "",
      grade: "",
      group: "",
      enrollments: {},
      sourceRefs: [],
    };
  }
  const student = students[studentId];
  ["name", "school", "grade", "group"].forEach((key) => {
    if (details[key] !== undefined && text(details[key])) student[key] = text(details[key]);
  });
  if (details.classId) {
    const classId = text(details.classId);
    const previous = student.enrollments[classId] || { classId };
    student.enrollments[classId] = {
      ...previous,
      classId,
      className: text(details.className) || previous.className || "",
      subject: text(details.subject) || previous.subject || "",
      grade: text(details.classGrade) || previous.grade || student.grade || "",
      joinDate: text(details.joinDate) || previous.joinDate || "",
      endDate: text(details.endDate) || previous.endDate || "",
      resumeDate: text(details.resumeDate) || previous.resumeDate || "",
      school: text(details.enrollmentSchool) || previous.school || student.school || "",
      group: details.enrollmentGroup !== undefined ? text(details.enrollmentGroup) : previous.group || student.group || "",
    };
  }
  if (details.sourceRef) {
    const sourceRef = text(details.sourceRef);
    if (sourceRef && !student.sourceRefs.includes(sourceRef)) student.sourceRefs.push(sourceRef);
  }
  return student;
}

function classMap(bundle) {
  return Object.fromEntries((Array.isArray(bundle?.classIndex) ? bundle.classIndex : []).filter((item) => item?.id).map((item) => [item.id, item]));
}

function addRosterStudents(students, classes) {
  for (const cls of classes) {
    for (const roster of Array.isArray(cls.students) ? cls.students : []) {
      ensureStudent(students, roster?.id, {
        name: roster?.name,
        school: roster?.school,
        grade: roster?.grade || cls.grade,
        classId: cls.id,
        className: cls.name,
        subject: cls.subject,
        classGrade: cls.grade,
        joinDate: roster?.joinDate,
        endDate: roster?.endDate,
        resumeDate: roster?.resumeDate,
        enrollmentSchool: roster?.school,
        enrollmentGroup: Object.prototype.hasOwnProperty.call(roster || {}, "group") ? roster.group : "",
        sourceRef: `classIndex/${cls.id}/${roster?.id || "unknown"}`,
      });
    }
  }
}

function addStudentIndex(students, value, classesById) {
  for (const [id, profile] of sortedEntries(value)) {
    ensureStudent(students, id, { name: profile?.name, school: profile?.school, grade: profile?.grade, group: profile?.group, sourceRef: `studentIndex/${id}` });
    for (const [classId, enrollment] of sortedEntries(profile?.enrollments)) {
      const cls = classesById[classId] || {};
      ensureStudent(students, id, {
        classId,
        className: cls.name,
        subject: cls.subject,
        classGrade: enrollment?.grade || cls.grade,
        joinDate: enrollment?.joinDate,
        endDate: enrollment?.endDate,
        resumeDate: enrollment?.resumeDate,
        enrollmentSchool: enrollment?.school,
        enrollmentGroup: enrollment?.group,
        sourceRef: `studentIndex/enrollments/${id}/${classId}`,
      });
    }
  }
}

function addAttendance(attendance, students, classInfo, data) {
  for (const [date, day] of sortedEntries(data)) {
    for (const [studentId, status] of sortedEntries(day?.records)) {
      if (status === "" || status == null || (Array.isArray(status) && status.length === 0)) continue;
      ensureStudent(students, studentId, { classId: classInfo.id, className: classInfo.name, subject: classInfo.subject, classGrade: classInfo.grade, sourceRef: `records/${classInfo.id}/attendance/${date}` });
      attendance.push({ studentId, classId: classInfo.id, date, status });
    }
  }
}

function addAssessments(assessments, students, classInfo, data, type) {
  const columns = Array.isArray(data?.columns) ? data.columns : [];
  for (const [columnId, scoreMap] of sortedEntries(data?.scores)) {
    const column = columns.find((item) => item?.id === columnId) || {};
    for (const [studentId, score] of sortedEntries(scoreMap)) {
      if (score === "" || score == null) continue;
      ensureStudent(students, studentId, { classId: classInfo.id, className: classInfo.name, subject: classInfo.subject, classGrade: classInfo.grade, sourceRef: `records/${classInfo.id}/${type}/${columnId}` });
      assessments.push({ studentId, classId: classInfo.id, type, assessmentId: columnId, name: text(column.name), date: text(column.date), range: text(column.range), score });
    }
  }
}

function addFees(fees, students, classInfo, data) {
  for (const [index, charge] of (Array.isArray(data?.charges) ? data.charges : []).entries()) {
    const studentId = text(charge?.studentId);
    if (!studentId) continue;
    ensureStudent(students, studentId, { classId: classInfo.id, className: classInfo.name, subject: classInfo.subject, classGrade: classInfo.grade, sourceRef: `records/${classInfo.id}/fee/${index}` });
    fees.push({ ...charge, studentId, classId: classInfo.id, sourceChargeIndex: index });
  }
}

export function buildStudentFirstImport(bundle) {
  const classes = Array.isArray(bundle?.classIndex) ? bundle.classIndex.filter((item) => item?.id) : [];
  const classesById = classMap(bundle);
  const records = isRecord(bundle?.records) ? bundle.records : {};
  const students = {};
  const attendance = [];
  const assessments = [];
  const fees = [];

  addRosterStudents(students, classes);
  addStudentIndex(students, bundle?.studentIndex, classesById);

  for (const cls of classes) {
    const classInfo = { id: cls.id, name: text(cls.name), subject: text(cls.subject), grade: text(cls.grade) };
    const classRecords = records[cls.id] || {};
    addAttendance(attendance, students, classInfo, classRecords.attendance);
    addAssessments(assessments, students, classInfo, classRecords.quiz, "quiz");
    addAssessments(assessments, students, classInfo, classRecords.exam, "exam");
    addFees(fees, students, classInfo, classRecords.fee);
  }

  for (const student of Object.values(students)) {
    student.sourceRefs.sort();
    for (const enrollment of Object.values(student.enrollments)) {
      if (!enrollment.school) enrollment.school = student.school || "";
      if (!enrollment.group && student.group) enrollment.group = student.group;
    }
  }

  const conflicts = analyzeConflicts(bundle);
  const requiresManualIdentityReview = conflicts.totals.reusedIds > 0 || conflicts.totals.sameNameDifferentIds > 0;

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: { schemaVersion: bundle?.schemaVersion ?? null, exportedAt: bundle?.exportedAt ?? null },
    safety: { readOnly: true, writesFirebase: false, mergesStudents: false, deletesData: false, requiresManualIdentityReview, canImport: !requiresManualIdentityReview },
    identityConflicts: conflicts.totals,
    classes: Object.fromEntries(classes.map((cls) => [cls.id, { id: cls.id, name: text(cls.name), subject: text(cls.subject), grade: text(cls.grade) }])),
    students,
    attendance,
    assessments,
    fees,
    calendarEvents: bundle?.calendarEvents || bundle?.events || {},
    totals: { classes: classes.length, students: Object.keys(students).length, attendance: attendance.length, assessments: assessments.length, fees: fees.length },
  };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || path.join(process.cwd(), "student-first-import.json");
  if (!inputPath) throw new Error("用法：node scripts/migration-student-first.mjs <備份.json> [輸出.json]");
  const bundle = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const result = buildStudentFirstImport(bundle);
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`已產生只讀學生優先匯入檔：${outputPath}`);
  console.log(`班級 ${result.totals.classes} 個；學生 ${result.totals.students} 位；出缺勤 ${result.totals.attendance} 筆；成績 ${result.totals.assessments} 筆；收費 ${result.totals.fees} 筆。`);
}

export { ensureStudent };

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`學生優先轉換失敗：${error.message}`); process.exit(1); }
}
