import test from "node:test";
import assert from "node:assert/strict";
import { activeSubjectTab, assessmentSubjectTabs, columnsOfSubject } from "../src/assessment.js";

const col = (id, subject) => ({ id, name: id, ...(subject ? { subject } : {}) });

test("tabs follow the class's own subject order and add 未分科 only when an exam has no subject", () => {
  assert.deepEqual(assessmentSubjectTabs([col("a", "化學"), col("b", "物理")], ["物理", "化學"]), ["物理", "化學"]);
  assert.deepEqual(assessmentSubjectTabs([col("a", "化學"), col("b")], ["物理", "化學"]), ["物理", "化學", ""]);
  assert.deepEqual(assessmentSubjectTabs([], ["物理", "化學"]), ["物理", "化學"]);
});

test("a subject that is on an exam but no longer in the class's list still gets its own tab", () => {
  assert.deepEqual(assessmentSubjectTabs([col("a", "生物"), col("b", "物理")], ["物理"]), ["物理", "生物"]);
});

test("a class without subjects has just one tab (nothing to separate)", () => {
  assert.deepEqual(assessmentSubjectTabs([col("a"), col("b")], []), [""]);
  assert.deepEqual(assessmentSubjectTabs([], []), []);
});

test("each tab holds only its own subject's exams", () => {
  const columns = [col("a", "物理"), col("b", "化學"), col("c", "物理"), col("d")];
  assert.deepEqual(columnsOfSubject(columns, "物理").map((c) => c.id), ["a", "c"]);
  assert.deepEqual(columnsOfSubject(columns, "化學").map((c) => c.id), ["b"]);
  assert.deepEqual(columnsOfSubject(columns, "").map((c) => c.id), ["d"]);
});

test("the shown tab is the requested one, else the first that has exams, else the first", () => {
  const tabs = ["物理", "化學", ""];
  const columns = [col("a", "化學"), col("b")];
  assert.equal(activeSubjectTab(tabs, columns, "物理"), "物理");
  assert.equal(activeSubjectTab(tabs, columns, null), "化學");
  assert.equal(activeSubjectTab(tabs, columns, "不存在"), "化學");
  assert.equal(activeSubjectTab(tabs, [], null), "物理");
  assert.equal(activeSubjectTab([], [], null), "");
  assert.equal(activeSubjectTab(tabs, [col("x")], null), "");
});
