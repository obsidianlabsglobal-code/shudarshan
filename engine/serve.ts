// `sudarshan serve` — a thin LOCAL presentation layer over the CLI.
//
// It does not touch the proof logic. Each run spawns the exact fallback command
// (`tsx engine/cli.ts verify victim/<app>`) and streams that process's own
// output to the browser as live stage events (Server-Sent Events). The final
// structured result is the JSON the CLI itself writes (web/src/data/verify.json),
// read back after the process exits. verify.ts remains the final authority.
//
// Guardrails:
//   - localhost only (binds 127.0.0.1)
//   - targets are a fixed allowlist of OUR demo apps — no arbitrary input reaches spawn
//   - one run at a time; a hard timeout kills the run's whole process group
//   - the committed dashboard artifact (verify.json) is restored after every run

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, normalize, extname } from "node:path";

const ROOT = process.cwd();
const VERIFY_JSON = join(ROOT, "web", "src", "data", "verify.json");
const DIST = join(ROOT, "web", "dist-console");
const RUN_TIMEOUT_MS = 90_000;
const VERDICT_GRACE_MS = 400;

// The ONLY targets the console can run. Keys are what the browser may send.
export const TARGETS: Record<string, { dir: string; title: string; summary: string }> = {
  "app-51": { dir: "victim/app-51", title: "AI-rewritten clinic API", summary: "An AI refactor moved /records to /api/v2/items and dropped the ownership check." },
  "app-50": { dir: "victim/app-50", title: "Safe baseline", summary: "The original clinic API. get-by-id enforces ownership." },
  "app-52": { dir: "victim/app-52", title: "Renamed to an unknown route", summary: "Resource renamed to /api/v2/manifests, a noun outside the discovery dictionary." },
};

const STAGES = ["PROVE", "FIX", "CHECK", "REMEMBER"] as const;
const ANSI = /\x1b\[[0-9;]*m/g;

interface RunRecord {
  id: string;
  target: string;
  verdict: string;
  exitCode: number | null;
  durationMs: number;
  wallMs: number;
  at: string;
  stages: { name: string; time: string; ms: number }[];
  discovery: { port: number; login: string; route: string } | null;
  result: any;
}

const recent: RunRecord[] = [];
let busy = false;
let pristine: string | null = null;

function restoreArtifact() {
  if (pristine !== null) {
    try {
      writeFileSync(VERIFY_JSON, pristine);
    } catch {
      /* best effort */
    }
  }
}

function toMs(t: string): number {
  if (t === "<1ms") return 0.5;
  const m = t.match(/^([\d.]+)(ms|s)$/);
  if (!m) return 0;
  return m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1]);
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const rel = urlPath === "/" ? "/console.html" : urlPath;
  const file = normalize(join(DIST, rel));
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("not found");
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
}

