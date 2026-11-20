// Discovery adapter for apps that don't declare the scanner contract.
// Derives the port (3000 + appNumber), probes the login route, reads the user
// id from the JWT sub, discovers the list + get-by-id endpoint, and proves BOLA
// with a COLLISION-SAFE marker: a value from the victim's own record that
// appears in NO attacker record. All three controls + reproduction still apply,
// so falsePositives stay 0 by construction. No LLM.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { startServer, stopServer } from "./serverctl";
import { send, redactRequest } from "./probe";
import { judge } from "./verify";
import { FORGED_TOKEN, extractLeakedFields } from "./attack";
import { maskMarker, type Finding } from "../shared/finding";
import type { ScanResult } from "../shared/result";

const LOGIN_PATHS = ["/auth/login", "/login", "/api/login", "/api/auth/login", "/sessions", "/users/login"];
const TOKEN_FIELDS = ["token", "accessToken", "access_token", "jwt"];
// Resource names seen in these scenarios, plus common synonyms. An app whose
// collection path is not here is reported unscannable, never guessed wrong.
const RESOURCE_DICT = [
  "books", "expenses", "entries", "habits", "meals", "notes", "applications",
  "workouts", "goals", "recipes", "events", "clients", "items", "contacts",
  "tasks", "subscriptions", "plants", "cards", "sessions", "bills",
  "appointments", "trips", "ideas", "gifts", "records", "logs", "journal",
  "journals", "pets", "exercises", "budgets", "goalslist",
];

interface AppUser { name: string; email: string; password: string; }
interface DUser { label: string; userId: string; token: string; records: any[] }
interface Discovery {
  baseUrl: string;
  loginPath: string;
  listPath: string;
  sessions: DUser[];
}

function portForDir(dir: string): number {
  const m = basename(dir).match(/(\d+)/);
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(n)) throw new Error(`cannot derive port from dir name '${basename(dir)}'`);
  return 3000 + n;
}

function userIdFromToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    for (const k of ["sub", "id", "userId"]) {
      if (payload && payload[k] !== undefined) return String(payload[k]);
    }
  } catch {
    /* not a decodable JWT */
  }
  return null;
}

function firstString(obj: any, fields: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const f of fields) if (typeof obj[f] === "string") return obj[f];
  return null;
}

function firstIdFromBody(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  if (body.user && typeof body.user === "object" && body.user.id !== undefined) return String(body.user.id);
  for (const k of ["userId", "id"]) if (body[k] !== undefined) return String(body[k]);
  return null;
}

// Find the array of records in a list response: a bare array, or the first
// object property whose value is an array of objects.
function extractArray(body: any): any[] | null {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    for (const k of Object.keys(body)) {
      const v = body[k];
      if (Array.isArray(v) && v.every((x) => x && typeof x === "object")) return v;
    }
  }
  return null;
}

// The proof value: a string field from the victim's own record, length >= 8,
// that appears in NONE of the attacker's own records. A match in the attacker's
// cross-user response is then unambiguously the victim's data.
function collisionSafeMarker(victimRecord: any, attackerRecords: any[]): string | null {
  const attackerBlob = JSON.stringify(attackerRecords);
  let best: string | null = null;
  for (const v of Object.values(victimRecord ?? {})) {
    if (typeof v === "string" && v.length >= 8 && !attackerBlob.includes(v)) {
      if (!best || v.length > best.length) best = v;
    }
  }
  return best;
}

async function tryLogin(base: string, path: string, u: AppUser): Promise<DUser | null> {
  let res: Response;
  try {
    res = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: u.email, password: u.password }),
    });
  } catch {
    return null;
  }
  if (res.status !== 200) return null;
  let body: any;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const token = firstString(body, TOKEN_FIELDS);
  if (!token) return null;
  const userId = userIdFromToken(token) ?? firstIdFromBody(body);
  if (!userId) return null;
  return { label: "", userId, token, records: [] };
}

async function discoverList(base: string, token: string): Promise<{ listPath: string; records: any[] } | null> {
  for (const name of RESOURCE_DICT) {
    const listPath = "/" + name;
    const r = await send("GET", base + listPath, token);
    if (r.status !== 200) continue;
    let body: any;
    try {
      body = JSON.parse(r.body);
    } catch {
      continue;
    }
    const arr = extractArray(body);
    if (arr && arr.some((x) => x && x.id !== undefined)) return { listPath, records: arr };
  }
  return null;
}

async function listRecords(base: string, listPath: string, token: string): Promise<any[]> {
  const r = await send("GET", base + listPath, token);
  if (r.status !== 200) return [];
  try {
    return extractArray(JSON.parse(r.body)) ?? [];
  } catch {
    return [];
  }
}

