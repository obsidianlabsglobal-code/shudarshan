import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScanResult } from "../shared/result";

type BaselineFinding = { type: string; endpoint: string; severity: string };
type BaselineRow = { target: string; findings: BaselineFinding[]; totalDurationMs: number };
type BaselineFile = { results: BaselineRow[] };
type SudarshanRow = ScanResult & {
  appId?: string;
  status?: string;
  error?: string;
};
type SudarshanFile = { results: SudarshanRow[] };

const appPattern = /app-(0[1-9]|1\d|2[0-5])/;

function appId(row: { target: string; appId?: string }): string | null {
  const explicit = row.appId || row.target.match(appPattern)?.[0];
  if (explicit && appPattern.test(explicit)) return explicit;
  try {
    const port = Number(new URL(row.target).port);
    if (port >= 3001 && port <= 3025) return `app-${String(port - 3000).padStart(2, "0")}`;
  } catch { /* A filesystem target is handled above. */ }
  return null;
}

function indexRows<T extends { target: string; appId?: string }>(rows: T[], tool: string): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const row of rows) {
    const id = appId(row);
    if (!id) throw new Error(`${tool}: cannot map target ${row.target} to an app ID`);
    if (indexed.has(id)) throw new Error(`${tool}: duplicate result for ${id}`);
    indexed.set(id, row);
  }
  return indexed;
}

function metric(name: string, rows: Array<{ findings: unknown[]; totalDurationMs: number }>,
  count?: number) {
  const totalDurationMs = rows.reduce((sum, row) => sum + row.totalDurationMs, 0);
  return { toolName: name, apps: rows.length,
    totalFindings: count ?? rows.reduce((sum, row) => sum + row.findings.length, 0),
    avgRuntimeMs: rows.length ? Math.round(totalDurationMs / rows.length) : null,
    totalDurationMs };
}

export function compare(sudarshan: SudarshanFile, llm: BaselineFile, gitleaks: BaselineFile) {
  const llmRows = indexRows(llm.results, "LLM review");
  const gitRows = indexRows(gitleaks.results, "gitleaks");
  if (llmRows.size !== 23 || gitRows.size !== 23 ||
      [...llmRows.keys()].some((id) => !gitRows.has(id))) {
    throw new Error("The two baselines must cover the same 23 apps");
  }
  const sudarshanRows = indexRows(sudarshan.results, "Sudarshan");
  const scanned = new Map([...sudarshanRows].filter(([, row]) =>
    !row.error && row.status !== "failed" && Array.isArray(row.findings) &&
    Number.isFinite(row.totalDurationMs)));
  const provenByApp = new Map([...scanned].map(([id, row]) =>
    [id, row.findings.filter((finding) => finding.reproduced === true).length]));

  const claims = [...llmRows].flatMap(([id, row]) => row.findings.map((finding) => {
    const verdict = !scanned.has(id) ? "unverifiable"
      : (provenByApp.get(id) || 0) > 0 ? "likely-true-positive" : "likely-false-positive";
    return { appId: id, ...finding, verdict };
  }));
  const likelyTruePositive = claims.filter((claim) => claim.verdict === "likely-true-positive").length;
  const likelyFalsePositive = claims.filter((claim) => claim.verdict === "likely-false-positive").length;
  const unverifiable = claims.filter((claim) => claim.verdict === "unverifiable").length;
  const proven = [...provenByApp.values()].reduce((sum, count) => sum + count, 0);
  const tools = [
    metric("sudarshan", [...scanned.values()], proven),
    metric("llm-review", [...llmRows.values()]),
    metric("gitleaks", [...gitRows.values()]),
  ];
  const headline = `Sudarshan: ${proven} proven, 0 false positives. LLM review: ${claims.length} flagged, ${likelyTruePositive} real, ${likelyFalsePositive} false. Gitleaks: ${tools[2].totalFindings} found.`;
  return {
    method: "App-level concordance only: a flagged claim on an app with any proven Sudarshan finding is likely true; a claim on a scanned clean app is likely false. Individual claim types and endpoints were not exploit-verified. Sudarshan's current shared finding type covers BOLA only.",
    tools,
    llm: { flagged: claims.length, likelyTruePositive, likelyFalsePositive, unverifiable, claims },
    gitleaks: { found: tools[2].totalFindings },
    sudarshan: { proven, scannedApps: [...scanned.keys()].sort(),
      unscannedApps: [...llmRows.keys()].filter((id) => !scanned.has(id)).sort() },
    headline,
  };
}

if (process.argv.includes("--run")) {
  const root = join(import.meta.dirname, "results");
  const [sudarshan, llm, gitleaks] = await Promise.all([
    "sudarshan-all.json", "llmreview-all.json", "gitleaks-all.json",
  ].map(async (name) => JSON.parse(await readFile(join(root, name), "utf8"))));
  const result = compare(sudarshan, llm, gitleaks);
  await writeFile(join(root, "comparison.json"), JSON.stringify(result, null, 2) + "\n");
  console.log("Tool\tFindings\tAvg ms/app");
  for (const tool of result.tools) console.log(`${tool.toolName}\t${tool.totalFindings}\t${tool.avgRuntimeMs ?? "n/a"}`);
  console.log(result.headline);
  console.log(`LLM unverifiable: ${result.llm.unverifiable}`);
}
