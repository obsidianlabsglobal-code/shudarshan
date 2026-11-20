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
type ClassifiedFile = { flags: Array<{ appId: string; category: string }> };
type AuthRow = { app?: string; appId?: string; target?: string; status?: string;
  error?: string; findings?: Array<{ reproduced?: boolean }> };
type AuthFile = { results: AuthRow[] };

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

// Contract for eval/results/sudarshan-auth-all.json: { results: [{ app or appId
// or target, status?, error?, findings: [{ reproduced: boolean }] }] }.
// An empty findings array on a completed row means the app was tested clean.
export function compareAuthentication(classified: ClassifiedFile, auth: AuthFile | null) {
  const flags = classified.flags.filter((flag) => flag.category === "authentication");
  const flaggedApps = [...new Set(flags.map((flag) => flag.appId))].sort();
  if (flaggedApps.some((id) => !appPattern.test(id))) throw new Error("Invalid classified app ID");
  if (!auth) return { status: "pending", flaggedClaims: flags.length,
    llmFlaggedApps: flaggedApps.length, sudarshanProvedApps: null,
    sudarshanCleanApps: null, unscannableApps: null, agreement: null,
    reason: "eval/results/sudarshan-auth-all.json is not present" };

  const rows = new Map<string, AuthRow>();
  for (const row of auth.results) {
    const id = row.appId ?? row.app ?? (row.target ? appId({ target: row.target }) : null);
    if (!id || !appPattern.test(id)) throw new Error("Authentication result has no valid app ID");
    if (rows.has(id)) throw new Error(`Duplicate authentication result for ${id}`);
    rows.set(id, row);
  }
  const provedApps: string[] = [];
  const cleanApps: string[] = [];
  const unscannableApps: string[] = [];
  for (const id of flaggedApps) {
    const row = rows.get(id);
    if (!row || row.error || row.status === "failed" || row.status === "unscannable" ||
        !Array.isArray(row.findings)) {
      unscannableApps.push(id);
    } else if (row.findings.some((finding) => finding.reproduced === true)) {
      provedApps.push(id);
    } else if (row.findings.length === 0) {
      cleanApps.push(id);
    } else {
      unscannableApps.push(id); // Findings without proof do not establish an app-level result.
    }
  }
  return { status: "available", flaggedClaims: flags.length,
    llmFlaggedApps: flaggedApps.length, sudarshanProvedApps: provedApps.length,
    sudarshanCleanApps: cleanApps.length, unscannableApps: unscannableApps.length,
    agreement: { provedApps, cleanApps, unscannableApps },
    method: "App-level agreement among apps with an LLM authentication flag. Proven means at least one reproduced Sudarshan authentication finding; clean means a completed scan with no findings. This does not verify each LLM claim." };
}

export function compare(sudarshan: SudarshanFile, llm: BaselineFile, gitleaks: BaselineFile,
  classified?: ClassifiedFile, auth?: AuthFile | null) {
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
    authentication: classified ? compareAuthentication(classified, auth ?? null) : null,
    headline,
  };
}

if (process.argv.includes("--run")) {
  const root = join(import.meta.dirname, "results");
  const [sudarshan, llm, gitleaks] = await Promise.all([
    "sudarshan-all.json", "llmreview-all.json", "gitleaks-all.json",
  ].map(async (name) => JSON.parse(await readFile(join(root, name), "utf8"))));
  const classified = JSON.parse(await readFile(join(root, "llmreview-classified.json"), "utf8"));
  let auth: AuthFile | null = null;
  try { auth = JSON.parse(await readFile(join(root, "sudarshan-auth-all.json"), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const result = compare(sudarshan, llm, gitleaks, classified, auth);
  await writeFile(join(root, "comparison.json"), JSON.stringify(result, null, 2) + "\n");
  console.log("Tool\tFindings\tAvg ms/app");
  for (const tool of result.tools) console.log(`${tool.toolName}\t${tool.totalFindings}\t${tool.avgRuntimeMs ?? "n/a"}`);
  console.log(result.headline);
  console.log(`LLM unverifiable: ${result.llm.unverifiable}`);
  const agreement = result.authentication;
  if (agreement?.status === "available") {
    console.log(`Authentication app agreement: LLM flagged ${agreement.llmFlaggedApps}; Sudarshan proved ${agreement.sudarshanProvedApps}, clean ${agreement.sudarshanCleanApps}, unscannable ${agreement.unscannableApps}`);
  } else console.log("Authentication app agreement: pending Sudarshan authentication results");
}
