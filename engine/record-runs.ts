// Records real `sudarshan serve` runs to web/src/data/runs/<target>.json so the
// static dashboard can REPLAY a real run offline (same UI, real timings). It only
// consumes the running console API (/api/run SSE) — it never touches the proof
// logic. Usage (two shells):
//   npm run serve
//   npx tsx engine/record-runs.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SERVE_URL || "http://127.0.0.1:4545";
const TARGETS = ["app-51", "app-50", "app-52"];
const OUT = join(process.cwd(), "web", "src", "data", "runs");

interface Rec {
  target: string;
  cmd: string;
  recordedAt: string;
  verdict: string;
  exitCode: number | null;
  durationMs: number;
  events: { t: number; type: string; data: any }[];
  result: any;
}

async function record(target: string): Promise<Rec> {
  const t0 = Date.now();
  const events: Rec["events"] = [];
  const res = await fetch(`${BASE}/api/run?target=${target}`, { headers: { accept: "text/event-stream" } });
  if (!res.ok || !res.body) throw new Error(`run ${target}: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let evName: string | null = null;
  let result: any = null;
  let failure: any = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.startsWith("event: ")) evName = line.slice(7).trim();
      else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        events.push({ t: Date.now() - t0, type: evName ?? "message", data });
        if (evName === "result") result = data;
        if (evName === "failure") failure = data;
      } else if (line === "") evName = null;
    }
  }
  if (!result) throw new Error(`run ${target}: no result (${failure ? JSON.stringify(failure) : "stream ended"})`);
  const cmd = events.find((e) => e.type === "start")?.data?.cmd ?? `npm run sudarshan -- verify victim/${target}`;
  return {
    target,
    cmd,
    recordedAt: new Date(t0).toISOString(),
    verdict: result.verdict,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    events,
    result,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const t of TARGETS) {
    const rec = await record(t);
    writeFileSync(join(OUT, `${t}.json`), JSON.stringify(rec, null, 2) + "\n");
    console.log(`recorded ${t}: ${rec.verdict} exit ${rec.exitCode} · ${rec.events.length} events · ${rec.durationMs}ms`);
    await new Promise((r) => setTimeout(r, 600));
  }
  console.log("done →", OUT);
}
main().catch((e) => {
  console.error("record-runs error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
