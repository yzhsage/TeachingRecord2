import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function text(value) { return String(value ?? "").trim(); }
function normalizeName(value) { return text(value).replace(/\s+/g, "").toLocaleLowerCase(); }
function add(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  const serialized = JSON.stringify(value);
  if (!map.get(key).some((item) => JSON.stringify(item) === serialized)) map.get(key).push(value);
}

export function analyzeConflicts(bundle) {
  const byId = new Map();
  const byName = new Map();
  const classes = Array.isArray(bundle?.classIndex) ? bundle.classIndex : [];
  for (const cls of classes) {
    for (const student of Array.isArray(cls.students) ? cls.students : []) {
      const id = text(student?.id);
      const name = text(student?.name);
      const occurrence = { id, name, school: text(student?.school), grade: text(student?.grade || cls.grade), group: text(student?.group), classId: text(cls.id), className: text(cls.name) };
      add(byId, id, occurrence);
      add(byName, normalizeName(name), occurrence);
    }
  }
  for (const [id, profile] of Object.entries(bundle?.studentIndex || {})) {
    const occurrence = { id, name: text(profile?.name), school: text(profile?.school), grade: text(profile?.grade), group: text(profile?.group), classId: "studentIndex", className: "studentIndex" };
    add(byId, id, occurrence);
    add(byName, normalizeName(profile?.name), occurrence);
    for (const [classId, enrollment] of Object.entries(profile?.enrollments || {})) {
      add(byId, id, { ...occurrence, classId, className: text(classes.find((item) => item.id === classId)?.name), school: text(enrollment?.school) || occurrence.school, grade: text(enrollment?.grade) || occurrence.grade, group: text(enrollment?.group) });
    }
  }
  const reusedIds = [...byId.entries()].filter(([, values]) => new Set(values.map((item) => normalizeName(item.name)).filter(Boolean)).size > 1).map(([id, occurrences]) => ({ id, occurrences }));
  const sameNameDifferentIds = [...byName.entries()].filter(([, values]) => new Set(values.map((item) => item.id).filter(Boolean)).size > 1).map(([normalizedName, occurrences]) => ({ normalizedName, occurrences, ids: [...new Set(occurrences.map((item) => item.id))] }));
  return { generatedAt: new Date().toISOString(), safety: { readOnly: true, writesFirebase: false, mergesStudents: false, deletesData: false }, totals: { reusedIds: reusedIds.length, sameNameDifferentIds: sameNameDifferentIds.length }, reusedIds, sameNameDifferentIds };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || path.join(process.cwd(), "migration-conflicts.json");
  if (!inputPath) throw new Error("用法：node scripts/migration-conflicts.mjs <備份.json> [輸出.json]");
  const result = analyzeConflicts(JSON.parse(fs.readFileSync(inputPath, "utf8")));
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`已產生衝突分析：${outputPath}`);
  console.log(`重複使用 ID ${result.totals.reusedIds} 個；同名多 ID ${result.totals.sameNameDifferentIds} 組。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`衝突分析失敗：${error.message}`); process.exit(1); }
}
