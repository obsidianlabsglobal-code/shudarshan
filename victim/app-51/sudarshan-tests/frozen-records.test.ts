// FROZEN SAVED TEST — generated against the ORIGINAL app, when records lived at
// /records/:id. It hard-codes that path and treats 401/403/404 as "blocked=safe"
// (the classic saved-test weakness). After an AI moved records to /api/v2/items,
// the old path 404s — so this test STILL reports PASS. That false safety is
// exactly what Sudarshan's self-relocating engine exposes. Synthetic, localhost.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, ".."); // victim/app-51
const PORT = 3051;
const BASE = `http://127.0.0.1:${PORT}`;
const ATTACKER = { email: "rohan@clinic.test", password: "rohan-demo-2026" };
const OLD_TARGET = "/records/rec-1001"; // User A's record, at the path this test remembers

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function stop(p: any) {
  try {
    if (p.pid) process.kill(-p.pid, "SIGKILL");
  } catch {
    try {
      p.kill("SIGKILL");
    } catch {}
  }
}
async function up() {
  try {
    await fetch(BASE + "/");
    return true;
  } catch {
    return false;
  }
}
async function start() {
  const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
  const p = spawn(tsx, ["server.ts"], { stdio: "ignore", detached: true, cwd: APP_DIR, env: { ...process.env, PORT: String(PORT) } });
  for (let i = 0; i < 60; i++) {
    if (await up()) return p;
    await sleep(200);
  }
  stop(p);
  throw new Error("server did not start");
}

async function main() {
  const srv = await start();
  try {
    const lr = await fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ATTACKER) });
    const auth: any = await lr.json();
    const res = await fetch(BASE + OLD_TARGET, { headers: { authorization: "Bearer " + auth.token } });
    const blocked = [401, 403, 404].indexOf(res.status) !== -1; // the flawed assumption
    stop(srv);
    const verdict = blocked ? "PASS" : "FAIL";
    console.log("FROZEN_RESULT " + JSON.stringify({ verdict, path: OLD_TARGET, status: res.status, assumedBlocked: blocked }));
    console.log(`frozen saved test: ${verdict} (GET ${OLD_TARGET} -> ${res.status}, assumed blocked)`);
    process.exit(verdict === "PASS" ? 0 : 1);
  } catch (e) {
    stop(srv);
    console.error("FROZEN_RESULT " + JSON.stringify({ verdict: "ERROR", path: OLD_TARGET, status: 0, assumedBlocked: false }));
    process.exit(2);
  }
}
main();
