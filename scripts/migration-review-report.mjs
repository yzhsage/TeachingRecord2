import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function cell(value) { return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ").trim() || "—"; }

export function buildReviewMarkdown(conflicts) {
  const lines = [
    "# 學生身分人工確認清單",
    "",
    "> 這份清單只讀取遷移預覽結果。未完成確認前，不可將學生優先匯入檔寫入任何 Firebase。",
    "",
    `產生時間：${conflicts.generatedAt}`,
    `重複使用的學生 ID：${conflicts.totals.reusedIds} 個；同名但不同 ID：${conflicts.totals.sameNameDifferentIds} 組。`,
    "",
    "## A. 同一 ID 對應多個姓名：必須優先處理",
    "",
    "下表表示同一個舊 ID 在不同班級出現不同姓名。這通常代表舊系統匯入時使用了不具全域唯一性的 ID，不能直接視為同一學生。請為每一列決定保留哪一個新學生 ID，或建立新的穩定 ID。",
    "",
    "| 舊學生 ID | 備份中的姓名 | 學校 | 年級 | 分組 | 班級 | 新身分判定 | 新學生 ID | 備註 |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const item of conflicts.reusedIds) {
    for (const occurrence of item.occurrences) {
      lines.push(`| ${cell(item.id)} | ${cell(occurrence.name)} | ${cell(occurrence.school)} | ${cell(occurrence.grade)} | ${cell(occurrence.group)} | ${cell(occurrence.className)} | 待確認 | 待填 |  |`);
    }
  }
  lines.push("", "## B. 同名但不同 ID：確認是否為同一人", "", "下表只表示姓名相同，不代表應合併。請依學校、年級、班級與日期判斷；無法確認時，保持不同學生 ID。", "", "| 姓名 | 涉及舊 ID | 學校／年級／班級摘要 | 是否同一人 | 合併後學生 ID | 備註 |", "|---|---|---|---|---|---|");
  for (const item of conflicts.sameNameDifferentIds) {
    const ids = [...new Set(item.ids)].join("、");
    const summary = item.occurrences.map((occurrence) => `${occurrence.id}：${occurrence.school || "未填學校"}／${occurrence.grade || "未填年級"}／${occurrence.className || "未填班級"}`).join("；");
    lines.push(`| ${cell(item.occurrences[0]?.name)} | ${cell(ids)} | ${cell(summary)} | 待確認 | 待填 |  |`);
  }
  lines.push("", "## 確認規則", "", "第一，不能只依姓名合併。第二，同一舊 ID 若對應多個不同姓名，必須先拆分或建立 ID 對照；在此之前不可匯入。第三，同名但學校、年級或班級不同者，預設保留不同學生。第四，人工確認表完成後，才可進行測試 Firebase 的匯入預演。", "");
  return lines.join("\n");
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || path.join(process.cwd(), "identity-review.md");
  if (!inputPath) throw new Error("用法：node scripts/migration-review-report.mjs <migration-conflicts.json> [輸出.md]");
  const conflicts = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  fs.writeFileSync(outputPath, `${buildReviewMarkdown(conflicts)}\n`);
  console.log(`已產生人工確認清單：${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`人工確認清單產生失敗：${error.message}`); process.exit(1); }
}
