/**
 * Publishes a model-run report to the GitHub job summary and compares it with the committed
 * baseline (evals/baseline.json: { "<file> > <case>": "pass" | "fail" }).
 *
 *   node scripts/ci-report.mjs <label> <vitest-json>          # print + append to $GITHUB_STEP_SUMMARY
 *   node scripts/ci-report.mjs <label> <vitest-json> --write-baseline   # merge this run INTO baseline.json
 *
 * Report-only: always exits 0. The caller decides whether failures block (EVAL_BLOCKING).
 * Pure filesystem + string work — no deps.
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(EVALS_DIR, "baseline.json");
const [label = "evals", jsonPath, ...flags] = process.argv.slice(2);

if (!jsonPath || !existsSync(jsonPath)) {
  const msg = `### ${label}\n_no vitest report found (${jsonPath ?? "no path"}) — the run did not reach the test phase._\n`;
  console.log(msg);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + "\n");
  process.exit(0);
}

const report = JSON.parse(readFileSync(jsonPath, "utf8"));
const current = {};
for (const file of report.testResults ?? []) {
  const rel = String(file.name).split("/evals/").pop();
  for (const t of file.assertionResults ?? []) {
    if (t.status === "pending" || t.status === "skipped") continue;
    current[`${rel} > ${t.fullName}`] = t.status === "passed" ? "pass" : "fail";
  }
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;

if (flags.includes("--write-baseline")) {
  writeFileSync(BASELINE, JSON.stringify({ ...(baseline ?? {}), ...current }, null, 2) + "\n");
  console.log(`baseline updated: ${Object.keys(current).length} cases merged into ${BASELINE}`);
  process.exit(0);
}

const icon = { pass: "✅", fail: "❌" };
const rows = Object.entries(current).sort(([a], [b]) => a.localeCompare(b)).map(([id, now]) => {
  const was = baseline ? (baseline[id] ?? "new") : "—";
  let change = "";
  if (baseline) {
    if (was === "new") change = "🆕 new";
    else if (was === now) change = "same";
    else change = now === "pass" ? "⬆️ improved" : "⬇️ **regression**";
  }
  return { id, now, was, change };
});

const passed = rows.filter((r) => r.now === "pass").length;
const regressions = rows.filter((r) => r.change.includes("regression")).length;
const lines = [
  `### ${label}`,
  `model \`${process.env.EVAL_MODEL ?? "?"}\` · judge \`${process.env.EVAL_JUDGE_MODEL ?? "?"}\` · **${passed}/${rows.length} passed**` +
    (baseline ? ` · ${regressions} regression(s) vs baseline` : " · no baseline yet (evals/baseline.json)"),
  "",
  "| case | now | baseline | change |",
  "|---|---|---|---|",
  ...rows.map((r) => `| ${r.id.split(" > ").slice(1).join(" > ").replace(/\|/g, "\\|")} | ${icon[r.now]} | ${r.was === "—" ? "—" : (icon[r.was] ?? r.was)} | ${r.change} |`),
  "",
];
const out = lines.join("\n");
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + "\n");
if (regressions > 0) console.log(`::warning title=${label}::${regressions} regression(s) vs baseline`);
process.exit(0);
