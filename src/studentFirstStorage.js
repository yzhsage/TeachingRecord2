import { get, ref, set } from "firebase/database";
import { db } from "./firebase";

const cache = new Map();
const text = (value) => String(value ?? "").trim();
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const entries = (value) => Object.entries(isObject(value) ? value : {});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function classMap(value) {
  return Object.fromEntries(entries(value).map(([id, item]) => [id, { ...item, id }]));
}

function studentMap(value) {
  return Object.fromEntries(entries(value).map(([id, item]) => [id, { ...item, id }]));
}

function enrollmentToRoster(student, enrollment, cls) {
  return {
    id: student.id,
    name: student.displayName || student.name || "未命名學生",
    school: enrollment.school || "",
    group: enrollment.group || "",
    joinDate: enrollment.joinDate || "",
    endDate: enrollment.endDate || "",
    resumeDate: enrollment.resumeDate || "",
    membership: enrollment.status === "ended" ? "stopped" : "active",
    isTrial: false,
    grade: enrollment.grade || cls.grade || "",
  };
}

function toClassIndex(classesValue, studentsValue) {
  const classes = classMap(classesValue);
  const students = studentMap(studentsValue);
  return Object.values(classes).map((cls) => {
    const roster = [];
    for (const student of Object.values(students)) {
      for (const enrollment of Object.values(student.enrollments || {})) {
        if (enrollment.classId === cls.id) {
          roster.push(enrollmentToRoster(student, enrollment, cls));
          break;
        }
      }
    }
    return {
      ...cls,
      id: cls.id,
      name: cls.name || cls.displayName || "未命名班級",
      subject: cls.subject || "",
      grade: cls.grade || "",
      students: roster,
      scheduleRules: cls.scheduleRules || [],
      overrides: cls.overrides || [],
      archived: Boolean(cls.archived),
      hasFee: Boolean(cls.hasFee),
    };
  });
}

function toStudentIndex(studentsValue) {
  const students = studentMap(studentsValue);
  return Object.fromEntries(Object.values(students).map((student) => {
    const enrollments = {};
    const classes = {};
    for (const enrollment of Object.values(student.enrollments || {})) {
      if (!enrollment.classId) continue;
      enrollments[enrollment.classId] = { ...enrollment };
      classes[enrollment.classId] = {
        name: enrollment.className || "",
        subject: enrollment.subject || "",
        grade: enrollment.grade || "",
      };
    }
    const first = Object.values(enrollments)[0] || {};
    return [student.id, {
      id: student.id,
      name: student.displayName || student.name || "",
      school: first.school || "",
      grade: first.grade || "",
      group: first.group || "",
      enrollments,
      classes,
      sourceRefs: student.sourceRefs || [],
    }];
  }));
}

function attendanceForClass(value, classId) {
  const output = {};
  for (const [id, record] of entries(value)) {
    if (record.classId !== classId) continue;
    const day = output[record.date] || { note: "", content: "", records: {} };
    day.records[record.studentId] = record.status;
    output[record.date] = day;
  }
  return output;
}

function assessmentForClass(value, classId, type) {
  const rows = Object.values(value || {}).filter((record) => record.classId === classId && record.type === type);
  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.assessmentId)) byId.set(row.assessmentId, { id: row.assessmentId, name: row.name || "", date: row.date || "", range: row.range || "" });
  }
  const scores = {};
  for (const row of rows) {
    scores[row.assessmentId] ||= {};
    scores[row.assessmentId][row.studentId] = isObject(row.score) ? row.score : { score: row.score };
  }
  return { columns: [...byId.values()], scores };
}

function feesForClass(value, classId) {
  return { charges: Object.values(value || {}).filter((record) => record.classId === classId) };
}

async function read(path, fallback) {
  const snapshot = await get(ref(db, path));
  return snapshot.exists() ? snapshot.val() : fallback;
}

export async function loadStudentFirstKey(key, fallback) {
  if (cache.has(key)) return clone(cache.get(key));
  let value = fallback;
  if (key === "classIndex") {
    const [classes, students] = await Promise.all([read("classes", {}), read("students", {})]);
    value = toClassIndex(classes, students);
  } else if (key === "studentIndex") {
    value = toStudentIndex(await read("students", {}));
  } else if (key === "calendar:events") {
    value = await read("calendarEvents", []);
  } else if (key === "lastBackupAt") {
    value = await read("meta/lastBackupAt", null);
  } else if (key.startsWith("attendance:")) {
    value = attendanceForClass(await read("attendance", {}), key.slice("attendance:".length));
  } else if (key.startsWith("quiz:")) {
    value = assessmentForClass(await read("assessments", {}), key.slice("quiz:".length), "quiz");
  } else if (key.startsWith("exam:")) {
    value = assessmentForClass(await read("assessments", {}), key.slice("exam:".length), "exam");
  } else if (key.startsWith("fee:")) {
    value = feesForClass(await read("fees", {}), key.slice("fee:".length));
  }
  cache.set(key, clone(value));
  return clone(value);
}

