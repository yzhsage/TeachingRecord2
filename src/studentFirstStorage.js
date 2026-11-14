import { ref, set, update } from "firebase/database";
import { db } from "./firebase";
import { readPath } from "./firebaseRead";
import { applyClassList, classesPatch, membershipOf, studentMap, toClassIndex, toClassesRoot } from "./classSync.js";
import { assessmentForClass, assessmentRowsFor } from "./assessmentRows.js";

const cache = new Map();
const text = (value) => String(value ?? "").trim();
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const entries = (value) => Object.entries(isObject(value) ? value : {});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
async function patchRoot(path, buildPatch, { fresh = false } = {}) {
  // fresh: download the list again first, so a change made on another device
  // since this tab last read it is not overwritten with an old copy.
  if (fresh) roots.delete(path);
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

/* What THIS tab last read from or wrote to Firebase for the class list.
   Saving compares against it, so only this tab's own changes are written and
   things added on another device are never removed (see classSync.js). */
let classBaseline = null; // { records: { classId: record }, known: { classIds, pairs } }

function setClassBaseline(classList) {
  classBaseline = { records: toClassesRoot(classList), known: membershipOf(classList) };
}

async function ensureClassBaseline() {
  if (classBaseline) return classBaseline;
  // Nothing was loaded in this session (e.g. a restore before first load):
  // fall back to what Firebase holds right now.
  roots.delete("classes");
  roots.delete("students");
  const [classes, students] = await Promise.all([readRoot("classes"), readRoot("students")]);
  setClassBaseline(toClassIndex(classes, students));
  return classBaseline;
}

export async function loadStudentFirstKey(key, fallback) {
  if (cache.has(key)) return clone(cache.get(key));
  let value = fallback;
  if (key === "classIndex") {
    const [classes, students] = await Promise.all([readRoot("classes"), readRoot("students")]);
    value = toClassIndex(classes, students);
    setClassBaseline(value);
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
    const [assessments, columns] = await Promise.all([readRoot("assessments"), readRoot("assessmentColumns")]);
    value = assessmentForClass(assessments, key.slice("quiz:".length), "quiz", columns);
  } else if (key.startsWith("exam:")) {
    const [assessments, columns] = await Promise.all([readRoot("assessments"), readRoot("assessmentColumns")]);
    value = assessmentForClass(assessments, key.slice("exam:".length), "exam", columns);
  } else if (key.startsWith("fee:")) {
    value = feesForClass(await readRoot("fees"), key.slice("fee:".length));
  }
  cache.set(key, clone(value));
  return clone(value);
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
  const { rows, columns } = assessmentRowsFor(classId, value, type);
  await patchRoot("assessments", (all) => diffRows(all, rows, (record) => record?.classId === classId && record?.type === type));
  await patchRoot("assessmentColumns", (all) => diffRows(all, columns, (record) => record?.classId === classId && record?.type === type));
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
  // update() does not remove children that are absent from the new object.
  // Explicitly send null for deleted/orphaned student profiles; otherwise a
  // permanently deleted student remains under /students forever.
  for (const id of Object.keys(current || {})) {
    if (!(id in students)) patch[id] = null;
  }
  for (const [id, student] of Object.entries(students)) if (!same(current[id], student)) patch[id] = student;
  return patch;
}

async function saveStudentsFromClasses(value, known) {
  // fresh: always start from what Firebase holds now, then apply only the
  // membership changes this tab made (see applyClassList in classSync.js).
  await patchRoot("students", (current) => {
    const students = applyClassList(studentMap(clone(current)), value, known);
    return changedStudents(current, students);
  }, { fresh: true });
}

/** Remove stale student-first profiles left by older delete code. This does
    not touch attendance, scores, or fees; it only removes a /students child
    when none of its enrollments still points to a roster entry. */
export async function cleanupOrphanStudentProfiles(value) {
  const classList = Array.isArray(value) ? value : [];
  if (!classList.length) return;
  await patchRoot("students", (current) => {
    const students = studentMap(clone(current));
    for (const [studentId, student] of Object.entries(students)) {
      const validEnrollments = {};
      for (const [enrollmentId, enrollment] of entries(student.enrollments)) {
        const cls = classList.find((item) => item?.id === enrollment.classId);
        if (cls?.students?.some((roster) => roster?.id === studentId)) validEnrollments[enrollmentId] = enrollment;
      }
      if (!Object.keys(validEnrollments).length) delete students[studentId];
      else if (Object.keys(validEnrollments).length !== Object.keys(student.enrollments || {}).length) students[studentId] = { ...student, enrollments: validEnrollments };
    }
    return changedStudents(current, students);
  }, { fresh: true });
}

/* Other modules (the family-view updater) listen for finished saves. */
const savedListeners = new Set();
export function onStudentFirstSaved(listener) {
  savedListeners.add(listener);
  return () => savedListeners.delete(listener);
}
function notifySaved(key) {
  for (const listener of savedListeners) {
    try { listener(key); } catch (error) { console.error("save listener failed", key, error); }
  }
}

export async function saveStudentFirstKey(key, value) {
  cache.set(key, clone(value));
  if (key === "classIndex") {
    // Not set(ref(db, "classes"), ...): that overwrote the whole list, so a
    // tab with an old copy erased classes added on another device.
    const baseline = await ensureClassBaseline();
    const classesRoot = toClassesRoot(value);
    await patchRoot("classes", () => classesPatch(baseline.records, classesRoot), { fresh: true });
    await saveStudentsFromClasses(value, baseline.known);
    setClassBaseline(value); // only after both steps worked
  } else if (key === "studentIndex") {
    await patchRoot("students", (current) => {
      const students = studentMap(clone(current));
      for (const [id, profile] of entries(value)) {
        const previous = students[id] || { id, aliases: [], enrollments: {}, sourceRefs: [] };
        students[id] = { ...previous, displayName: profile.name || previous.displayName || "", aliases: previous.aliases || [], sourceRefs: profile.sourceRefs || previous.sourceRefs || [] };
      }
      return changedStudents(current, students);
    }, { fresh: true });
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
  notifySaved(key);
  return true;
}

const RECORD_ROOTS = ["students", "classes", "attendance", "attendanceJournal", "assessments", "assessmentColumns"];

/** The raw lists the student cards are built from. Uses the same local copy
    the save code keeps up to date, so just-saved edits show immediately. */
export async function loadRecordRoots() {
  const values = await Promise.all(RECORD_ROOTS.map((path) => readRoot(path)));
  return clone(Object.fromEntries(RECORD_ROOTS.map((path, index) => [path, values[index]])));
}

/** Forget the local copy so the next loadRecordRoots() downloads fresh data. */
export function invalidateRecordRoots() {
  for (const path of RECORD_ROOTS) roots.delete(path);
}

export function clearStudentFirstCache() {
  cache.clear();
  roots.clear();
}
