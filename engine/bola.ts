// Orchestrate the two-user BOLA attack from a per-app config (sudarshan.json).
// Log in each user, harvest a victim's own resource ids, replay each as every
// other user, run it through verify.ts, and emit a Finding only when proven and
// reproduced. No LLM anywhere in this path.

import { readFileSync } from "node:fs";
import { send, redactRequest } from "./probe";
import { extractMarker, judge } from "./verify";
import { maskMarker, type Finding } from "../shared/finding";

interface ConfigUser {
  label: string;
  username: string;
  password: string;
}
interface Config {
  baseUrl: string;
  login: { path: string };
  listOwn: string;
  resourceTemplate: string; // contains "{id}"
  users: ConfigUser[];
}
interface Session {
  label: string;
  userId: string;
  token: string;
}

function resourceUrl(cfg: Config, id: string): string {
  return cfg.baseUrl + cfg.resourceTemplate.replace("{id}", id);
}

async function login(cfg: Config, u: ConfigUser): Promise<Session> {
  const res = await fetch(cfg.baseUrl + cfg.login.path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u.username, password: u.password }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${u.label}: HTTP ${res.status}`);
  const data: any = await res.json();
  if (!data.token || !data.userId) throw new Error(`login for ${u.label} returned no token/userId`);
  return { label: u.label, userId: data.userId, token: data.token };
}

async function harvestIds(cfg: Config, s: Session): Promise<string[]> {
  const r = await send("GET", cfg.baseUrl + cfg.listOwn, s.token);
  const items: any = JSON.parse(r.body);
  if (!Array.isArray(items)) return [];
  return items.map((x: any) => x.id).filter((id: unknown): id is string => typeof id === "string");
}

interface Attempt {
  victim: string;
  attacker: string;
  id: string;
  proven: boolean;
  reasons: string[];
}

async function main() {
  const cfgPath = process.argv[2] ?? "victim/sudarshan.json";
  const cfg: Config = JSON.parse(readFileSync(cfgPath, "utf8"));

  const sessions: Session[] = [];
  for (const u of cfg.users) sessions.push(await login(cfg, u));

  const attempts: Attempt[] = [];
  const findings: Finding[] = [];

  for (const victim of sessions) {
    const ids = await harvestIds(cfg, victim);
    for (const attacker of sessions) {
      if (attacker.userId === victim.userId) continue;
      for (const id of ids) {
        const url = resourceUrl(cfg, id);
        const victimRes = await send("GET", url, victim.token);
        const marker = extractMarker(victimRes.body);
        const attack1 = await send("GET", url, attacker.token);
        const attack2 = await send("GET", url, attacker.token);
        const controlOwn = await send("GET", cfg.baseUrl + cfg.listOwn, attacker.token);
        const controlNoAuth = await send("GET", url);

        const verdict = judge(
          attacker.userId, victim.userId, marker,
          attack1, attack2, controlOwn, controlNoAuth,
        );
        attempts.push({ victim: victim.label, attacker: attacker.label, id, proven: verdict.proven, reasons: verdict.reasons });

        if (verdict.proven) {
          findings.push({
            attackClass: "BOLA",
            target: cfg.baseUrl,
            victim: victim.label,
            attacker: attacker.label,
            resource: cfg.resourceTemplate.replace("{id}", id),
            markerMasked: marker ? maskMarker(marker) : "none",
            reproduced: true,
            evidence: {
              attackRequest: redactRequest("GET", url, attacker.token),
              provingStatus: attack1.status,
              controlOwnStatus: controlOwn.status,
              controlNoAuthStatus: controlNoAuth.status,
            },
          });
        }
      }
    }
  }

  report(cfg, attempts, findings);
}

function report(cfg: Config, attempts: Attempt[], findings: Finding[]) {
  console.log("\n==================== BOLA ENGINE REPORT ====================");
  console.log(`target:   ${cfg.baseUrl}`);
  console.log(`attempts: ${attempts.length}   proven findings: ${findings.length}`);
  console.log("------------------------------------------------------------");
  for (const f of findings) {
    console.log(`[BOLA] user ${f.attacker} read user ${f.victim}'s ${f.resource}`);
    console.log(`       proof marker (masked): ${f.markerMasked}`);
    console.log(`       attack=${f.evidence.provingStatus}  own-control=${f.evidence.controlOwnStatus}  no-auth-control=${f.evidence.controlNoAuthStatus}  reproduced=${f.reproduced}`);
    console.log(`       request: ${f.evidence.attackRequest.method} ${f.evidence.attackRequest.url}  (authorization: ${f.evidence.attackRequest.headers.authorization})`);
  }
  if (findings.length === 0) console.log("No BOLA leak proven.");
  console.log("============================================================\n");
}

main().catch((e) => {
  console.error("engine error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
