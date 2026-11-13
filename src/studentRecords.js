/* Pure helpers for the student card (admin 學生總覽 and the parent/student
   view). No Firebase or React here, so it can be tested with node --test.

   Data flow:
   raw lists (students, classes, attendance, attendanceJournal, assessments)
     -> buildAllPortalData()   one small "snapshot" per student
     -> buildStudentCard()     numbers and lists the card shows
   The admin and the parent see the exact same snapshot, so what the teacher
   sees in 學生總覽 is what the family sees. */
import { normalizeAttendanceStatus, COUNTED_ATTENDANCE_BASE_STATUSES } from "./attendance.js";
import { numericScore } from "./assessment.js";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const valuesOf = (value) => (isObject(value) ? Object.values(value) : Array.isArray(value) ? value : []).filter(isObject);
const text = (value) => String(value ?? "").trim();
const round1 = (value) => Math.round(value * 10) / 10;

export const ABSENT_STATUSES = ["請假", "曠課"];
export const ASSESSMENT_TYPE_LABEL = { quiz: "平時考", exam: "段考" };
/** A class average is only shown when at least this many students have a
    score for that test. In a 2-student class the average (with the head count)
    lets one family work out the other student's score exactly. */
export const MIN_CLASS_AVG_COUNT = 5;
export const RECORD_ROOT_NAMES = ["students", "classes", "attendance", "attendanceJournal", "assessments"];

/** A stored score is either a plain value or a cell like { score, rank }. */
export function readScoreCell(score) {
  const cell = isObject(score) ? score : { score };
  const raw = cell.score ?? "";
  return { raw: typeof raw === "number" ? raw : text(raw), value: numericScore(raw), rank: text(cell.rank) };
}

function hasScore(row) {
  const cell = readScoreCell(row?.score);
  return cell.raw !== "" || cell.rank !== "" || text(row?.rank) !== "";
}

/** Columns created in the app get ids from Date.now().toString(36); exams
    have no date field, so the id is the best clue for their order. */
