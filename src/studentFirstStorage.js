import { ref, set, update } from "firebase/database";
import { db } from "./firebase";
import { readPath } from "./firebaseRead";

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

function attendanceForClass(value, journalValue, classId) {
  const output = {};
  for (const record of Object.values(journalValue || {})) {
    if (record.classId !== classId) continue;
    output[record.date] = { note: record.note || "", content: record.content || "", videoUrl: record.videoUrl || "", records: {} };
  }
  for (const [id, record] of entries(value)) {
    if (record.classId !== classId) continue;
    const day = output[record.date] || { note: "", content: "", videoUrl: "", records: {} };
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

/* Local copy of each top-level list (attendance, assessments, ...), shared by
   every class. Downloading e.g. the whole "attendance" list once instead of
   once per class keeps the first load fast and reliable. */
const roots = new Map();

async function readRoot(path) {
  if (roots.has(path)) return roots.get(path);
  const value = await readPath(path);
  if (!roots.has(path)) roots.set(path, isObject(value) ? value : {});
  return roots.get(path);
}

async function read(path, fallback) {
  const value = await readPath(path);
  return value ?? fallback;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* Patch that only touches this class's rows: rows that disappeared become
   null (deleted), new or changed rows are written, other classes untouched. */
export function diffRows(current, next, belongs) {
  const patch = {};
  for (const [id, record] of entries(current)) if (belongs(record) && !(id in next)) patch[id] = null;
  for (const [id, record] of Object.entries(next)) if (!same(current[id], record)) patch[id] = record;
  return patch;
}

/* Writes only the changed children of a top-level list with update().
   The old version re-wrote the whole list with set(), so two classes saving
   at the same moment could overwrite each other's records. */
async function patchRoot(path, buildPatch) {
  const current = await readRoot(path);
  const patch = buildPatch(current);
  if (!Object.keys(patch).length) return;
  for (const [id, value] of Object.entries(patch)) {
    if (value === null) delete current[id];
    else current[id] = value;
  }
  try {
    await update(ref(db, path), patch);
  } catch (error) {
    roots.delete(path);
    cache.clear();
    throw error;
  }
}

export async function loadStudentFirstKey(key, fallback) {
  if (cache.has(key)) return clone(cache.get(key));
  let value = fallback;
  if (key === "classIndex") {
    const [classes, students] = await Promise.all([readRoot("classes"), readRoot("students")]);
    value = toClassIndex(classes, students);
  } else if (key === "studentIndex") {
    value = toStudentIndex(await readRoot("students"));
  } else if (key === "calendar:events") {
    value = await read("calendarEvents", []);
  } else if (key === "lastBackupAt") {
    value = await read("meta/lastBackupAt", null);
  } else if (key.startsWith("attendance:")) {
    const classId = key.slice("attendance:".length);
    const [attendance, journal] = await Promise.all([readRoot("attendance"), readRoot("attendanceJournal")]);
    value = attendanceForClass(attendance, journal, classId);
  } else if (key.startsWith("quiz:")) {
    value = assessmentForClass(await readRoot("assessments"), key.slice("quiz:".length), "quiz");
  } else if (key.startsWith("exam:")) {
    value = assessmentForClass(await readRoot("assessments"), key.slice("exam:".length), "exam");
  } else if (key.startsWith("fee:")) {
    value = feesForClass(await readRoot("fees"), key.slice("fee:".length));
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
  const nextAttendance = {};
  const nextJournals = {};
  for (const [date, day] of entries(value)) {
    if (day?.note || day?.content || day?.videoUrl) {
      const id = `journal_${classId}_${date}`.replace(/[^A-Za-z0-9_-]/g, "_");
      nextJournals[id] = { id, classId, date, note: day.note || "", content: day.content || "", videoUrl: day.videoUrl || "" };
    }
    for (const [studentId, status] of entries(day?.records)) {
      if (status === "" || status == null || (Array.isArray(status) && status.length === 0)) continue;
      const id = `att_${classId}_${studentId}_${date}`.replace(/[^A-Za-z0-9_-]/g, "_");
      nextAttendance[id] = { id, studentId, classId, date, status };
    }
  }
  const belongs = (record) => record?.classId === classId;
  await Promise.all([
    patchRoot("attendance", (all) => diffRows(all, nextAttendance, belongs)),
    patchRoot("attendanceJournal", (all) => diffRows(all, nextJournals, belongs)),
  ]);
}

async function saveAssessments(classId, value, type) {
  const next = {};
  for (const column of value?.columns || []) {
    for (const [studentId, score] of entries(value?.scores?.[column.id])) {
      const id = `asm_${type}_${classId}_${column.id}_${studentId}`.replace(/[^A-Za-z0-9_-]/g, "_");
      next[id] = { id, studentId, classId, type, assessmentId: column.id, name: column.name || "", date: column.date || "", range: column.range || "", score };
    }
  }
  await patchRoot("assessments", (all) => diffRows(all, next, (record) => record?.classId === classId && record?.type === type));
}

async function saveFees(classId, value) {
  const next = {};
  for (const [index, charge] of (value?.charges || []).entries()) {
    const id = charge.id || `fee_${classId}_${charge.studentId || "student"}_${index}`.replace(/[^A-Za-z0-9_-]/g, "_");
    next[id] = { ...charge, id, classId };
  }
  await patchRoot("fees", (all) => diffRows(all, next, (record) => record?.classId === classId));
}

function changedStudents(current, students) {
  const patch = {};
  for (const [id, student] of Object.entries(students)) if (!same(current[id], student)) patch[id] = student;
  return patch;
}

async function saveStudentsFromClasses(value) {
  await patchRoot("students", (current) => {
    const students = studentMap(clone(current));
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
    return changedStudents(current, students);
  });
}

export async function saveStudentFirstKey(key, value) {
  cache.set(key, clone(value));
  if (key === "classIndex") {
    const classesRoot = toClassesRoot(value);
    await set(ref(db, "classes"), classesRoot);
    roots.set("classes", classesRoot);
    await saveStudentsFromClasses(value);
  } else if (key === "studentIndex") {
    await patchRoot("students", (current) => {
      const students = studentMap(clone(current));
      for (const [id, profile] of entries(value)) {
        const previous = students[id] || { id, aliases: [], enrollments: {}, sourceRefs: [] };
        students[id] = { ...previous, displayName: profile.name || previous.displayName || "", aliases: previous.aliases || [], sourceRefs: profile.sourceRefs || previous.sourceRefs || [] };
      }
      return changedStudents(current, students);
    });
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
  roots.clear();
}