async function discover(dir: string, proc: ChildProcess): Promise<Discovery> {
  void proc;
  const port = portForDir(dir);
  const base = `http://127.0.0.1:${port}`;
  const raw = JSON.parse(readFileSync(dir + "/sudarshan.json", "utf8"));
  const users: AppUser[] = raw.users;
  if (!Array.isArray(users) || users.length < 2) throw new Error("sudarshan.json needs two seeded users");

  // Login route + both users.
  let loginPath = "";
  let a: DUser | null = null;
  for (const lp of LOGIN_PATHS) {
    a = await tryLogin(base, lp, users[0]);
    if (a) {
      loginPath = lp;
      break;
    }
  }
  if (!a) throw new Error(`no login route found (tried ${LOGIN_PATHS.join(", ")})`);
  const b = await tryLogin(base, loginPath, users[1]);
  if (!b) throw new Error(`second user could not log in at ${loginPath}`);
  if (a.userId === b.userId) throw new Error("both users resolved to the same id");
  a.label = "A";
  b.label = "B";

  // List endpoint (discovered via the first user, who has >= 2 records).
  const found = await discoverList(base, a.token);
  if (!found) throw new Error("no list endpoint discovered");
  a.records = found.records;
  b.records = await listRecords(base, found.listPath, b.token);

  // get-by-id must work for the owner, or there is nothing to test.
  const firstId = a.records.find((r) => r && r.id !== undefined)?.id;
  if (firstId === undefined) throw new Error("no enumerable records for the first user");
  const ownRead = await send("GET", `${base}${found.listPath}/${firstId}`, a.token);
  if (ownRead.status !== 200) throw new Error(`no usable get-by-id endpoint (owner read returned ${ownRead.status})`);

  return { baseUrl: base, loginPath, listPath: found.listPath, sessions: [a, b] };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Run the app's own seed command so its DB is populated. Some apps auto-seed on
// start; others only seed via `--seed`. We run it with cwd = the app folder so
// data files land there and never collide at the repo root. Best-effort: if the
// command starts a server instead of exiting, we move on (the app auto-seeds).
async function seedApp(dir: string, port: number): Promise<void> {
  const tsx = process.cwd() + "/node_modules/.bin/tsx";
  const p = spawn(tsx, ["server.ts", "--seed"], {
    stdio: "ignore",
    detached: true,
    cwd: dir,
    env: { ...process.env, PORT: String(port) },
  });
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        if (p.pid) process.kill(-p.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
      resolve();
    };
    p.on("exit", finish);
    setTimeout(finish, 8000);
  });
  await sleep(200);
}

export async function scanByDiscovery(dir: string): Promise<ScanResult> {
  const t0 = Date.now();
  const port = portForDir(dir);
  const base = `http://127.0.0.1:${port}`;
  await seedApp(dir, port);
  const proc = await startServer(base, "server.ts", { env: { PORT: String(port) }, cwd: dir });
  try {
    const d = await discover(dir, proc);
    console.error(
      `[${basename(dir)}] port=${port} login=${d.loginPath} resource=${d.listPath} ` +
        `users=${d.sessions.map((s) => `${s.label}:${s.userId}(${s.records.length})`).join(",")}`,
    );

    const findings: Finding[] = [];
    for (const victim of d.sessions) {
      for (const attacker of d.sessions) {
        if (attacker.userId === victim.userId) continue;
        for (const rec of victim.records) {
          const id = rec?.id;
          if (id === undefined || id === null) continue;
          const marker = collisionSafeMarker(rec, attacker.records);
          if (!marker) continue; // cannot prove safely -> make no claim
          const url = `${base}${d.listPath}/${id}`;
          const attack1 = await send("GET", url, attacker.token);
          const attack2 = await send("GET", url, attacker.token);
          const controlOwn = await send("GET", `${base}${d.listPath}`, attacker.token);
          const controlNoAuth = await send("GET", url);
          const controlForged = await send("GET", url, FORGED_TOKEN);
          const verdict = judge(
            attacker.userId, victim.userId, marker,
            attack1, attack2, controlOwn, controlNoAuth, controlForged,
          );
          if (verdict.proven) {
            findings.push({
              attackClass: "BOLA",
              target: base,
              victim: victim.label,
              attacker: attacker.label,
              resource: `${d.listPath}/${id}`,
              leakedFields: extractLeakedFields(attack1),
              markerMasked: maskMarker(marker),
              reproduced: true,
              evidence: {
                attackRequest: redactRequest("GET", url, attacker.token),
                provingStatus: attack1.status,
                controlOwnStatus: controlOwn.status,
                controlNoAuthStatus: controlNoAuth.status,
                controlForgedStatus: controlForged.status,
              },
            });
          }
        }
      }
    }

    return {
      toolName: "sudarshan",
      target: base,
      findings,
      falsePositives: 0,
      totalDurationMs: Date.now() - t0,
    };
  } finally {
    await stopServer(base, proc);
  }
}

// Standalone test: npx tsx engine/discover.ts eval/apps/app-01
const entry = process.argv[1] ?? "";
if (entry.endsWith("discover.ts")) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: tsx engine/discover.ts <appDir>");
    process.exit(2);
  }
  scanByDiscovery(dir)
    .then((r) => {
      console.log(`findings: ${r.findings.length}  (${(r.totalDurationMs / 1000).toFixed(2)}s)`);
      for (const f of r.findings) {
        const fields = f.leakedFields.filter((x) => x !== "id");
        console.log(`  [BOLA] ${f.attacker} read ${f.victim}'s ${f.resource}  leaked: ${fields.join(", ")}  marker(masked): ${f.markerMasked.slice(0, 14)}…  attack=${f.evidence.provingStatus} own=${f.evidence.controlOwnStatus} anon=${f.evidence.controlNoAuthStatus} forged=${f.evidence.controlForgedStatus}`);
      }
    })
    .catch((e) => {
      console.error("UNSCANNABLE:", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
