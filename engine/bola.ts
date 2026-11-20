// Orchestrate the two-user BOLA attack from a per-app config (sudarshan.json).
// Emits a Finding only when proven and reproduced, names the leaked fields,
// and prints a readable report. No LLM anywhere in this path.

import {
  loadConfig, loginAll, harvestIds, runCandidate, resourceUrl,
  type Config, type Session, type CandidateResult,
} from "./attack";
import { redactRequest } from "./probe";
import { maskMarker, type Finding } from "../shared/finding";

interface Row {
  victim: Session;
  attacker: Session;
  id: string;
  cand: CandidateResult;
}

async function main() {
  const cfg = loadConfig(process.argv[2] ?? "victim/sudarshan.json");
  const sessions = await loginAll(cfg);

  const rows: Row[] = [];
  for (const victim of sessions) {
    const ids = await harvestIds(cfg, victim);
    for (const attacker of sessions) {
      if (attacker.userId === victim.userId) continue;
      for (const id of ids) {
        rows.push({ victim, attacker, id, cand: await runCandidate(cfg, victim, attacker, id) });
      }
    }
  }
  report(cfg, rows);
}

// Fields worth calling out to a judge — the structural keys are dropped.
function sensitive(fields: string[]): string[] {
  return fields.filter((f) => f !== "id" && f !== "owner_id");
}

function report(cfg: Config, rows: Row[]) {
  const proven = rows.filter((r) => r.cand.verdict.proven);
  const findings: Finding[] = proven.map((r) => ({
    attackClass: "BOLA",
    target: cfg.baseUrl,
    victim: r.victim.label,
    attacker: r.attacker.label,
    resource: cfg.resourceTemplate.replace("{id}", r.id),
    leakedFields: r.cand.leakedFields,
    markerMasked: r.cand.marker ? maskMarker(r.cand.marker) : "none",
    reproduced: true,
    evidence: {
      attackRequest: redactRequest("GET", resourceUrl(cfg, r.id), r.attacker.token),
      provingStatus: r.cand.attack1.status,
      controlOwnStatus: r.cand.controlOwn.status,
      controlNoAuthStatus: r.cand.controlNoAuth.status,
      controlForgedStatus: r.cand.controlForged.status,
    },
  }));

  console.log("\n==================== BOLA ENGINE REPORT ====================");
  console.log(`target:   ${cfg.baseUrl}`);
  console.log(`attempts: ${rows.length}   proven findings: ${findings.length}`);
  console.log("------------------------------------------------------------");
  for (let i = 0; i < proven.length; i++) {
    const r = proven[i];
    const f = findings[i];
    console.log(`[BOLA] user ${f.attacker} read user ${f.victim}'s ${f.resource}`);
    console.log(`       leaked fields: ${sensitive(r.cand.leakedFields).join(", ")}`);
    console.log(`       proof marker (masked): ${f.markerMasked}`);
    console.log(`       attack=${f.evidence.provingStatus}  own=${f.evidence.controlOwnStatus}  no-auth=${f.evidence.controlNoAuthStatus}  forged=${f.evidence.controlForgedStatus}  reproduced=${f.reproduced}`);
  }
  if (findings.length === 0) console.log("No BOLA leak proven.");
  console.log("============================================================\n");
}

main().catch((e) => {
  console.error("engine error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
