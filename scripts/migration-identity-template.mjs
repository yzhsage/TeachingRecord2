import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function text(value) { return String(value ?? "").trim(); }
function uuid(prefix) { return `${prefix}${crypto.randomUUID()}`; }
function stageForGrade(grade) {
  const value = text(grade);
  if (/國/.test(value)) return "junior_high";
  if (/高職|高一|高二|高三/.test(value)) return "senior_high";
  return "unknown";
}
function occurrenceKey(classId, rosterIndex, legacyStudentId) {
  return `class:${classId}:roster:${rosterIndex}:legacy:${text(legacyStudentId) || "empty"}`;
}

export function buildIdentityTemplate(bundle) {
  const classes = Array.isArray(bundle?.classIndex) ? bundle.classIndex.filter((item) => item?.id) : [];
  const classInstances = classes.map((cls) => ({
    legacyClassId: text(cls.id),
    suggestedClassId: uuid("cls_"),
    name: text(cls.name),
    subject: text(cls.subject),
    grade: text(cls.grade),
    stage: stageForGrade(cls.grade),
    school: "",
    academicYear: "",
    term: "",
    suggestedLineageId: "",
    continuationStatus: "uncertain",
    humanNote: "",
  }));
  const occurrences = [];
  for (const cls of classes) {
    const roster = Array.isArray(cls.students) ? cls.students : [];
    roster.forEach((student, rosterIndex) => {
      const grade = text(student?.grade || cls.grade);
      occurrences.push({
        occurrenceKey: occurrenceKey(cls.id, rosterIndex, student?.id),
        legacyClassId: text(cls.id),
        suggestedClassId: classInstances.find((item) => item.legacyClassId === cls.id)?.suggestedClassId || "",
        rosterIndex,
        legacyStudentId: text(student?.id),
        name: text(student?.name),
        school: text(student?.school),
        grade,
        stage: stageForGrade(grade),
        group: text(student?.group),
        suggestedStudentId: uuid("stu_"),
        confirmedStudentId: "",
        suggestedEnrollmentId: uuid("enr_"),
        confirmedEnrollmentId: "",
        confirmedDecision: "pending",
        lineageDecision: "pending",
        humanNote: "",
      });
    });
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: { schemaVersion: bundle?.schemaVersion ?? null, exportedAt: bundle?.exportedAt ?? null },
    safety: { readOnly: true, writesFirebase: false, mergesStudents: false, deletesData: false, canImport: false },
    instructions: [
      "每一列先確認是否與其他 occurrence 是同一位長期學生；確認後將相同的 confirmedStudentId 填到各列。",
      "suggestedStudentId 只是候選值，不代表系統已確認；可保留或改成新的 stu_ UUID。",
      "classId 與 lineageId 也要人工確認；國二／國三可共用 lineageId，高中班級預設另建 lineageId。",
      "所有 confirmedDecision、confirmedStudentId、confirmedEnrollmentId 與 lineageDecision 完成前，不可匯入 Firebase。",
    ],
    classInstances,
    occurrences,
  };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || path.join(process.cwd(), "identity-map.template.json");
  if (!inputPath) throw new Error("用法：node scripts/migration-identity-template.mjs <備份.json> [輸出.json]");
  const template = buildIdentityTemplate(JSON.parse(fs.readFileSync(inputPath, "utf8")));
  fs.writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`);
  console.log(`已產生身分對照模板：${outputPath}`);
  console.log(`班級實例 ${template.classInstances.length} 個；occurrence ${template.occurrences.length} 筆。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`身分對照模板產生失敗：${error.message}`); process.exit(1); }
}