function toClassesRoot(value) {
  return Object.fromEntries((Array.isArray(value) ? value : []).filter((item) => item?.id).map((item) => {
    const { students, ...cls } = item;
    return [item.id, { ...cls, id: item.id }];
  }));
}

async function saveAttendance(classId, value) {
  const all = await read("attendance", {});
  for (const [id, record] of entries(all)) if (record.classId === classId) delete all[id];
  for (const [date, day] of entries(value)) {
    for (const [studentId, status] of entries(day?.records)) {
      if (status === "" || status == null || (Array.isArray(status) && status.length === 0)) continue;
      const id = `att_${classId}_${studentId}_${date}`.replace(/[^A-Za-z0-9_-]/g, "_");
      all[id] = { id, studentId, classId, date, status };
    }
  }
  await set(ref(db, "attendance"), all);
}

async function saveAssessments(classId, value, type) {
  const all = await read("assessments", {});
  for (const [id, record] of entries(all)) if (record.classId === classId && record.type === type) delete all[id];
  for (const column of value?.columns || []) {
    for (const [studentId, score] of entries(value?.scores?.[column.id])) {
      const id = `asm_${type}_${classId}_${column.id}_${studentId}`.replace(/[^A-Za-z0-9_-]/g, "_");
      all[id] = { id, studentId, classId, type, assessmentId: column.id, name: column.name || "", date: column.date || "", range: column.range || "", score };
    }
  }
  await set(ref(db, "assessments"), all);
}

async function saveFees(classId, value) {
  const all = await read("fees", {});
  for (const [id, record] of entries(all)) if (record.classId === classId) delete all[id];
  for (const [index, charge] of (value?.charges || []).entries()) {
    const id = charge.id || `fee_${classId}_${charge.studentId || "student"}_${index}`.replace(/[^A-Za-z0-9_-]/g, "_");
    all[id] = { ...charge, id, classId };
  }
  await set(ref(db, "fees"), all);
}

async function saveStudentsFromClasses(value) {
  const students = studentMap(await read("students", {}));
  for (const cls of value || []) {
    for (const roster of cls.students || []) {
      if (!roster?.id) continue;
      const previous = students[roster.id] || { id: roster.id, displayName: roster.name || "", aliases: [], enrollments: {}, sourceRefs: [] };
      const existing = Object.values(previous.enrollments || {}).find((item) => item.classId === cls.id);
      const enrollmentId = existing?.id || `enr_${roster.id}_${cls.id}`.replace(/[^A-Za-z0-9_-]/g, "_");
      students[roster.id] = {
        ...previous,
        displayName: roster.name || previous.displayName || "",
        enrollments: {
          ...(previous.enrollments || {}),
          [enrollmentId]: {
            ...(existing || {}),
            id: enrollmentId,
            studentId: roster.id,
            classId: cls.id,
            className: cls.name || "",
            subject: cls.subject || "",
            grade: roster.grade || cls.grade || "",
            school: roster.school || "",
            group: roster.group || "",
            joinDate: roster.joinDate || "",
            endDate: roster.endDate || "",
            resumeDate: roster.resumeDate || "",
            status: roster.membership === "stopped" ? "ended" : "active",
          },
        },
      };
    }
  }
  await set(ref(db, "students"), students);
}

export async function saveStudentFirstKey(key, value) {
  cache.set(key, clone(value));
  if (key === "classIndex") {
    await set(ref(db, "classes"), toClassesRoot(value));
    await saveStudentsFromClasses(value);
  } else if (key === "studentIndex") {
    const students = studentMap(await read("students", {}));
    for (const [id, profile] of entries(value)) {
      const previous = students[id] || { id, aliases: [], enrollments: {}, sourceRefs: [] };
      students[id] = { ...previous, displayName: profile.name || previous.displayName || "", aliases: previous.aliases || [], sourceRefs: profile.sourceRefs || previous.sourceRefs || [] };
    }
    await set(ref(db, "students"), students);
  } else if (key === "calendar:events") {
    await set(ref(db, "calendarEvents"), value);
  } else if (key === "lastBackupAt") {
    await set(ref(db, "meta/lastBackupAt"), value);
  } else if (key.startsWith("attendance:")) {
    await saveAttendance(key.slice("attendance:".length), value);
  } else if (key.startsWith("quiz:")) {
    await saveAssessments(key.slice("quiz:".length), value, "quiz");
  } else if (key.startsWith("exam:")) {
    await saveAssessments(key.slice("exam:".length), value, "exam");
  } else if (key.startsWith("fee:")) {
    await saveFees(key.slice("fee:".length), value);
  }
  return true;
}

export function clearStudentFirstCache() {
  cache.clear();
}
