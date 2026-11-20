// sudarshan scan — one command, start to finish, against a live app we own:
// discover candidates -> replay matrix -> prove with controls + reproduction ->
// fix from template -> re-attack identically -> save exploit as a test ->
// write <dir>/sudarshan.result.json in the shared Results shape. No LLM.

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { startServer, stopServer } from "./serverctl";
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

export async function scan(dir: string): Promise<ScanResult> {
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
  writeFileSync(join(dir, "sudarshan.result.json"), JSON.stringify(result, null, 2));
  printReport(dir, result);
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

export async function scanAll(appsDir: string): Promise<void> {
  const subs = readdirSync(appsDir, { withFileTypes: true }).filter(
    (d) => d.isDirectory() || d.isSymbolicLink(),
  );
  const results: ScanResult[] = [];
  for (const s of subs) {
    const dir = join(appsDir, s.name);
    if (!existsSync(join(dir, "sudarshan.json"))) continue;
    results.push(await scan(dir));
  }
  mkdirSync("eval/results", { recursive: true });
  const combined = {
    toolName: "sudarshan",
    apps: results.length,
    totalFindings: results.reduce((n, r) => n + r.findings.length, 0),
    falsePositives: results.reduce((n, r) => n + r.falsePositives, 0),
    results,
  };
  writeFileSync("eval/results/sudarshan-all.json", JSON.stringify(combined, null, 2));
  console.log(`\nwrote eval/results/sudarshan-all.json  (${results.length} app(s), ${combined.totalFindings} finding(s))`);
}
