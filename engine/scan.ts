// sudarshan scan — one command, start to finish, against a live app we own:
// discover candidates -> replay matrix -> prove with controls + reproduction ->
// fix from template -> re-attack identically -> save exploit as a test ->
// write <dir>/sudarshan.result.json in the shared Results shape. No LLM.

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { startServer, stopServer } from "./serverctl";
import { scanByDiscovery } from "./discover";
import {
  loadConfig, loginAll, harvestIds, runCandidate, resourceUrl,
  type Session, type CandidateResult,
} from "./attack";
import { redactRequest } from "./probe";
import { applyFix, OWNERSHIP_CHECK } from "./fix";
import { writeExploitTest } from "./to-test";
import { maskMarker, type Finding, type Remediation } from "../shared/finding";
import type { ScanResult } from "../shared/result";

interface Proven {
  victim: Session;
  attacker: Session;
  id: string;
  cand: CandidateResult;
}

function keyOf(p: Proven): string {
  return `${p.victim.label}->${p.attacker.label}:${p.id}`;
}

function sensitive(fields: string[]): string[] {
  return fields.filter((f) => f !== "id" && f !== "owner_id");
}

export async function scan(dir: string, write = true): Promise<ScanResult> {
  const t0 = Date.now();
  const cfg = loadConfig(join(dir, "sudarshan.json"));
  const managed = !!(cfg.app && cfg.app.startFile);

  // Phase A — discover + prove against the live app.
  let proc: ChildProcess | null = null;
  const proven: Proven[] = [];
  if (managed) proc = await startServer(cfg.baseUrl, join(dir, cfg.app!.startFile!));
  try {
    const sessions = await loginAll(cfg);
    for (const victim of sessions) {
      const ids = await harvestIds(cfg, victim);
      for (const attacker of sessions) {
        if (attacker.userId === victim.userId) continue;
        for (const id of ids) {
          const cand = await runCandidate(cfg, victim, attacker, id);
          if (cand.verdict.proven) proven.push({ victim, attacker, id, cand });
        }
      }
    }
  } finally {
    if (proc) {
      await stopServer(cfg.baseUrl, proc);
      proc = null;
    }
  }

  // Phase B — fix from template, restart, re-attack identically.
  const remByKey = new Map<string, Remediation>();
  if (managed && proven.length > 0 && cfg.app!.fixFile && cfg.app!.fixedBuild) {
    const fix = applyFix(join(dir, cfg.app!.fixFile), OWNERSHIP_CHECK, join(dir, cfg.app!.fixedBuild));
    if (fix.applied) {
      proc = await startServer(cfg.baseUrl, join(dir, cfg.app!.fixedBuild));
      try {
        const fixed = await loginAll(cfg);
        for (const p of proven) {
          const v = fixed.find((s) => s.label === p.victim.label)!;
          const a = fixed.find((s) => s.label === p.attacker.label)!;
          const after = await runCandidate(cfg, v, a, p.id);
          const blocked = [401, 403, 404].includes(after.attack1.status);
          const brokeApp = after.controlOwn.status !== 200;
          remByKey.set(keyOf(p), {
            template: fix.template,
            reattackResult: blocked ? "blocked" : "still-vulnerable",
            fixOutcome: blocked && !brokeApp ? "VALID" : brokeApp ? "BROKE-APP" : "STILL-VULNERABLE",
            reattackStatus: after.attack1.status,
            ownControlStatus: after.controlOwn.status,
          });
        }
      } finally {
        if (proc) {
          await stopServer(cfg.baseUrl, proc);
          proc = null;
        }
      }
      // Save the exploit as a standalone regression test (first proven finding).
      const first = proven[0];
      const atk = cfg.users.find((u) => u.label === first.attacker.label)!;
      const testFile = writeExploitTest(dir, cfg, { username: atk.username, password: atk.password }, first.id);
      const rem = remByKey.get(keyOf(first));
      if (rem) rem.testFile = testFile;
    }
  }

  const findings: Finding[] = proven.map((p) => ({
    attackClass: "BOLA",
    target: cfg.baseUrl,
    victim: p.victim.label,
    attacker: p.attacker.label,
    resource: cfg.resourceTemplate.replace("{id}", p.id),
    leakedFields: p.cand.leakedFields,
    markerMasked: p.cand.marker ? maskMarker(p.cand.marker) : "none",
    reproduced: true,
    evidence: {
      attackRequest: redactRequest("GET", resourceUrl(cfg, p.id), p.attacker.token),
      provingStatus: p.cand.attack1.status,
      controlOwnStatus: p.cand.controlOwn.status,
      controlNoAuthStatus: p.cand.controlNoAuth.status,
      controlForgedStatus: p.cand.controlForged.status,
    },
    remediation: remByKey.get(keyOf(p)),
  }));

  const result: ScanResult = {
    toolName: "sudarshan",
    target: cfg.baseUrl,
    findings,
    falsePositives: 0,
    totalDurationMs: Date.now() - t0,
  };
  if (write) {
    writeFileSync(join(dir, "sudarshan.result.json"), JSON.stringify(result, null, 2));
    printReport(dir, result);
  }
  return result;
}