export function dateFromGenId(id) {
  const match = /^([0-9a-z]{8})[0-9a-z]{1,6}$/.exec(String(id || ""));
  if (!match) return "";
  const ms = parseInt(match[1], 36);
  if (!(ms > Date.UTC(2015, 0, 1) && ms < Date.UTC(2100, 0, 1))) return "";
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

const assessmentKey = (row) => `${row.classId}|${row.type}|${row.assessmentId}`;
const dayKey = (classId, date) => `${classId}|${date}`;

function groupByStudent(value) {
  const map = new Map();
  for (const [id, row] of Object.entries(isObject(value) ? value : {})) {
    if (!isObject(row) || !row.studentId) continue;
    if (!map.has(row.studentId)) map.set(row.studentId, []);
    map.get(row.studentId).push({ ...row, id: row.id || id });
  }
  return map;
}

function assessmentAverages(assessments) {
  const totals = new Map();
  for (const row of valuesOf(assessments)) {
    const value = readScoreCell(row.score).value;
    if (value === null) continue;
    const key = assessmentKey(row);
    const total = totals.get(key) || { sum: 0, count: 0 };
    total.sum += value;
    total.count += 1;
    totals.set(key, total);
  }
  return new Map([...totals].map(([key, total]) => [key, { avg: round1(total.sum / total.count), count: total.count }]));
}

function buildContext(roots) {
  const journalByDay = new Map();
  for (const [id, row] of Object.entries(isObject(roots?.attendanceJournal) ? roots.attendanceJournal : {})) {
    if (isObject(row) && row.classId && row.date) journalByDay.set(dayKey(row.classId, row.date), { ...row, id: row.id || id });
  }
  return {
    classes: isObject(roots?.classes) ? roots.classes : {},
    attendanceByStudent: groupByStudent(roots?.attendance),
    assessmentsByStudent: groupByStudent(roots?.assessments),
    journalByDay,
    averages: assessmentAverages(roots?.assessments),
  };
}

function buildOne(studentId, student, context, now) {
  if (!isObject(student)) return null;
  const enrollments = {};
  for (const [id, item] of Object.entries(isObject(student.enrollments) ? student.enrollments : {})) {
    if (!isObject(item) || !item.classId) continue;
    enrollments[id] = {
      classId: item.classId,
      className: text(item.className),
      subject: text(item.subject),
      grade: text(item.grade),
      school: text(item.school),
      group: text(item.group),
      joinDate: text(item.joinDate),
      endDate: text(item.endDate),
      resumeDate: text(item.resumeDate),
      status: item.status === "ended" ? "ended" : "active",
    };
  }
  const classIds = new Set(Object.values(enrollments).map((item) => item.classId));

  const classes = {};
  for (const item of Object.values(enrollments)) {
    const cls = isObject(context.classes[item.classId]) ? context.classes[item.classId] : {};
    const subjects = (Array.isArray(cls.subjects) ? cls.subjects : []).map(text).filter(Boolean);
    classes[item.classId] = { id: item.classId, name: text(cls.name) || item.className || "班級", subject: text(cls.subject) || item.subject, grade: text(cls.grade) || item.grade, ...(subjects.length ? { subjects } : {}) };
  }

  const attendance = {};
  const days = new Set();
  for (const row of context.attendanceByStudent.get(studentId) || []) {
    if (!classIds.has(row.classId) || !row.date) continue;
    if (!normalizeAttendanceStatus(row.status).length) continue;
    attendance[row.id] = { id: row.id, classId: row.classId, date: row.date, status: row.status };
    days.add(dayKey(row.classId, row.date));
  }

  // Only the teaching content and replay video of days this student has a
  // record for. The teacher's private 備註 is not copied to families.
  const journal = {};
  for (const key of days) {
    const row = context.journalByDay.get(key);
    if (!row || !(text(row.content) || text(row.videoUrl))) continue;
    journal[row.id] = { id: row.id, classId: row.classId, date: row.date, content: text(row.content), videoUrl: text(row.videoUrl) };
  }

  const assessments = {};
  for (const row of context.assessmentsByStudent.get(studentId) || []) {
    if (!classIds.has(row.classId) || !hasScore(row)) continue;
    const cell = readScoreCell(row.score);
    const average = context.averages.get(assessmentKey(row));
    assessments[row.id] = {
      id: row.id,
      classId: row.classId,
      type: row.type === "exam" ? "exam" : "quiz",
      assessmentId: text(row.assessmentId),
      name: text(row.name),
      date: text(row.date),
      range: text(row.range),
      ...(text(row.subject) ? { subject: text(row.subject) } : {}),
      score: cell.raw,
      rank: cell.rank || text(row.rank),
      ...(average && average.count >= MIN_CLASS_AVG_COUNT ? { classAvg: average.avg, classCount: average.count } : {}),
    };
  }

  return {
    version: 2,
    generatedAt: now,
    student: { id: studentId, displayName: text(student.displayName) || text(student.name) || "未命名學生", enrollments },
    classes,
    attendance,
    journal,
    assessments,
  };
}

/** One snapshot per student, keyed by student id. */
export function buildAllPortalData(roots, now = new Date().toISOString()) {
  const context = buildContext(roots);
  const output = {};
  for (const [id, student] of Object.entries(isObject(roots?.students) ? roots.students : {})) {
    const snapshot = buildOne(id, student, context, now);
    if (snapshot) output[id] = snapshot;
  }
  return output;
}

export function buildStudentPortalData(studentId, roots, now = new Date().toISOString()) {
  const student = isObject(roots?.students) ? roots.students[studentId] : null;
  return student ? buildOne(studentId, student, buildContext(roots), now) : null;
}

/** Last guard before publishing: an empty student list is never published,
    because it would remove every family copy. (A read that fails does not get
    here: readPath() throws after its retries instead of returning nothing.) */
export function publishSafetyCheck(roots) {
  const count = (value) => (isObject(value) ? Object.keys(value).length : 0);
  if (!count(roots?.students)) return { ok: false, reason: "沒有讀到任何學生資料" };
  return { ok: true, reason: "" };
}

/** Same shape the database gives back: sorted keys, no empty values. */
export function canonical(value) {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const list = value.map(canonical).filter((item) => item !== undefined);
    return list.length ? list : undefined;
  }
  if (typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      const item = canonical(value[key]);
      if (item !== undefined) output[key] = item;
    }
    return Object.keys(output).length ? output : undefined;
  }
  return value;
}

