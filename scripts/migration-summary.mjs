import fs from "node:fs";
const file = process.argv[2];
const out = process.argv[3];
const x = JSON.parse(fs.readFileSync(file, "utf8"));
const lines = ["# 遷移摘要", "", `重複使用 ID：${x.totals.reusedIds} 個`, `同名多 ID：${x.totals.sameNameDifferentIds} 組`, "", "## 重複使用 ID 與不同姓名", "", "| 舊 ID | 姓名集合 |", "|---|---|"];
for (const item of x.reusedIds) {
  const names = [...new Set(item.occurrences.map((v) => v.name).filter(Boolean))];
  lines.push(`| ${item.id} | ${names.join("、")} |`);
}
lines.push("", "## 同名多 ID", "", "| 姓名 | 舊 ID |", "|---|---|");
for (const item of x.sameNameDifferentIds) lines.push(`| ${item.occurrences[0]?.name || item.normalizedName} | ${item.ids.join("、")} |`);
fs.writeFileSync(out, `${lines.join("\n")}\n`);
console.log(out);
