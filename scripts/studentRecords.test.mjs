import test from "node:test";
import assert from "node:assert/strict";
import {
  accountStudentIds,
  buildAllPortalData,
  buildStudentCard,
  dateFromGenId,
  diffPortalData,
  MIN_CLASS_AVG_COUNT,
  orderSubjects,
  publishSafetyCheck,
  safeVideoUrl,
} from "../src/studentRecords.js";

const roots = () => ({
  students: {
    s1: { id: "s1", displayName: "王小明", enrollments: {
      e1: { classId: "c1", className: "國二數學", status: "active", school: "建國", grade: "國二" },
      e2: { classId: "c2", className: "國二英文", status: "active" },
    } },
    s2: { id: "s2", displayName: "李小華", enrollments: { e3: { classId: "c1", className: "國二數學", status: "ended" } } },
  },
  classes: { c1: { id: "c1", name: "國二數學" }, c2: { id: "c2", name: "國二英文" } },
  attendance: {
    a1: { id: "a1", studentId: "s1", classId: "c1", date: "2026-03-01", status: "出席" },
    a2: { id: "a2", studentId: "s1", classId: "c1", date: "2026-03-08", status: ["出席", "遲到"] },
    a3: { id: "a3", studentId: "s1", classId: "c1", date: "2026-03-15", status: "請假" },
    a4: { id: "a4", studentId: "s1", classId: "c2", date: "2026-03-16", status: "曠課" },
    a5: { id: "a5", studentId: "s1", classId: "c1", date: "2026-03-22", status: "延課" },
    a6: { id: "a6", studentId: "s2", classId: "c1", date: "2026-03-01", status: "出席" },
  },
  attendanceJournal: {
    j1: { id: "j1", classId: "c1", date: "2026-03-15", content: "一元一次方程式", note: "老師私人備註", videoUrl: "https://youtu.be/abc" },
    j2: { id: "j2", classId: "c1", date: "2026-03-29", content: "別天的課", videoUrl: "https://youtu.be/zzz" },
  },
  assessments: {
    q1: { id: "q1", studentId: "s1", classId: "c1", type: "quiz", assessmentId: "col1", name: "小考一", date: "2026-03-02", score: { score: 80 } },
    q2: { id: "q2", studentId: "s2", classId: "c1", type: "quiz", assessmentId: "col1", name: "小考一", date: "2026-03-02", score: { score: 60 } },
    q3: { id: "q3", studentId: "s1", classId: "c1", type: "quiz", assessmentId: "col2", name: "小考二", date: "2026-03-09", score: { score: 90 } },
    x1: { id: "x1", studentId: "s1", classId: "c2", type: "exam", assessmentId: "ex1", name: "第一次段考", score: { score: 70, rank: "5" } },
    blank: { id: "blank", studentId: "s1", classId: "c1", type: "quiz", assessmentId: "col3", name: "小考三", date: "2026-03-20", score: { score: "" } },
  },
});

test("attendance rate counts only 出席/請假/曠課; 延課 is left out", () => {
  const card = buildStudentCard(buildAllPortalData(roots()).s1);
  assert.equal(card.stats.counted, 4);
  assert.equal(card.stats.出席, 2);
  assert.equal(card.stats.attendanceRate, 50);
  assert.equal(card.stats.遲到, 1);
  assert.equal(card.stats.延課, 1);
});

test("makeup videos: absences with a video count, absences without one are listed as missing", () => {
  const card = buildStudentCard(buildAllPortalData(roots()).s1);
  assert.equal(card.stats.absentCount, 2);
  assert.equal(card.stats.videoCount, 1);
  assert.equal(card.stats.missingVideoCount, 1);
  assert.equal(card.makeup.find((row) => row.date === "2026-03-15").videoUrl, "https://youtu.be/abc");
});

test("score stats ignore blank scores and include class average and rank", () => {
  const card = buildStudentCard(buildAllPortalData(roots()).s1);
  assert.equal(card.stats.scoreCount, 3);
  assert.equal(card.stats.scoreAverage, 80);
  assert.equal(card.stats.scoreBest, 90);
  // c1 has only 2 scored students, below MIN_CLASS_AVG_COUNT: no class average
  assert.equal(card.scores.find((row) => row.name === "小考一").classAvg, null);
  assert.equal(card.scores.find((row) => row.type === "exam").rank, "5");
});