export function samePortalData(a, b) {
  const strip = (value) => (isObject(value) ? { ...value, generatedAt: undefined } : value);
  return JSON.stringify(canonical(strip(a)) ?? null) === JSON.stringify(canonical(strip(b)) ?? null);
}

/** Only students whose snapshot changed. A student who no longer exists gets
    `null`, which removes the family copy (families can't read it anyway once
    the student is gone, and the data should not stay behind). Ids that are
    already empty in `existing` are not deleted again. */
export function diffPortalData(existing, next) {
  const patch = {};
  for (const [id, value] of Object.entries(existing || {})) {
    if (value != null && !(id in (next || {}))) patch[id] = null;
  }
  for (const [id, snapshot] of Object.entries(next || {})) {
    if (snapshot && !samePortalData(existing?.[id], snapshot)) patch[id] = snapshot;
  }
  return patch;
}

/** A day that is nothing but 出席. 出席 with 遲到 or 早退 is NOT plain: it is worth listing. */
export const isPlainPresent = (row) => Array.isArray(row?.statuses) && row.statuses.length === 1 && row.statuses[0] === "出席";

/** Attendance list default: everything except plain 出席. */
export const DEFAULT_ATTENDANCE_STATUS = "exceptions";

/** Attendance rows of a card, filtered by date range and status.
    status: "exceptions" (default: all but plain 出席), "all", or one status name such as "請假". */
export function filterAttendanceRows(rows, { from = "", to = "", status = DEFAULT_ATTENDANCE_STATUS } = {}) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (from && row.date < from) return false;
    if (to && row.date > to) return false;
    if (!status || status === "all") return true;
    if (status === DEFAULT_ATTENDANCE_STATUS) return !isPlainPresent(row);
    return Array.isArray(row.statuses) && row.statuses.includes(status);
  });
}

/** Subjects of the scores shown, in the teacher's order for that class (the
    class's 分科目 list), then any others, then scores with no subject last. */
