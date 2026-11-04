import test from "node:test";
import assert from "node:assert/strict";
import {
  accountStudentIds,
  buildAllPortalData,
  buildStudentCard,
  dateFromGenId,
  diffPortalData,
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
  assert.equal(card.scores.find((row) => row.name === "小考一").classAvg, 70);
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

test("empty reads are never published", () => {
  assert.equal(publishSafetyCheck({ students: {}, attendance: { a: {} } }).ok, false);
  assert.equal(publishSafetyCheck({ students: { s: {} }, attendance: {}, assessments: {} }).ok, false);
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