test("class filter only shows that class", () => {
  const card = buildStudentCard(buildAllPortalData(roots()).s1, { classId: "c2" });
  assert.deepEqual(card.attendance.map((row) => row.date), ["2026-03-16"]);
  assert.deepEqual(card.scores.map((row) => row.name), ["第一次段考"]);
});

test("a student's snapshot never contains another student's records or the private note", () => {
  const data = buildAllPortalData(roots());
  const json = JSON.stringify(data.s2);
  assert.ok(!json.includes("a1"));
  assert.ok(!json.includes("q1"));
  assert.ok(!JSON.stringify(data.s1).includes("老師私人備註"));
  assert.ok(!JSON.stringify(data.s1).includes("別天的課"));
});

test("diff only re-publishes students whose records changed", () => {
  const before = buildAllPortalData(roots(), "2026-01-01T00:00:00Z");
  const changed = roots();
  changed.attendance.a6.status = "曠課";
  const after = buildAllPortalData(changed, "2026-02-02T00:00:00Z");
  assert.deepEqual(Object.keys(diffPortalData(before, after)), ["s2"]);
  assert.deepEqual(Object.keys(diffPortalData(after, buildAllPortalData(changed))), []);
});

test("empty reads are never published, but a new student may have empty records", () => {
  assert.equal(publishSafetyCheck({ students: {}, attendance: { a: {} } }).ok, false);
  assert.equal(publishSafetyCheck({ students: { s: {} }, attendance: {}, assessments: {} }).ok, true);
  assert.equal(publishSafetyCheck(roots()).ok, true);
});

test("helpers: account ids, video links, ids made from time", () => {
  assert.deepEqual(accountStudentIds({ studentIds: { s1: "ABCD2345", s2: true } }), ["s1"]);
  assert.equal(safeVideoUrl("javascript:alert(1)"), "");
  assert.equal(safeVideoUrl(" https://youtu.be/x "), "https://youtu.be/x");
  const id = Date.UTC(2026, 2, 5, 4).toString(36) + "abc123";
  assert.equal(dateFromGenId(id), "2026-03-05");
  assert.equal(dateFromGenId("exam_1"), "");
});

test("class average is hidden in small classes, so one family can't work out another student's score", () => {
  const small = roots();
  const data = buildAllPortalData(small).s1.assessments;
  assert.equal(data.q1.classAvg, undefined);
  assert.equal(data.q1.classCount, undefined);
  assert.ok(!JSON.stringify(data).includes("classAvg"));
});

test("class average is shown once enough students have a score", () => {
  const big = { students: {}, classes: { c1: { id: "c1", name: "大班" } }, attendance: {}, attendanceJournal: {}, assessments: {} };
  for (let i = 0; i < MIN_CLASS_AVG_COUNT; i += 1) {
    big.students[`s${i}`] = { displayName: `學生${i}`, enrollments: { e: { classId: "c1", status: "active" } } };
    big.assessments[`a${i}`] = { id: `a${i}`, studentId: `s${i}`, classId: "c1", type: "quiz", assessmentId: "col", name: "小考", score: { score: 60 + i * 10 } };
  }
  const row = buildAllPortalData(big).s0.assessments.a0;
  assert.equal(row.classAvg, 80);
  assert.equal(row.classCount, MIN_CLASS_AVG_COUNT);
});

test("a student who no longer exists is removed from the family copy exactly once", () => {
  const snap = { student: { id: "x", displayName: "x" } };
  const published = { s1: snap, s3: snap };
  const patch = diffPortalData(published, { s1: snap });
  assert.deepEqual(patch, { s3: null });
  // what portalPublish does after a successful write
  for (const [id, value] of Object.entries(patch)) { if (value === null) delete published[id]; else published[id] = value; }
  assert.deepEqual(diffPortalData(published, { s1: snap }), {});
  // an id that is already null (older runs left these) is not deleted again
  assert.deepEqual(diffPortalData({ s1: snap, s3: null }, { s1: snap }), {});
});

function subjectRoots() {
  const row = (id, assessmentId, name, date, subject, value, type = "quiz") => ({ id, studentId: "s1", classId: "c1", type, assessmentId, name, date, ...(subject ? { subject } : {}), score: { score: value } });
  return {
    students: { s1: { id: "s1", displayName: "王小明", enrollments: { e1: { classId: "c1", className: "物理化學", status: "active" } } } },
    classes: { c1: { id: "c1", name: "物理化學", subject: "物理化學", subjects: ["物理", "化學"] } },
    attendance: {}, attendanceJournal: {},
    assessments: {
      a: row("a", "ch", "CH1 小考", "2026-03-02", "化學", 90),
      b: row("b", "ph", "CH1 小考", "2026-03-03", "物理", 70),
      c: row("c", "ph2", "CH2 小考", "2026-03-10", "物理", 80),
      d: row("d", "old", "舊小考", "2026-02-01", "", 60),
      e: row("e", "mid", "第一次段考", "2026-04-01", "物理", 75, "exam"),
    },
  };
}

