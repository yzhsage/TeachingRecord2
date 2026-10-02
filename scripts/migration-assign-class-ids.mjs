import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const classDefinitions = {
  import_guoer_shuxue_114: { name: "國中數學", grade: "國二", academicYear: "114級", stage: "junior_high", subject: "數學" },
  import_guoer_ziran_114: { name: "國中自然", grade: "國二", academicYear: "114級", stage: "junior_high", subject: "自然" },
  import_guosan_ziran_113: { name: "國中自然", grade: "國三", academicYear: "113級", stage: "junior_high", subject: "自然" },
  import_gaozhong_shuxue_114: { name: "高中數學", grade: "高二", academicYear: "114級", stage: "senior_high", subject: "數學" },
  demo_gaoyi_wuhua_115: { name: "高中物化", grade: "高一", academicYear: "115級", stage: "senior_high", subject: "物理化學" },
};

function newId(prefix) { return `${prefix}${crypto.randomUUID()}`; }
function text(value) { return String(value ?? "").trim(); }
function rewriteClassId(value, classIdMap) { return classIdMap[text(value)] || value; }

export function assignClassIds(input) {
  const classIdMap = Object.fromEntries(Object.keys(classDefinitions).map((legacyId) => [legacyId, newId("cls_")]));
  const classIdMapReverse = Object.fromEntries(Object.entries(classIdMap).map(([oldId, newId]) => [newId, oldId]));
  const classes = {};

  for (const [legacyId, cls] of Object.entries(input.classes || {})) {
    const definition = classDefinitions[legacyId] || {};
    const assignedId = classIdMap[legacyId] || newId("cls_");
    if (!classIdMap[legacyId]) classIdMap[legacyId] = assignedId;
    classes[assignedId] = {
      ...cls,
      id: assignedId,
      legacyClassId: legacyId,
      name: definition.name || cls.name || "",
      displayName: `${definition.academicYear || ""} ${definition.grade || cls.grade || ""} ${definition.name || cls.name || ""}`.trim(),
      grade: definition.grade || cls.grade || "",
      academicYear: definition.academicYear || "",
      stage: definition.stage || "",
      subject: definition.subject || cls.subject || "",
      continuationStatus: "uncertain",
    };
  }

  const students = {};
  for (const [studentId, student] of Object.entries(input.students || {})) {
    const enrollments = {};
    for (const [enrollmentId, enrollment] of Object.entries(student.enrollments || {})) {
      const oldClassId = text(enrollment.classId);
      const definition = classDefinitions[oldClassId] || {};
      enrollments[enrollmentId] = {
        ...enrollment,
        classId: rewriteClassId(oldClassId, classIdMap),
        legacyClassId: oldClassId,
        className: definition.name || enrollment.className || "",
        grade: definition.grade || enrollment.grade || "",
        stage: definition.stage || enrollment.stage || "",
        academicYear: definition.academicYear || "",
      };
    }
    students[studentId] = { ...student, enrollments };
  }

  const rewriteRecords = (records) => records.map((record) => ({
    ...record,
    classId: rewriteClassId(record.classId, classIdMap),
    legacyClassId: record.legacyClassId || classIdMapReverse[rewriteClassId(record.classId, classIdMap)] || text(record.classId),
  }));

  const legacyMap = Object.fromEntries(Object.entries(input.legacyMap || {}).map(([key, item]) => {
    const oldClassId = text(item.classId);
    return [key, { ...item, classId: rewriteClassId(oldClassId, classIdMap), legacyClassId: oldClassId }];
  }));

  return {
    ...input,
    schemaVersion: 4,
    generatedAt: new Date().toISOString(),
    classIdentityPolicy: {
      idFormat: "cls_ + UUID v4",
      note: "班級 ID 與名稱、年級、級別分離；兩個同名國中自然班各自使用不同 cls_ ID。",
    },
    classIdMap,
    classIdMapReverse,
    classes,
    students,
    legacyMap,
    attendance: rewriteRecords(input.attendance || []),
    assessments: rewriteRecords(input.assessments || []),
    fees: rewriteRecords(input.fees || []),
    totals: { ...input.totals, classesWithNewIds: Object.keys(classes).length },
    safety: { ...input.safety, readOnly: true, writesFirebase: false, deletesData: false },
  };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || path.join(process.cwd(), "student-first-import-with-class-ids.json");
  if (!inputPath) throw new Error("用法：node scripts/migration-assign-class-ids.mjs <學生本位.json> [輸出.json]");
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const result = assignClassIds(input);
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`已產生新的班級 ID 遷移檔：${outputPath}`);
  for (const [oldId, newId] of Object.entries(result.classIdMap)) {
    const cls = result.classes[newId];
    console.log(`${cls.displayName}：${oldId} -> ${newId}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`班級 ID 重編失敗：${error.message}`); process.exit(1); }
}