export function orderSubjects(scores, classes = []) {
  const seen = [...new Set(scores.map((row) => row.subject).filter(Boolean))];
  const teacherOrder = [];
  for (const cls of classes) for (const subject of cls?.subjects || []) if (!teacherOrder.includes(subject)) teacherOrder.push(subject);
  const rank = (subject) => { const i = teacherOrder.indexOf(subject); return i === -1 ? teacherOrder.length : i; };
  return seen.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Average per subject. Empty when the scores belong to a single subject (or
    none), because then the overall average already is that subject's. */
function scoreSubjectAverages(numeric, classMap) {
  const subjects = orderSubjects(numeric, [...classMap.values()]);
  const groups = subjects.map((subject) => ({ subject, rows: numeric.filter((row) => row.subject === subject) }));
  const untagged = numeric.filter((row) => !row.subject);
  if (untagged.length && subjects.length) groups.push({ subject: "", rows: untagged });
  if (groups.length < 2) return [];
  return groups.map(({ subject, rows }) => ({ subject, count: rows.length, average: round1(rows.reduce((sum, row) => sum + row.value, 0) / rows.length) }));
}

/** Everything the card shows, optionally for one class only. */
export function buildStudentCard(snapshot, { classId = "all", type = "all" } = {}) {
  if (!isObject(snapshot?.student)) return null;
  const classMap = new Map();
  for (const item of valuesOf(snapshot.student.enrollments)) {
    if (!item.classId || classMap.has(item.classId)) continue;
    const cls = snapshot.classes?.[item.classId] || {};
    classMap.set(item.classId, {
      id: item.classId,
      name: cls.name || item.className || "班級",
      subject: cls.subject || item.subject || "",
      subjects: Array.isArray(cls.subjects) ? cls.subjects : [],
      school: item.school || "",
      group: item.group || "",
      grade: item.grade || cls.grade || "",
      stopped: item.status === "ended",
    });
  }
  const classes = [...classMap.values()];
  const inScope = (id) => classId === "all" || id === classId;
  const className = (id) => classMap.get(id)?.name || snapshot.classes?.[id]?.name || "";

  const journalByDay = new Map(valuesOf(snapshot.journal).map((row) => [dayKey(row.classId, row.date), row]));
  const attendance = valuesOf(snapshot.attendance)
    .filter((row) => row.date && inScope(row.classId))
    .map((row) => {
      const statuses = normalizeAttendanceStatus(row.status);
      const day = journalByDay.get(dayKey(row.classId, row.date)) || {};
      return { id: row.id || dayKey(row.classId, row.date), classId: row.classId, className: className(row.classId), date: row.date, statuses, base: statuses[0] || "", content: day.content || "", videoUrl: day.videoUrl || "" };
    })
    .filter((row) => row.statuses.length)
    .sort((a, b) => b.date.localeCompare(a.date) || a.className.localeCompare(b.className));

  const counts = { 出席: 0, 請假: 0, 曠課: 0, 遲到: 0, 早退: 0, 延課: 0, 假期: 0 };
  let counted = 0;
  for (const row of attendance) {
    if (COUNTED_ATTENDANCE_BASE_STATUSES.includes(row.base)) counted += 1;
    for (const status of row.statuses) if (status in counts) counts[status] += 1;
  }

  const makeup = attendance.filter((row) => ABSENT_STATUSES.includes(row.base));
  const videoCount = makeup.filter((row) => safeVideoUrl(row.videoUrl)).length;

  const allScores = valuesOf(snapshot.assessments)
    .filter((row) => inScope(row.classId) && hasScore(row))
    .map((row) => {
      const cell = readScoreCell(row.score);
      const kind = row.type === "exam" ? "exam" : "quiz";
      return {
        id: row.id,
        classId: row.classId,
        className: className(row.classId),
        type: kind,
        typeLabel: ASSESSMENT_TYPE_LABEL[kind],
        name: row.name || ASSESSMENT_TYPE_LABEL[kind],
        date: row.date || "",
        sortDate: row.date || dateFromGenId(row.assessmentId),
        range: row.range || "",
        subject: row.subject || "",
        raw: cell.raw,
        value: cell.value,
        rank: text(row.rank) || cell.rank,
        classAvg: typeof row.classAvg === "number" ? row.classAvg : null,
        assessmentId: row.assessmentId || "",
      };
    })
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.assessmentId.localeCompare(b.assessmentId));
  const types = [...new Set(allScores.map((row) => row.type))];
  const scores = type === "all" ? allScores : allScores.filter((row) => row.type === type);
  const numeric = scores.filter((row) => row.value !== null);
  const latest = numeric.at(-1) || null;
  const subjectAverages = scoreSubjectAverages(numeric, classMap);

  return {
    student: { id: snapshot.student.id, name: snapshot.student.displayName || "學生" },
    generatedAt: snapshot.generatedAt || "",
    classes,
    attendance,
    makeup,
    scores,
    scoreTypes: types,
    stats: {
      recorded: attendance.length,
      counted,
      ...counts,
      attendanceRate: counted ? round1((counts.出席 / counted) * 100) : null,
      absentCount: makeup.length,
      videoCount,
      missingVideoCount: makeup.length - videoCount,
      scoreCount: numeric.length,
      scoreAverage: numeric.length ? round1(numeric.reduce((sum, row) => sum + row.value, 0) / numeric.length) : null,
      scoreBest: numeric.length ? Math.max(...numeric.map((row) => row.value)) : null,
      subjectAverages,
      latestScore: latest ? { name: latest.name, value: latest.value, classAvg: latest.classAvg } : null,
      lastAttendance: attendance[0] || null,
    },
  };
}

/** Students whose every class enrollment has ended (停課). */
export function isStudentStopped(snapshot) {
  const list = valuesOf(snapshot?.student?.enrollments);
  return list.length > 0 && list.every((item) => item.status === "ended");
}

/** Bound student ids of a parent account; old accounts stored an array. */
export function accountStudentIds(account) {
  if (Array.isArray(account?.studentIds)) return account.studentIds.filter((id) => typeof id === "string" && id);
  if (isObject(account?.studentIds)) return Object.entries(account.studentIds).filter(([, code]) => typeof code === "string" && code).map(([id]) => id);
  return [];
}

/** Video links are only shown when they are normal web links. */
export function safeVideoUrl(url) {
  const value = text(url);
  return /^https?:\/\//i.test(value) ? value : "";
}
