// The fix engine. Prove a leak on the vulnerable app, apply a template fix,
// restart the patched app, re-run the IDENTICAL attack, and decide whether the
// fix truly blocked it WITHOUT breaking the legitimate user. No LLM in the path.

import { spawn, type ChildProcess } from "node:child_process";
import {
  loadConfig, loginAll, harvestIds, runCandidate,
  type Config, type Session, type CandidateResult,
} from "./attack";
import { applyFix, OWNERSHIP_CHECK } from "./fix";
import { maskMarker } from "../shared/finding";

const BASE = "http://127.0.0.1:4700";
const VULN = "victim/server.ts";
const FIXED = "victim/.server.fixed.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function portUp(): Promise<boolean> {
  try {
    await fetch(BASE + "/");
    return true;
  } catch {
    return false;
  }
}

// Kill the whole detached process group: tsx spawns a child node process, so
// killing only the tsx wrapper would leave the real server holding the port.
function killTree(p: ChildProcess) {
  try {
    if (p.pid) process.kill(-p.pid, "SIGKILL");
  } catch {
    try {
      p.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

async function startServer(file: string): Promise<ChildProcess> {
  const tsx = process.cwd() + "/node_modules/.bin/tsx";
  const proc = spawn(tsx, [file], { stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    if (await portUp()) return proc;
    await sleep(200);
  }
  killTree(proc);
  throw new Error(`server did not start: ${file}`);
}

async function stopServer(p: ChildProcess) {
  killTree(p);
  for (let i = 0; i < 50; i++) {
    if (!(await portUp())) return; // wait until the port is actually free
    await sleep(200);
  }
}

interface Target {
  victim: Session;
  attacker: Session;
  id: string;
}

async function findFirstProven(
  cfg: Config,
  sessions: Session[],
): Promise<{ t: Target; before: CandidateResult } | null> {
  for (const victim of sessions) {
    const ids = await harvestIds(cfg, victim);
    for (const attacker of sessions) {
      if (attacker.userId === victim.userId) continue;
      for (const id of ids) {
        const c = await runCandidate(cfg, victim, attacker, id);
        if (c.verdict.proven) return { t: { victim, attacker, id }, before: c };
      }
    }
  }
  return null;
}

function sensitive(fields: string[]): string[] {
  return fields.filter((f) => f !== "id" && f !== "owner_id");
}

async function main() {
  const cfg = loadConfig(process.argv[2] ?? "victim/sudarshan.json");

  // BEFORE — prove the leak on the vulnerable app.
  let proc = await startServer(VULN);
  const sessions = await loginAll(cfg);
  const found = await findFirstProven(cfg, sessions);
  await stopServer(proc);
  if (!found) {
    console.log("No proven finding to reprove.");
    return;
  }
  const { t, before } = found;

  // FIX — deterministic template application.
  const fix = applyFix(VULN, OWNERSHIP_CHECK, FIXED);
  if (!fix.applied) {
    console.log(`Fix template '${OWNERSHIP_CHECK.id}' did not match source; aborting.`);
    return;
  }

  // AFTER — restart the patched app and re-run the identical attack.
  proc = await startServer(FIXED);
  const fixedSessions = await loginAll(cfg);
  const victim = fixedSessions.find((s) => s.label === t.victim.label)!;
  const attacker = fixedSessions.find((s) => s.label === t.attacker.label)!;
  const after = await runCandidate(cfg, victim, attacker, t.id);
  await stopServer(proc);

  const blockedExploit = [401, 403, 404].includes(after.attack1.status);
  const brokeApp = after.controlOwn.status !== 200;
  const reattackResult: "blocked" | "still-vulnerable" = blockedExploit ? "blocked" : "still-vulnerable";
  const fixOutcome = blockedExploit && !brokeApp ? "VALID" : brokeApp ? "BROKE-APP" : "STILL-VULNERABLE";

  printBeforeAfter(cfg, t, before, after, reattackResult, fixOutcome, fix.template);
}

function printBeforeAfter(
  cfg: Config,
  t: Target,
  before: CandidateResult,
  after: CandidateResult,
  reattackResult: string,
  fixOutcome: string,
  template: string,
) {
  const markerMasked = before.marker ? maskMarker(before.marker) : "none";
  const resource = cfg.resourceTemplate.replace("{id}", t.id);
  console.log(`\n───────────── BOLA · template: ${template} ─────────────`);
  console.log(`target: ${cfg.baseUrl}`);
  console.log(`\nBEFORE  (vulnerable)`);
  console.log(`  user ${t.attacker.label} → GET ${resource}  (as ${t.attacker.label}, not the owner)`);
  console.log(`  status ${before.attack1.status}   reproduced=${before.attack2.status === before.attack1.status}`);
  console.log(`  leaked fields: ${before.leakedFields.join(", ")}`);
  console.log(`  → Another patient's ${sensitive(before.leakedFields).join(", ")} were readable (values withheld).`);
  console.log(`  proof marker (masked): ${markerMasked}`);
  console.log(`\nAFTER   (template fix applied, app restarted)`);
  console.log(`  identical request → status ${after.attack1.status}   (reattackResult: ${reattackResult})`);
  console.log(`  own-control (${t.attacker.label} reads own list) → status ${after.controlOwn.status}`);
  let verdict: string;
  if (fixOutcome === "VALID") verdict = "FIX VALID — exploit blocked, legitimate access intact.";
  else if (fixOutcome === "BROKE-APP") verdict = "FIX FAILED — exploit blocked BUT the legitimate user is now broken.";
  else verdict = "FIX FAILED — still vulnerable.";
  console.log(`  VERDICT: ${verdict}`);
  console.log(`─────────────────────────────────────────────────────────\n`);
}

main().catch((e) => {
  console.error("reprove error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
