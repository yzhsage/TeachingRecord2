import test from "node:test";
import assert from "node:assert/strict";
import { createClassInstanceId, createEnrollmentId, createLineageId, createStudentId, isGeneratedId } from "../src/identity.js";

test("自動 ID 具有不可混淆的類型前綴", () => {
  const studentId = createStudentId();
  const lineageId = createLineageId();
  const classId = createClassInstanceId();
  const enrollmentId = createEnrollmentId();
  assert.equal(isGeneratedId(studentId, "student"), true);
  assert.equal(isGeneratedId(lineageId, "lineage"), true);
  assert.equal(isGeneratedId(classId, "classInstance"), true);
  assert.equal(isGeneratedId(enrollmentId, "enrollment"), true);
  assert.notEqual(studentId, lineageId);
  assert.notEqual(classId, enrollmentId);
});

test("每次建立新的學生 ID 都不重複", () => {
  const ids = new Set(Array.from({ length: 100 }, () => createStudentId()));
  assert.equal(ids.size, 100);
});
