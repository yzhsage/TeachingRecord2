import test from "node:test";
import assert from "node:assert/strict";
import { applyClassList, classesPatch, membershipOf, toClassesRoot } from "../src/classSync.js";

const roster = (id, name = id) => ({ id, name, membership: "active" });
const cls = (id, students = []) => ({ id, name: `班${id}`, subject: "數學", grade: "國二", students });

// What the Firebase /students root looks like for the lists above.
function studentsFor(classList) {
  return applyClassList({}, classList, { classIds: new Set(), pairs: new Set() });
}

test("classesPatch writes only this tab's changes and deletes only classes it knew", () => {
  const baseline = toClassesRoot([cls("c1"), cls("c2")]);
  const changed = toClassesRoot([{ ...cls("c1"), name: "改名" }, cls("c3")]); // c2 deleted here, c3 new here
  const patch = classesPatch(baseline, changed);
  assert.deepEqual(Object.keys(patch).sort(), ["c1", "c2", "c3"]);
  assert.equal(patch.c2, null);
  assert.equal(patch.c1.name, "改名");
  // an unchanged list produces no writes at all
  assert.deepEqual(classesPatch(baseline, toClassesRoot([cls("c1"), cls("c2")])), {});
});

test("a class added on another device is not part of the patch", () => {
  // this tab knew c1 only; Firebase also has c9 (added elsewhere); this tab edits c1
  const baseline = toClassesRoot([cls("c1")]);
  const patch = classesPatch(baseline, toClassesRoot([{ ...cls("c1"), name: "改名" }]));
  assert.deepEqual(Object.keys(patch), ["c1"]);
});

test("stale tab: a student and a class added elsewhere survive this tab's save", () => {
  const known = membershipOf([cls("c1", [roster("s1")])]);
  // Firebase now also has: s2 in c1 and s3 in a brand-new class c9 (both added on another device)
  const firebase = studentsFor([cls("c1", [roster("s1"), roster("s2")]), cls("c9", [roster("s3")])]);
  // this tab only renames the class; its list still has only s1 in c1 and no c9
  const result = applyClassList(firebase, [{ ...cls("c1", [roster("s1")]), name: "改名" }], known);
  assert.ok(result.s2, "student added elsewhere is kept");
  assert.ok(Object.values(result.s2.enrollments).some((item) => item.classId === "c1"));
  assert.ok(result.s3, "student of a class added elsewhere is kept");
  assert.ok(Object.values(result.s3.enrollments).some((item) => item.classId === "c9"));
  assert.ok(Object.values(result.s1.enrollments).every((item) => item.className === "改名"));
});

test("removing a student from a roster here removes only that enrollment", () => {
  const before = [cls("c1", [roster("s1"), roster("s2")]), cls("c2", [roster("s1")])];
  const firebase = studentsFor(before);
  const result = applyClassList(firebase, [cls("c1", [roster("s2")]), cls("c2", [roster("s1")])], membershipOf(before));
  assert.deepEqual(Object.values(result.s1.enrollments).map((item) => item.classId), ["c2"]);
  assert.ok(result.s2);
});

test("a student whose last enrollment was removed here is deleted; deleting a class removes its enrollments", () => {
  const before = [cls("c1", [roster("s1")]), cls("c2", [roster("s2")])];
  const firebase = studentsFor(before);
  const result = applyClassList(firebase, [cls("c2", [roster("s2")])], membershipOf(before)); // c1 deleted here
  assert.equal(result.s1, undefined);
  assert.ok(result.s2);
});

test("a student with no enrollments that this pass did not touch is left alone", () => {
  const known = membershipOf([cls("c1", [roster("s1")])]);
  const firebase = { ...studentsFor([cls("c1", [roster("s1")])]), p1: { id: "p1", displayName: "別處建立", enrollments: {} } };
  const result = applyClassList(firebase, [cls("c1", [roster("s1")])], known);
  assert.ok(result.p1);
});

test("applyClassList does not modify its input", () => {
  const firebase = studentsFor([cls("c1", [roster("s1")])]);
  const copy = JSON.stringify(firebase);
  applyClassList(firebase, [], membershipOf([cls("c1", [roster("s1")])]));
  assert.equal(JSON.stringify(firebase), copy);
});

import { toClassIndex } from "../src/classSync.js";

// the Firebase round trip: class list -> /students + /classes -> class list again
const saveAndReload = (classList, before = {}) => {
  const known = membershipOf(classList);
  const students = applyClassList(before, classList, { classIds: new Set(), pairs: new Set() });
  return { students, reloaded: toClassIndex(toClassesRoot(classList), students), known };
};
const rosterOf = (reloaded, classId, studentId) => reloaded.find((item) => item.id === classId).students.find((item) => item.id === studentId);

test("a reloaded student is not labelled \"active\": only stopped students carry a membership", () => {
  const { reloaded } = saveAndReload([cls("c1", [{ id: "s1", name: "甲" }, { id: "s2", name: "乙", membership: "stopped", endDate: "2026-10-01" }])]);
  assert.equal("membership" in rosterOf(reloaded, "c1", "s1"), false);
  assert.equal(rosterOf(reloaded, "c1", "s2").membership, "stopped");
});

test("設為試聽生 / 轉為班內生 survive saving and reloading", () => {
  const { reloaded } = saveAndReload([cls("c1", [{ id: "s1", name: "甲", forceTrial: true }, { id: "s2", name: "乙", forceActive: true }, { id: "s3", name: "丙" }])]);
  assert.equal(rosterOf(reloaded, "c1", "s1").forceTrial, true);
  assert.equal(rosterOf(reloaded, "c1", "s1").forceActive, undefined);
  assert.equal(rosterOf(reloaded, "c1", "s2").forceActive, true);
  assert.equal("forceTrial" in rosterOf(reloaded, "c1", "s3") || "forceActive" in rosterOf(reloaded, "c1", "s3"), false);
});

test("turning a manual flag off removes it from the saved enrollment", () => {
  const first = saveAndReload([cls("c1", [{ id: "s1", name: "甲", forceTrial: true }])]);
  const second = applyClassList(first.students, [cls("c1", [{ id: "s1", name: "甲" }])], membershipOf([cls("c1", [{ id: "s1", name: "甲" }])]));
  const enrollment = Object.values(second.s1.enrollments)[0];
  assert.equal("forceTrial" in enrollment, false);
  assert.equal("forceActive" in enrollment, false);
});

test("saving an unchanged roster writes no 試聽 flags (no churn for existing students)", () => {
  const { students } = saveAndReload([cls("c1", [{ id: "s1", name: "甲" }])]);
  const enrollment = Object.values(students.s1.enrollments)[0];
  assert.equal("forceTrial" in enrollment || "forceActive" in enrollment, false);
});
