import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const GITLEAKS_PATH =
  "C:\\Users\\HP\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gitleaks.Gitleaks_Microsoft.Winget.Source_8wekyb3d8bbwe\\gitleaks.exe";

const runFile = promisify(execFile);
const gitleaksCommand = await access(GITLEAKS_PATH).then(() => GITLEAKS_PATH, () => "gitleaks");
const appRoot = join(import.meta.dirname, "apps");
const appIds = (await readdir(appRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^app-\d\d$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
if (appIds.length !== 23) throw new Error(`Expected 23 app folders, found ${appIds.length}`);

const results = [];
for (const id of appIds) {
  const started = performance.now();
  const { stdout } = await runFile(gitleaksCommand, [
    "dir", join(appRoot, id), "--report-format", "json", "--report-path", "-",
    "--exit-code", "0", "--log-level", "error", "--no-banner", "--redact",
  ], { maxBuffer: 8 * 1024 * 1024 });
  const durationMs = Math.round(performance.now() - started);
  const raw = stdout.trim();
  const parsed = raw ? JSON.parse(raw) as Array<Record<string, unknown>> : [];
  if (!Array.isArray(parsed)) throw new Error(`${id}: gitleaks report was not an array`);
  const findings = parsed.map((item) => ({
    type: "secret", endpoint: String(item.File ?? ""), severity: "high",
    ruleId: String(item.RuleID ?? ""), line: Number(item.StartLine ?? 0),
    verification: "unverified",
  }));
  results.push({ toolName: "gitleaks", target: `eval/apps/${id}`, findings,
    falsePositives: null, totalDurationMs: durationMs });
  console.log(`${id}: ${findings.length} findings, ${durationMs} ms`);
}

const output = { toolName: "gitleaks", apps: results.length,
  totalFindings: results.reduce((sum, item) => sum + item.findings.length, 0),
  totalDurationMs: results.reduce((sum, item) => sum + item.totalDurationMs, 0), results };
await writeFile(join(import.meta.dirname, "results", "gitleaks-all.json"),
  JSON.stringify(output, null, 2) + "\n", "utf8");
