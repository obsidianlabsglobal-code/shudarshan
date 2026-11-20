import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const Z = 1.959963984540054;
const resultsDir = join(import.meta.dirname, "results");

export function wilson(successes: number, trials: number) {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) ||
      trials <= 0 || successes < 0 || successes > trials) {
    throw new Error(`Invalid rate: ${successes}/${trials}`);
  }
  const proportion = successes / trials;
  const z2 = Z * Z;
  const divisor = 1 + z2 / trials;
  const center = (proportion + z2 / (2 * trials)) / divisor;
  const margin = Z * Math.sqrt(proportion * (1 - proportion) / trials + z2 / (4 * trials * trials)) / divisor;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function measured(label: string, numerator: number, denominator: number) {
  return { label, numerator, denominator, rate: numerator / denominator,
    confidenceInterval95: wilson(numerator, denominator) };
}

function unavailable(label: string, reason: string) {
  return { label, status: "unavailable", reason, numerator: null, denominator: null,
    rate: null, confidenceInterval95: null };
}

async function readOptional(name: string): Promise<any | null> {
  try { return JSON.parse(await readFile(join(resultsDir, name), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function calculateStats() {
  const [scan, classified, regression] = await Promise.all([
    readOptional("sudarshan-all.json"),
    readOptional("llmreview-classified.json"),
    readOptional("regression.json"),
  ]);
  const fullScan = scan && scan.total === 23 && scan.scanned === 23 &&
    scan.unscannable === 0 && Array.isArray(scan.results) && scan.results.length === 23;
  if (fullScan && scan.leaked + scan.clean !== 23) throw new Error("Inconsistent Sudarshan app counts");
  const appsLeaked = fullScan
    ? measured("Apps leaked", scan.leaked, 23)
    : unavailable("Apps leaked", "A complete 23-app scan is required");
  const sudarshanFalsePositives = fullScan
    ? measured("Sudarshan false-positive apps", scan.falsePositives, 23)
    : unavailable("Sudarshan false-positive apps", "A complete 23-app scan is required");

  const flags = classified?.flags;
  const testedAuthorizationFlags = Array.isArray(flags) ? flags.filter((flag: any) =>
    flag.category === "authorization / access control" &&
    flag.assessment === "not confirmed when tested") : [];
  const llmFalsePositives = testedAuthorizationFlags.length > 0
    ? unavailable("LLM false-positive claims", "Not confirmed is not proof of a false positive")
    : unavailable("LLM false-positive claims", "No LLM authorization claims were tested");

  const completeRegression = regression && Number.isInteger(regression.total) &&
    regression.total > 0 && Number.isInteger(regression.ownershipLost) &&
    Number.isInteger(regression.ownershipKept) && Number.isInteger(regression.unscannable) &&
    regression.ownershipLost + regression.ownershipKept + regression.unscannable === regression.total &&
    regression.unscannable === 0;
  const regressionOwnershipLoss = completeRegression
    ? measured("Regression ownership loss", regression.ownershipLost, regression.total)
    : unavailable("Regression ownership loss", "A fully scanned regression run is required");

  return {
    method: "Two-sided 95% Wilson score interval, z=1.959963984540054. Rates use apps or regression runs as the stated denominator. A zero numerator does not imply a zero upper bound.",
    appsLeaked,
    falsePositives: {
      sudarshan: sudarshanFalsePositives,
      llmReview: llmFalsePositives,
      gitleaks: unavailable("Gitleaks false-positive claims", "Gitleaks reported zero claims, so claim-level rate has no denominator"),
    },
    regressionOwnershipLoss,
  };
}

if (process.argv.includes("--run")) {
  const stats = await calculateStats();
  await writeFile(join(resultsDir, "stats.json"), JSON.stringify(stats, null, 2) + "\n");
  for (const row of [stats.appsLeaked, stats.falsePositives.sudarshan, stats.regressionOwnershipLoss]) {
    console.log(`${row.label}: ${row.numerator ?? "n/a"}/${row.denominator ?? "n/a"}; 95% Wilson ${row.confidenceInterval95 ? `[${row.confidenceInterval95.lower.toFixed(4)}, ${row.confidenceInterval95.upper.toFixed(4)}]` : "n/a"}`);
  }
  console.log(`LLM false-positive rate: n/a (${stats.falsePositives.llmReview.reason})`);
}