function runVerification(req: IncomingMessage, res: ServerResponse, target: string) {
  const t = TARGETS[target];
  if (!t) return json(res, 400, { error: "unknown target — the console only runs our demo apps", allowed: Object.keys(TARGETS) });
  if (busy) return json(res, 409, { error: "a verification is already running" });
  busy = true;

  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  let open = true;
  req.on("close", () => (open = false));
  const send = (event: string, data: unknown) => {
    if (open) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const cmd = `npm run sudarshan -- verify ${t.dir}`;
  const startedAt = Date.now();
  send("start", { target, dir: t.dir, cmd, startedAt });

  const tsx = join(ROOT, "node_modules", ".bin", "tsx");
  const child = spawn(tsx, ["engine/cli.ts", "verify", t.dir], { cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const seen = new Set<string>();
  const stdoutLines: string[] = [];
  const stages: RunRecord["stages"] = [];
  let discovery: RunRecord["discovery"] = null;
  // PROVE is held until the CLI prints its outcome line (immediately after), so
  // the UI knows whether FIX/CHECK will run — it never shows a skipped stage as running.
  let pendingProve: { name: string; time: string; ms: number; frozen?: string } | null = null;
  let verdictExit: number | null = null; // exit code the CLI printed on its VERDICT line

  const emitStage = (st: { name: string; time: string; ms: number }, extra: Record<string, unknown> = {}) => {
    stages.push({ name: st.name, time: st.time, ms: st.ms });
    send("stage", { ...st, ...extra, index: STAGES.indexOf(st.name as any) });
  };
  const flushProve = (outcome: string | null) => {
    if (!pendingProve) return;
    const p = pendingProve;
    pendingProve = null;
    emitStage(p, { outcome, frozen: p.frozen ?? null });
  };

  const onLine = (raw: string, stream: "out" | "err") => {
    const line = raw.replace(ANSI, "");
    if (stream === "out") stdoutLines.push(line);
    // Live: the route discovery line arrives on stderr while PROVE is still running.
    const d = line.match(/^\[[^\]]+\] port=(\d+) login=(\S+) resource=(\S+)/);
    if (d) {
      discovery = { port: Number(d[1]), login: d[2], route: d[3] };
      return send("discovery", discovery);
    }
    // A stage header is printed the moment that stage completes.
    const s = line.match(/^\s{2}(PROVE|FIX|CHECK|REMEMBER)\s+·\s+(\S+)\s*$/);
    if (s && !seen.has(s[1])) {
      seen.add(s[1]);
      const st = { name: s[1], time: s[2], ms: toMs(s[2]) };
      if (s[1] === "PROVE") pendingProve = st;
      else {
        flushProve(null);
        emitStage(st);
      }
      return;
    }
    // The CLI prints its verdict last, after REMEMBER has written the JSON and every
    // victim server has been stopped. The process can then idle for several seconds
    // before Node exits, so the console ends it after a short grace period.
    const v = line.match(/^\s+VERDICT: (VULNERABLE|NO_LEAK_DETECTED|INCONCLUSIVE) \(exit (\d)\)/);
    if (v && verdictExit === null) {
      verdictExit = Number(v[2]);
      setTimeout(() => {
        try {
          process.kill(-child.pid!, "SIGTERM");
        } catch {
          /* already exited */
        }
      }, VERDICT_GRACE_MS);
      return;
    }
    if (pendingProve) {
      const f = line.match(/^\s+frozen saved test\s+(\S+)/);
      if (f) pendingProve.frozen = f[1];
      const o = line.match(/^\s+self-relocating\s+(CAUGHT|NO_LEAK_DETECTED|INCONCLUSIVE)\b/);
      if (o) flushProve(o[1]);
    }
  };
  const pipeLines = (stream: NodeJS.ReadableStream, kind: "out" | "err") => {
    let buf = "";
    stream.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        onLine(buf.slice(0, i), kind);
        buf = buf.slice(i + 1);
      }
    });
    stream.on("end", () => buf && onLine(buf, kind));
  };
  pipeLines(child.stdout!, "out");
  pipeLines(child.stderr!, "err");

  const killer = setTimeout(() => {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {
      /* gone */
    }
  }, RUN_TIMEOUT_MS);

  child.on("exit", (code, signal) => {
    clearTimeout(killer);
    flushProve(null);
    const durationMs = Date.now() - startedAt;
    let result: any = null;
    try {
      const r = JSON.parse(readFileSync(VERIFY_JSON, "utf8"));
      // Only accept the JSON this run wrote (not a stale artifact).
      if (r.target === t.dir && Date.parse(r.generatedAt) >= startedAt - 1000) result = r;
    } catch {
      /* no result */
    }
    restoreArtifact(); // keep the committed dashboard artifact stable
    busy = false;

    const completed = result && (verdictExit !== null || !signal);
    if (!completed) {
      send("failure", {
        message: signal ? `run stopped (${signal}) after ${Math.round(durationMs / 1000)}s` : `the CLI exited with code ${code} and wrote no result`,
        fallback: cmd,
        tail: stdoutLines.slice(-6),
      });
    } else {
      const rec: RunRecord = {
        id: `${startedAt}-${target}`,
        target,
        verdict: result.verdict,
        exitCode: verdictExit ?? code, // the CLI's own exit code, from its VERDICT line
        durationMs: typeof result.totalDurationMs === "number" ? result.totalDurationMs : durationMs, // CLI-measured
        wallMs: durationMs,
        at: new Date(startedAt).toISOString(),
        stages,
        discovery,
        result,
      };
      recent.unshift(rec);
      recent.splice(10);
      send("result", rec);
    }
    if (open) res.end();
  });
}

export async function serve(port = 4545) {
  if (!existsSync(join(ROOT, "engine", "cli.ts"))) {
    throw new Error("run `sudarshan serve` from the repo root");
  }
  const rebuild = process.argv.includes("--rebuild");
  if (rebuild || !existsSync(join(DIST, "console.html"))) {
    console.log("sudarshan serve: building the console UI (web/dist-console)…");
    const b = spawnSync("npm", ["run", "build:console"], { cwd: join(ROOT, "web"), stdio: "inherit" });
    if (b.status !== 0) throw new Error("console build failed — the CLI still works: npm run sudarshan -- verify victim/app-51");
  }
  pristine = existsSync(VERIFY_JSON) ? readFileSync(VERIFY_JSON, "utf8") : null;
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      restoreArtifact();
      process.exit(0);
    });
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET") return json(res, 405, { error: "GET only" });
    if (url.pathname === "/api/targets") {
      return json(res, 200, Object.entries(TARGETS).map(([id, t]) => ({ id, ...t, cmd: `npm run sudarshan -- verify ${t.dir}` })));
    }
    if (url.pathname === "/api/runs") return json(res, 200, recent);
    if (url.pathname === "/api/health") return json(res, 200, { ok: true, busy });
    if (url.pathname === "/api/run") return runVerification(req, res, url.searchParams.get("target") ?? "");
    return serveStatic(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  console.log(`\n  Sudarshan console → http://127.0.0.1:${port}`);
  console.log(`  targets: ${Object.keys(TARGETS).join(", ")} · localhost only · synthetic data`);
  console.log(`  fallback: npm run sudarshan -- verify victim/app-51   (Ctrl-C to stop)\n`);
  await new Promise<void>(() => {});
}