function printReport(dir: string, r: ScanResult) {
  const secs = (r.totalDurationMs / 1000).toFixed(2);
  console.log(`\n================ SUDARSHAN · ${dir} ================`);
  console.log(`target: ${r.target}`);
  console.log(`${r.findings.length} BOLA finding(s) proven · false positives: ${r.falsePositives} · ${secs}s`);
  console.log(`----------------------------------------------------------`);
  for (const f of r.findings) {
    console.log(`[BOLA] ${f.attacker} read ${f.victim}'s ${f.resource}`);
    console.log(`   leaked fields: ${sensitive(f.leakedFields).join(", ")}`);
    console.log(`   proof marker (masked): ${f.markerMasked}`);
    const rem = f.remediation;
    if (rem) {
      const verdict =
        rem.fixOutcome === "VALID" ? `FIX VALID — blocked (${rem.reattackStatus}), legit access intact`
          : rem.fixOutcome === "BROKE-APP" ? `FIX FAILED — blocked but legit user broke (own ${rem.ownControlStatus})`
            : `FIX FAILED — still vulnerable (${rem.reattackStatus})`;
      console.log(`   fix (${rem.template}): ${verdict}`);
    } else {
      console.log(`   fix: no template applied`);
    }
  }
  if (r.findings.length === 0) console.log("No BOLA leak proven.");
  console.log(`==========================================================\n`);
}

interface AppOutcome {
  app: string;
  result?: ScanResult;
  unscannable?: { status: "generated-but-unscannable"; reason: string };
}

export async function scanAll(appsDir: string): Promise<void> {
  const names = readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() || d.isSymbolicLink())
    .map((d) => d.name)
    .sort();

  const outcomes: AppOutcome[] = [];
  for (const name of names) {
    const dir = join(appsDir, name);
    const cfgPath = join(dir, "sudarshan.json");
    if (!existsSync(cfgPath)) continue;
    try {
      // Apps that declare the full contract (baseUrl) run config-driven;
      // credential-only apps go through endpoint discovery.
      const raw = JSON.parse(readFileSync(cfgPath, "utf8"));
      const result = raw.baseUrl ? await scan(dir, false) : await scanByDiscovery(dir);
      outcomes.push({ app: name, result });
    } catch (e) {
      outcomes.push({
        app: name,
        unscannable: { status: "generated-but-unscannable", reason: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  const scanned = outcomes.filter((o): o is AppOutcome & { result: ScanResult } => !!o.result);
  const leaked = scanned.filter((o) => o.result.findings.length > 0);
  const clean = scanned.filter((o) => o.result.findings.length === 0);
  const unscannable = outcomes.filter((o) => o.unscannable);
  const totalRecords = scanned.reduce((n, o) => n + o.result.findings.length, 0);
  const totalFP = scanned.reduce((n, o) => n + o.result.falsePositives, 0);
  const avgMs = scanned.length ? scanned.reduce((n, o) => n + o.result.totalDurationMs, 0) / scanned.length : 0;

  const combined = {
    toolName: "sudarshan",
    appsDir,
    total: outcomes.length,
    scanned: scanned.length,
    leaked: leaked.length,
    clean: clean.length,
    unscannable: unscannable.length,
    totalRecordsExposed: totalRecords,
    falsePositives: totalFP,
    avgSecondsPerApp: Number((avgMs / 1000).toFixed(3)),
    results: scanned.map((o) => ({ app: o.app, ...o.result })),
    unscannableApps: unscannable.map((o) => ({ app: o.app, ...o.unscannable! })),
  };

  mkdirSync("eval/results", { recursive: true });
  writeFileSync("eval/results/sudarshan-all.json", JSON.stringify(combined, null, 2));

  console.log(`\n================ SUDARSHAN · scan-all ${appsDir} ================`);
  console.log(`apps found:        ${combined.total}`);
  console.log(`scanned:           ${combined.scanned}  (leaked ${combined.leaked}, clean ${combined.clean})`);
  console.log(`unscannable:       ${combined.unscannable}`);
  console.log(`records exposed:   ${combined.totalRecordsExposed}`);
  console.log(`false positives:   ${combined.falsePositives}`);
  console.log(`avg seconds/app:   ${combined.avgSecondsPerApp}`);
  if (leaked.length) {
    console.log(`--- leaked apps ---`);
    for (const o of leaked) console.log(`  ${o.app}: ${o.result.findings.length} finding(s)`);
  }
  if (unscannable.length) {
    console.log(`--- unscannable ---`);
    for (const o of unscannable) console.log(`  ${o.app}: ${o.unscannable!.reason}`);
  }
  console.log(`\nwrote eval/results/sudarshan-all.json`);
}
