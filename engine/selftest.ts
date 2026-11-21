// Self-test: the three demo verdicts must hold. Exits non-zero on any mismatch.
//
// Runs the real CLI exactly as a user would (`tsx engine/cli.ts verify <app>`),
// checks both the printed verdict and the process exit code, and restores the
// committed dashboard artifact afterwards so a local run never dirties the tree.
//
//   npm run selftest      (also part of `npm test`, and of CI)

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ARTIFACT = "web/src/data/verify.json";

const CASES = [
  { app: "victim/app-51", exit: 1, verdict: "VULNERABLE", why: "AI rewrite moved the route and dropped the ownership check" },
  { app: "victim/app-50", exit: 0, verdict: "NO_LEAK_DETECTED", why: "ownership check intact" },
  { app: "victim/app-52", exit: 2, verdict: "INCONCLUSIVE", why: "resource renamed outside the discovery dictionary" },
] as const;

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const snapshot = existsSync(ARTIFACT) ? readFileSync(ARTIFACT) : null;
const started = Date.now();
let failures = 0;

console.log("\nSUDARSHAN · selftest — the three demo verdicts\n");

try {
  for (const c of CASES) {
    const r = spawnSync("npx", ["tsx", "engine/cli.ts", "verify", c.app], {
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 120_000,
    });
    const out = strip(`${r.stdout ?? ""}${r.stderr ?? ""}`);
    const sawVerdict = out.includes(`VERDICT: ${c.verdict}`);
    const ok = r.status === c.exit && sawVerdict;
    if (!ok) failures++;
    const mark = ok ? "✓" : "✗";
    console.log(`  ${mark} ${c.app.padEnd(14)} ${c.verdict.padEnd(17)} exit ${r.status ?? "?"} (expected ${c.exit})  — ${c.why}`);
    if (!ok) {
      console.log(`    printed verdict found: ${sawVerdict ? "yes" : "no"}`);
      console.log(out.split("\n").slice(-12).map((l) => `    | ${l}`).join("\n"));
    }
  }
} finally {
  if (snapshot) writeFileSync(ARTIFACT, snapshot);
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failures) {
  console.log(`\n  ${failures} of ${CASES.length} verdicts did not hold · ${secs}s\n`);
  process.exit(1);
}
console.log(`\n  all ${CASES.length} verdicts hold · ${secs}s · localhost · synthetic data\n`);
