import assert from "node:assert/strict";
import test from "node:test";
import { buildPreview, markdownReport } from "./migration-preview.mjs";

test("migration preview is read-only and identifies duplicate names without merging", () => {
  const preview = buildPreview({
    schemaVersion: 2,
    classIndex: [
      {
        id: "math",
        name: "高中數學班",
        subject: "數學",
        grade: "高二",
        students: [
          { id: "wu-a", name: "王小明", school: "甲中", group: "數A", joinDate: "2026-02-01" },
          { id: "wu-b", name: "王小明", school: "乙高職", group: "", joinDate: "2026-03-01" },
        ],
      },
    ],
    studentIndex: {
      "wu-a": { id: "wu-a", name: "王小明", school: "甲中", group: "數A", enrollments: { math: { group: "數A" } } },
      "wu-b": { id: "wu-b", name: "王小明", school: "乙高職", enrollments: { math: { group: "" } } },
    },
    records: {
      math: {
        attendance: { "2026-05-01": { records: { "wu-a": "出席", orphan: "請假" } } },
        quiz: { columns: [{ id: "q1" }], scores: { q1: { "wu-a": { score: 90 } } } },
        exam: { columns: [], scores: {} },
        fee: { charges: [{ studentId: "wu-b", amount: 100 }] },
      },
    },
  });

  assert.equal(preview.safety.readOnly, true);
  assert.equal(preview.safety.writesFirebase, false);
  assert.equal(preview.safety.mergesStudents, false);
  assert.equal(preview.totals.classes, 1);
  assert.equal(preview.totals.uniqueStudentIds, 3);
  assert.equal(preview.totals.duplicateNameGroups, 1);
  assert.equal(preview.totals.attendanceCells, 2);
  assert.equal(preview.totals.quizCells, 1);
  assert.equal(preview.totals.feeCharges, 1);
  assert.equal(preview.recordOnlyStudents.some((student) => student.id === "orphan"), true);
  assert.equal(preview.duplicateNameCandidates[0].students.length, 2);
  assert.match(markdownReport(preview), /同名候選清單/);
});
