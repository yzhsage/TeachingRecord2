import test from "node:test";
import assert from "node:assert/strict";
import { assessmentForClass, assessmentRowsFor } from "../src/assessmentRows.js";
import { updateAssessmentColumn } from "../src/assessment.js";

const table = () => ({
  columns: [
    { id: "p1", name: "CH1 小考", date: "2026-03-02", subject: "物理", segment: "1-1" },
    { id: "c1", name: "CH1 小考", date: "2026-03-03", subject: "化學", segment: "1-2" },
    { id: "n1", name: "舊考試", date: "2026-02-01", segment: "" },
  ],
  scores: { p1: { s1: { score: 80 } }, c1: { s1: { score: 90 } }, n1: { s1: { score: 70 } } },
});

test("the subject of an exam survives save and reload", () => {
  const { rows, columns } = assessmentRowsFor("c", table(), "quiz");
  const back = assessmentForClass(rows, "c", "quiz", columns);
  assert.deepEqual(Object.fromEntries(back.columns.map((col) => [col.id, col.subject])), { p1: "物理", c1: "化學", n1: undefined });
  assert.equal(back.scores.p1.s1.score, 80);
});

test("every stored score row of a subject exam carries the subject, so the family snapshot can show it", () => {
  const { rows } = assessmentRowsFor("c", table(), "quiz");
  const bySubject = Object.values(rows).map((row) => [row.assessmentId, row.subject]);
  assert.deepEqual(Object.fromEntries(bySubject), { p1: "物理", c1: "化學", n1: undefined });
});

test("exams without a subject are stored exactly as before (no extra key, so no mass rewrite)", () => {
  const { rows, columns } = assessmentRowsFor("c", table(), "quiz");
  const plainRow = Object.values(rows).find((row) => row.assessmentId === "n1");
  const plainColumn = Object.values(columns).find((col) => col.assessmentId === "n1");
  assert.ok(!("subject" in plainRow));
  assert.ok(!("subject" in plainColumn));
});

test("when the column record is missing, the subject is still recovered from the score rows", () => {
  const { rows } = assessmentRowsFor("c", table(), "quiz");
  const back = assessmentForClass(rows, "c", "quiz", {});
  assert.equal(back.columns.find((col) => col.id === "p1").subject, "物理");
});

test("other classes and the other kind are not mixed in", () => {
  const a = assessmentRowsFor("c", table(), "quiz");
  const b = assessmentRowsFor("other", table(), "quiz");
  const mixed = { ...a.rows, ...b.rows };
  assert.equal(assessmentForClass(mixed, "c", "quiz", {}).columns.length, 3);
  assert.equal(assessmentForClass(mixed, "c", "exam", {}).columns.length, 0);
});

test("editing a column can set, change and clear its subject", () => {
  const col = { id: "n1", name: "舊考試", date: "2026-02-01" };
  const set = updateAssessmentColumn(col, { name: "舊考試", subject: "化學" });
  assert.equal(set.subject, "化學");
  assert.equal(updateAssessmentColumn(set, { name: "舊考試", subject: "物理" }).subject, "物理");
  assert.ok(!("subject" in updateAssessmentColumn(set, { name: "舊考試", subject: "" })));
  // not passing a subject (a class without subjects) leaves it alone
  assert.equal(updateAssessmentColumn(set, { name: "改名" }).subject, "化學");
});