test("each score in the family snapshot and on the card says which subject it is", () => {
  const snapshot = buildAllPortalData(subjectRoots()).s1;
  assert.equal(snapshot.assessments.a.subject, "化學");
  assert.equal(snapshot.assessments.d.subject, undefined);
  assert.deepEqual(snapshot.classes.c1.subjects, ["物理", "化學"]);
  const card = buildStudentCard(snapshot);
  assert.deepEqual(card.scores.map((row) => [row.name, row.subject]), [
    ["舊小考", ""], ["CH1 小考", "化學"], ["CH1 小考", "物理"], ["CH2 小考", "物理"], ["第一次段考", "物理"],
  ]);
});

test("the card averages each subject separately, in the teacher's subject order", () => {
  const card = buildStudentCard(buildAllPortalData(subjectRoots()).s1, { type: "quiz" });
  assert.deepEqual(card.stats.subjectAverages, [
    { subject: "物理", count: 2, average: 75 },
    { subject: "化學", count: 1, average: 90 },
    { subject: "", count: 1, average: 60 },
  ]);
});

test("no per-subject averages when only one subject (or none) is involved", () => {
  const onlyPhysics = buildStudentCard(buildAllPortalData(subjectRoots()).s1, { type: "exam" });
  assert.deepEqual(onlyPhysics.stats.subjectAverages, []);
  const plain = buildStudentCard(buildAllPortalData(roots()).s1);
  assert.deepEqual(plain.stats.subjectAverages, []);
});

test("orderSubjects follows the class's own list, then the rest alphabetically", () => {
  const rows = [{ subject: "化學" }, { subject: "生物" }, { subject: "物理" }, { subject: "" }];
  assert.deepEqual(orderSubjects(rows, [{ subjects: ["物理", "化學"] }]), ["物理", "化學", "生物"]);
});

import { DEFAULT_ATTENDANCE_STATUS, filterAttendanceRows, isPlainPresent } from "../src/studentRecords.js";

const att = (date, ...statuses) => ({ id: date, date, statuses });

test("only a day that is nothing but 出席 counts as plain attendance", () => {
  assert.equal(isPlainPresent(att("2026-11-02", "出席")), true);
  assert.equal(isPlainPresent(att("2026-11-02", "出席", "遲到")), false);
  assert.equal(isPlainPresent(att("2026-11-02", "出席", "遲到", "早退")), false);
  assert.equal(isPlainPresent(att("2026-11-02", "請假")), false);
  assert.equal(isPlainPresent(att("2026-11-02")), false);
  assert.equal(isPlainPresent(undefined), false);
});

test("the attendance list leaves out plain 出席 by default", () => {
  const rows = [att("2026-11-02", "出席"), att("2026-11-03", "請假"), att("2026-11-04", "出席", "遲到"), att("2026-11-05", "曠課"), att("2026-11-06", "延課"), att("2026-11-09", "假期"), att("2026-11-10", "出席")];
  assert.equal(DEFAULT_ATTENDANCE_STATUS, "exceptions");
  assert.deepEqual(filterAttendanceRows(rows).map((row) => row.date), ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09"]);
});

test("all, a single status, and the date range still work", () => {
  const rows = [att("2026-11-02", "出席"), att("2026-11-03", "請假"), att("2026-11-04", "出席", "遲到"), att("2026-11-05", "曠課")];
  assert.equal(filterAttendanceRows(rows, { status: "all" }).length, 4);
  assert.deepEqual(filterAttendanceRows(rows, { status: "出席" }).map((row) => row.date), ["2026-11-02", "2026-11-04"]);
  assert.deepEqual(filterAttendanceRows(rows, { status: "遲到" }).map((row) => row.date), ["2026-11-04"]);
  assert.deepEqual(filterAttendanceRows(rows, { from: "2026-11-04" }).map((row) => row.date), ["2026-11-04", "2026-11-05"]);
  assert.deepEqual(filterAttendanceRows(rows, { to: "2026-11-03", status: "all" }).map((row) => row.date), ["2026-11-02", "2026-11-03"]);
  assert.deepEqual(filterAttendanceRows(undefined), []);
});
