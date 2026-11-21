// Sudarshan Console — a thin UI over `sudarshan verify`.
// It never decides anything. With a local server it runs the real CLI and streams
// it live. Without one (e.g. the static dashboard) it REPLAYS a real recorded run
// at its real timings — same UI, same verdicts. Never labelled "live" in replay.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chakra } from "../components/Chakra";
import Background from "../components/Background";
import rec51 from "../data/runs/app-51.json";
import rec50 from "../data/runs/app-50.json";
import rec52 from "../data/runs/app-52.json";

const RECORDINGS: Record<string, any> = { "app-51": rec51, "app-50": rec50, "app-52": rec52 };

type StageName = "PROVE" | "FIX" | "CHECK" | "REMEMBER";
type StageState = "pending" | "running" | "done" | "skipped";
type Verdict = "VULNERABLE" | "INCONCLUSIVE" | "NO_LEAK_DETECTED";
interface StageView { state: StageState; time?: string; startedAt?: number }
interface Target { id: string; dir: string; title: string; summary: string; cmd: string }
interface RunRecord {
  id: string;
  target: string;
  verdict: Verdict;
  exitCode: number | null;
  durationMs: number;
  at: string;
  stages: { name: string; time: string; ms: number }[];
  discovery: { port: number; login: string; route: string } | null;
  result: any;
}

const STAGES: { name: StageName; title: string; desc: string }[] = [
  { name: "PROVE", title: "Attack the running app", desc: "Saved test vs. self-relocating exploit — re-find the route, attack ×2" },
  { name: "FIX", title: "Restore & re-attack", desc: "Apply the ownership fix; accept only if the owner still gets 200" },
  { name: "CHECK", title: "Proof trident", desc: "Collision-safe marker · forged-token control · reproduced" },
  { name: "REMEMBER", title: "Persist the proof", desc: "Write the proof to the repo — it survives a restart" },
];

// Fallback only (the server's /api/targets is the source of truth).
const FALLBACK_TARGETS: Target[] = [
  { id: "app-51", dir: "victim/app-51", title: "Clinic API — rewritten", summary: "An AI refactor moved /records to /api/v2/items and dropped the ownership check.", cmd: "npm run sudarshan -- verify victim/app-51" },
  { id: "app-50", dir: "victim/app-50", title: "Clinic API — baseline", summary: "The original clinic API. get-by-id enforces ownership.", cmd: "npm run sudarshan -- verify victim/app-50" },
  { id: "app-52", dir: "victim/app-52", title: "Clinic API — unfamiliar rename", summary: "Resource renamed to /api/v2/manifests, a noun outside the discovery dictionary.", cmd: "npm run sudarshan -- verify victim/app-52" },
];

const VERDICT: Record<Verdict, { color: string; soft: string; headline: string; exitMeaning: string }> = {
  VULNERABLE: { color: "#FF453A", soft: "rgba(255,69,58,0.10)", headline: "Cross-user leak proven", exitMeaning: "fails CI" },
  INCONCLUSIVE: { color: "#FFD60A", soft: "rgba(255,214,10,0.08)", headline: "Endpoint not located — no claim made", exitMeaning: "needs review" },
  NO_LEAK_DETECTED: { color: "#30D158", soft: "rgba(48,209,88,0.09)", headline: "No supported BOLA leak reproduced", exitMeaning: "passes CI" },
};

// Visual pacing only: each stage completion is shown at least this long after
// the previous one so the sequence is legible. The timings displayed are the
// CLI's own measured times.
const DWELL_MS = 420;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmtDur = (ms: number) => (ms < 1000 ? `${Math.max(0, Math.round(ms))}ms` : `${(ms / 1000).toFixed(1)}s`);
const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const idleStages = (): Record<StageName, StageView> => ({ PROVE: { state: "pending" }, FIX: { state: "pending" }, CHECK: { state: "pending" }, REMEMBER: { state: "pending" } });

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/* ---------- tiny icons ---------- */
const Icon = {
  check: (c = "") => (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 ${c}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
  ),
  dash: (c = "") => (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 ${c}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4.5 8h7" /></svg>
  ),
  play: (c = "") => (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 ${c}`} fill="currentColor"><path d="M5 3.2v9.6c0 .5.5.8.9.5l7.2-4.8c.4-.3.4-.8 0-1L5.9 2.7c-.4-.3-.9 0-.9.5z" /></svg>
  ),
  rerun: (c = "") => (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 ${c}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" /></svg>
  ),
  copy: (c = "") => (
    <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${c}`} fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5" y="5" width="8.5" height="8.5" rx="1.6" /><path d="M10.5 5V3.6c0-.6-.5-1.1-1.1-1.1H3.6c-.6 0-1.1.5-1.1 1.1v5.8c0 .6.5 1.1 1.1 1.1H5" /></svg>
  ),
  x: (c = "") => (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 ${c}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
  ),
};

/* ---------- small building blocks ---------- */
function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-saffron2">{children}</p>;
}

function VerdictChip({ v, size = "sm" }: { v: Verdict; size?: "sm" | "md" }) {
  const m = VERDICT[v];
  return (
    <span
      className={`mono inline-flex items-center gap-1.5 rounded-full border font-medium ${size === "md" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10.5px]"}`}
      style={{ color: m.color, borderColor: m.color + "55", background: m.soft }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {v}
    </span>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await copyText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-hair bg-panel2 px-2.5 py-1 text-[11px] font-medium text-dimfg transition-colors hover:border-saffron/50 hover:text-fg"
    >
      {done ? Icon.check("text-green") : Icon.copy()}
      {done ? "Copied" : label}
    </button>
  );
}

/* ---------- header ---------- */
function Header({ online, running }: { online: boolean | null; running: boolean }) {
  return (
    <header className="relative z-10 border-b border-hair/80 bg-ink/70 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Chakra size={24} className={`text-saffron2 ${running ? "spin-slow" : ""}`} />
          <span className="text-[15px] font-semibold tracking-tight">Sudarshan</span>
          <span className="h-4 w-px bg-hair" />
          <span className="text-sm text-mutefg">Console</span>
        </div>
        <div className="flex items-center gap-2.5 text-[11px]">
          <span className="hidden rounded-full border border-hair px-2.5 py-1 text-mutefg sm:inline">localhost only</span>
          <span className="hidden rounded-full border border-hair px-2.5 py-1 text-mutefg sm:inline">synthetic data</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-hair px-2.5 py-1 text-dimfg">
            <span className={`h-1.5 w-1.5 rounded-full ${online === false ? "bg-red" : online ? "bg-green" : "bg-mutefg"}`} />
            {online === false ? "server offline" : running ? "verifying" : "engine ready"}
          </span>
        </div>
      </div>
    </header>
  );
}

/* ---------- target picker ---------- */
function TargetPicker({ targets, selected, onSelect, disabled }: { targets: Target[]; selected: string; onSelect: (id: string) => void; disabled: boolean }) {
  return (
    <div role="radiogroup" aria-label="Demo app" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {targets.map((t) => {
        const on = t.id === selected;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onSelect(t.id)}
            className={`focus-ring surface group p-5 text-left transition-all duration-200 disabled:cursor-not-allowed ${
              on ? "!border-saffron2/70 shadow-[0_0_0_1px_rgba(224,147,47,0.35),0_14px_40px_-18px_rgba(224,147,47,0.45)]" : "hover:!border-[#3a3122] disabled:opacity-60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`mono text-xs ${on ? "text-saffron2" : "text-mutefg"}`}>{t.id}</span>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${on ? "border-saffron2" : "border-hair"}`}>
                {on && <span className="h-2 w-2 rounded-full bg-saffron2" />}
              </span>
            </div>
            <div className="mt-3 text-[15px] font-medium text-fg">{t.title}</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-mutefg">{t.summary}</p>
            <div className="mono mt-4 text-[11px] text-mutefg/80">{t.dir}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- pipeline ---------- */
function StageTile({ i, meta, view, now, outcome }: { i: number; meta: (typeof STAGES)[number]; view: StageView; now: number; outcome?: string | null }) {
  const s = view.state;
  const status =
    s === "running" ? (
      <span className="flex items-center gap-2 text-saffron2"><span className="ping" /> running <span className="mono tnum text-dimfg">{fmtDur(now - (view.startedAt ?? now))}</span></span>
    ) : s === "done" ? (
      <span className="flex items-center gap-1.5 text-green">{Icon.check()} done <span className="mono text-dimfg">{view.time}</span></span>
    ) : s === "skipped" ? (
      <span className="flex items-center gap-1.5 text-mutefg">{Icon.dash()} skipped — no proven leak</span>
    ) : (
      <span className="text-mutefg/70">waiting</span>
    );
  return (
    <div className={`relative rounded-xl border p-4 transition-colors duration-300 ${s === "running" ? "border-saffron2/50 bg-saffron/[0.06]" : s === "done" ? "border-hair bg-panel2/60" : "border-hair/70 bg-transparent"}`}>
      <div className={`stage-bar ${s}`}><i /></div>
      <div className="mt-3.5 flex items-baseline gap-2">
        <span className="mono text-[11px] text-mutefg">{String(i + 1).padStart(2, "0")}</span>
        <span className={`mono text-sm font-semibold tracking-wide ${s === "pending" ? "text-mutefg" : s === "skipped" ? "text-mutefg line-through decoration-hair" : "text-fg"}`}>{meta.name}</span>
      </div>
      <div className={`mt-1 text-[13px] font-medium ${s === "pending" || s === "skipped" ? "text-mutefg" : "text-dimfg"}`}>{meta.title}</div>
      <p className="mt-1 min-h-[34px] text-[11.5px] leading-snug text-mutefg/90">{meta.desc}</p>
      <div className="mt-3 text-[12px] font-medium">{status}</div>
      {meta.name === "PROVE" && outcome && s === "done" && (
        <div className="mono mt-2 text-[11px] text-mutefg">self-relocating → <span style={{ color: outcome === "CAUGHT" ? "#FF453A" : outcome === "INCONCLUSIVE" ? "#FFD60A" : "#30D158" }}>{outcome}</span></div>
      )}
    </div>
  );
}

function Pipeline({ stages, now, discovery, outcome, phase, runStart, total, compact = false }: {
  stages: Record<StageName, StageView>; now: number; discovery: RunRecord["discovery"]; outcome: string | null; phase: string; runStart: number | null; total: number | null; compact?: boolean;
}) {
  const doneCount = STAGES.filter((s) => stages[s.name].state === "done" || stages[s.name].state === "skipped").length;
  return (
    <div className="surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-fg">Pipeline</span>
          <span className="mono text-[11px] text-mutefg">{doneCount}/4 stages</span>
        </div>
        <div className="mono text-[11px] text-mutefg">
          {phase === "running" && runStart ? <>elapsed <span className="tnum text-dimfg">{fmtDur(now - runStart)}</span></> : total != null ? <>total <span className="text-dimfg">{fmtDur(total)}</span></> : "idle"}
        </div>
      </div>
      <div className={`mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 ${compact ? "" : "lg:grid-cols-4"}`}>
        {STAGES.map((m, i) => (
          <StageTile key={m.name} i={i} meta={m} view={stages[m.name]} now={now} outcome={m.name === "PROVE" ? outcome : undefined} />
        ))}
      </div>
      <div className="mono mt-4 flex min-h-[20px] items-center gap-2 text-[11.5px] text-mutefg">
        {discovery ? (
          <>
            <span className="text-green">●</span> route re-discovered <span className="text-dimfg">{discovery.route}</span>
            <span className="text-mutefg/60">· login {discovery.login} · port {discovery.port}</span>
          </>
        ) : phase === "running" ? (
          <><span className="text-saffron2">●</span> locating the route on the running app…</>
        ) : (
          <span className="text-mutefg/60">Each stage lights up as the CLI completes it. Timings are measured, not simulated.</span>
        )}
      </div>
    </div>
  );
}

/* ---------- results ---------- */
function VerdictHero({ rec, onRerun, running }: { rec: RunRecord; onRerun: () => void; running: boolean }) {
  const r = rec.result;
  const f = r.finding;
  const m = VERDICT[rec.verdict];
  const detail =
    rec.verdict === "VULNERABLE"
      ? `Attacker (${f?.attacker}) read Victim (${f?.victim})'s private record at ${f?.resource} — reproduced ×2 against the running app.`
      : rec.verdict === "INCONCLUSIVE"
        ? `Discovery could not find the endpoint (${r.discoveryError}). An unknown route is reported as inconclusive — never as safe.`
        : `Discovery reached ${rec.discovery?.route ?? "the route"}; no cross-user read reproduced a leak. Tested: per-object ownership — not a full security audit.`;
  return (
    <div className="surface rise relative overflow-hidden p-7" style={{ boxShadow: `inset 3px 0 0 0 ${m.color}` }}>
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl" style={{ background: m.soft }} />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-mutefg">Verdict · {rec.target}</div>
          <div className="mono mt-3 text-[clamp(1.9rem,4vw,2.8rem)] font-semibold leading-none tracking-tight" style={{ color: m.color }}>
            {rec.verdict}
          </div>
          <div className="mt-3 text-[17px] font-medium text-fg">{m.headline}</div>
          <p className="mt-1.5 text-sm leading-relaxed text-dimfg">{detail}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="rounded-xl border px-4 py-3 text-right" style={{ borderColor: m.color + "55", background: m.soft }}>
            <div className="text-[10px] uppercase tracking-[0.2em] text-mutefg">exit code</div>
            <div className="mono text-3xl font-semibold leading-tight" style={{ color: m.color }}>{rec.exitCode}</div>
            <div className="text-[11px] text-dimfg">{m.exitMeaning}</div>
          </div>
          <div className="mono text-[11px] text-mutefg">{fmtDur(rec.durationMs)} · {fmtClock(rec.at)}</div>
          <button type="button" onClick={onRerun} disabled={running} className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-hair bg-panel2 px-3 py-1.5 text-xs font-medium text-dimfg transition-colors hover:border-saffron/50 hover:text-fg disabled:opacity-50">
            {Icon.rerun()} Re-run
          </button>
        </div>
      </div>
    </div>
  );
}

function Contrast({ rec }: { rec: RunRecord }) {
  const fz = rec.result.frozen;
  const f = rec.result.finding;
  if (!fz) return null;
  const falseSafe = fz.verdict === "PASS" && rec.verdict === "VULNERABLE";
  return (
    <div className="surface rise grid grid-cols-1 overflow-hidden sm:grid-cols-2" style={{ animationDelay: "80ms" }}>
      <div className="border-b border-hair p-5 sm:border-b-0 sm:border-r">
        <div className="text-[11px] uppercase tracking-[0.18em] text-mutefg">Saved test (frozen)</div>
        <div className="mt-2 flex items-baseline gap-2.5">
          <span className="mono text-2xl font-semibold text-mutefg">{fz.verdict}</span>
          {falseSafe && <span className="text-xs font-medium text-red">✗ false safety</span>}
        </div>
        <div className="mono mt-2 text-[12px] text-mutefg">GET {fz.path} <span className="text-red">→ {fz.status}</span></div>
        <p className="mt-1.5 text-[11.5px] text-mutefg/80">Hard-coded path. A 404 is read as “blocked”.</p>
      </div>
      <div className="p-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-mutefg">Sudarshan (self-relocating)</div>
        <div className="mt-2 flex items-baseline gap-2.5">
          <span className="mono text-2xl font-semibold" style={{ color: VERDICT[rec.verdict].color }}>{rec.verdict === "VULNERABLE" ? "CAUGHT" : rec.verdict}</span>
        </div>
        <div className="mono mt-2 text-[12px] text-mutefg">
          {f ? <>GET {f.resource} <span className="text-red">→ {f.controls?.attack}</span></> : rec.discovery ? <>route {rec.discovery.route}</> : "route not located"}
        </div>
        <p className="mt-1.5 text-[11.5px] text-mutefg/80">Re-finds the moved route, then attacks it.</p>
      </div>
    </div>
  );
}

function Evidence({ rec }: { rec: RunRecord }) {
  const r = rec.result;
  const f = r.finding;
  if (rec.verdict === "VULNERABLE" && f) {
    const fields = Object.entries((f.leakedRecordMasked ?? {}) as Record<string, string>).filter(([k]) => k !== "id" && k !== "ownerId");
    const c = f.controls ?? {};
    const chips: [string, number, boolean][] = [
      ["attacker read", c.attack, c.attack === 200],
      ["owner list", c.own, false],
      ["no token", c.anon, false],
      ["forged token", c.forged, false],
    ];
    return (
      <div className="surface rise p-6" style={{ animationDelay: "160ms" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-red">Attacker ({f.attacker}) read Victim ({f.victim})'s private record</div>
          <span className="rounded-full border border-hair px-2 py-0.5 text-[10px] text-mutefg">masked</span>
        </div>
        <div className="mono mt-4 rounded-lg border border-hair bg-ink/70 px-4 py-2.5 text-[12.5px] text-dimfg">
          <span className="text-mutefg">GET</span> {f.resource} <span className="text-mutefg">as User {f.attacker}</span> <span className="text-red">→ {c.attack}</span>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {fields.map(([k, val]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 border-b border-hair/60 pb-2">
              <dt className="text-xs text-mutefg">{k}</dt>
              <dd className="mono truncate text-[13px] text-dimfg" title={String(val)}>{String(val)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          {chips.map(([label, code, bad]) => (
            <span key={label} className={`mono rounded-md border px-2 py-1 text-[11px] ${bad ? "border-red/40 bg-red/[0.07] text-red" : "border-hair text-mutefg"}`}>
              {label} <span className={bad ? "" : "text-dimfg"}>{code}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (rec.verdict === "INCONCLUSIVE") {
    return (
      <div className="surface rise p-6" style={{ animationDelay: "160ms" }}>
        <div className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: VERDICT.INCONCLUSIVE.color }}>Why inconclusive</div>
        <div className="mono mt-4 rounded-lg border border-hair bg-ink/70 px-4 py-2.5 text-[12.5px] text-dimfg">{r.discoveryError}</div>
        <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-dimfg">
          <li>Re-discovery is dictionary-based: known resource names across common API prefixes. This app’s route is outside it.</li>
          <li>So Sudarshan makes <span className="text-fg">no claim either way</span> — it does not call the app safe.</li>
          <li className="text-mutefg">Exit 2 routes it to a human instead of passing CI.</li>
        </ul>
      </div>
    );
  }
  return (
    <div className="surface rise p-6" style={{ animationDelay: "160ms" }}>
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-green">What was tested</div>
      <ul className="mt-4 space-y-3 text-[13px] text-dimfg">
        <li className="flex gap-2.5">{Icon.check("mt-0.5 shrink-0 text-green")}<span>Route re-discovered: <span className="mono text-fg">{rec.discovery?.route ?? "—"}</span> (login {rec.discovery?.login ?? "—"})</span></li>
        <li className="flex gap-2.5">{Icon.check("mt-0.5 shrink-0 text-green")}<span>Cross-user get-by-id attempted against the victim’s records — no leak reproduced.</span></li>
        <li className="flex gap-2.5">{Icon.dash("mt-0.5 shrink-0 text-mutefg")}<span className="text-mutefg">Scope: per-object ownership (BOLA). Not a full security audit.</span></li>
      </ul>
    </div>
  );
}

function Proofs({ rec }: { rec: RunRecord }) {
  const r = rec.result;
  const f = r.finding;
  const applies = rec.verdict === "VULNERABLE";
  const rows: [boolean, string, string][] = applies
    ? [
        [!!r.trident?.marker, "Collision-safe marker", "The leaked value is the victim’s own — absent from the attacker’s data."],
        [!!r.trident?.forgedDiscriminator, "Forged-token discriminator", `A wrong-secret token is rejected (${f?.controls?.forged}) → an authorization flaw, not broken login.`],
        [!!r.trident?.selfRelocating, "Self-relocating", `Re-found ${f?.resource}; reproduced ×2.`],
      ]
    : [
        [false, "Collision-safe marker", "The leaked value must be the victim’s own, absent from the attacker’s data."],
        [false, "Forged-token discriminator", "A wrong-secret token must be rejected, ruling out broken login."],
        [false, "Self-relocating", "The leak must be re-found on the moved route and reproduced ×2."],
      ];
  return (
    <div className="surface rise p-6" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-fg">Three proofs</div>
        {!applies && <span className="text-[11px] text-mutefg">apply to a proven leak</span>}
      </div>
      <ul className="mt-4 space-y-3.5">
        {rows.map(([ok, title, desc]) => (
          <li key={title} className={`flex gap-3 ${applies ? "" : "opacity-45"}`}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${applies && ok ? "bg-green/15 text-green" : "bg-hair text-mutefg"}`}>
              {applies && ok ? Icon.check("h-3 w-3") : Icon.dash("h-3 w-3")}
            </span>
            <div>
              <div className="text-[13px] font-medium text-fg">{title}</div>
              <div className="text-[12px] leading-snug text-mutefg">{desc}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FixGate({ rec }: { rec: RunRecord }) {
  const fix = rec.result.fix;
  if (rec.verdict !== "VULNERABLE" || !fix?.applied) return null;
  return (
    <div className="surface rise p-6" style={{ animationDelay: "200ms" }}>
      <div className="text-sm font-medium text-fg">Fix gate</div>
      <div className={`mt-3 flex items-center gap-2 text-[13px] font-medium ${fix.accepted ? "text-green" : "text-red"}`}>
        {fix.accepted ? Icon.check() : Icon.x()} {fix.accepted ? "Fix accepted" : "Fix rejected"}
      </div>
      <div className="mono mt-2 text-[12px] text-mutefg">ownership restored → attacker <span className="text-dimfg">{fix.attackStatus}</span> · owner <span className="text-dimfg">{fix.legitStatus}</span></div>
      <p className="mt-2 text-[12px] leading-snug text-mutefg">Accepted only because the legitimate user still gets 200.</p>
    </div>
  );
}

function ScopeLine() {
  return (
    <div className="rise mt-5 flex flex-col gap-2 border-t border-hair pt-5 text-[11.5px] text-mutefg sm:flex-row sm:items-center sm:justify-between" style={{ animationDelay: "240ms" }}>
      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap"><Chakra size={13} className="text-saffron2" /> Deterministic · no LLM in the proof path · decided by status + bytes + identity</span>
      <span className="sm:text-right">Re-discovery is dictionary-based, not semantic — an unknown rename is INCONCLUSIVE, never a false NO_LEAK_DETECTED.</span>
    </div>
  );
}

function RecentRuns({ runs, activeId, onOpen }: { runs: RunRecord[]; activeId: string | null; onOpen: (r: RunRecord) => void }) {
  return (
    <div className="surface p-6">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-fg">Recent runs</div>
        <span className="text-[11px] text-mutefg">this session · {runs.length}</span>
      </div>
      {runs.length === 0 ? (
        <p className="mt-4 text-[13px] text-mutefg">No runs yet. Pick a demo app and press Run.</p>
      ) : (
        <ul className="mt-3 divide-y divide-hair/70">
          {runs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpen(r)}
                className={`focus-ring grid w-full grid-cols-[72px_64px_1fr_auto] items-center gap-3 rounded-md px-2 py-2.5 text-left text-[12px] transition-colors hover:bg-panel2/70 ${activeId === r.id ? "bg-panel2/70" : ""}`}
              >
                <span className="mono text-mutefg">{fmtClock(r.at)}</span>
                <span className="mono text-dimfg">{r.target}</span>
                <span><VerdictChip v={r.verdict} /></span>
                <span className="mono text-mutefg">exit {r.exitCode} · {fmtDur(r.durationMs)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- product-console building blocks ---------- */
interface LogLine { id: number; t: number; text: string; color: string }

function ReplayBanner({ recordedAt }: { recordedAt: string }) {
  return (
    <div className="surface flex flex-col gap-3 border-saffron2/30 p-4 sm:flex-row sm:items-center sm:justify-between" style={{ boxShadow: "inset 3px 0 0 0 #E0932F" }}>
      <p className="text-[12.5px] leading-relaxed text-dimfg">
        <span className="font-medium text-fg">Replay</span> of a real run recorded {recordedAt} — real CLI output, real
        timings. Run it live on your machine: <span className="mono text-saffron2">npm run serve</span>
      </p>
      <CopyButton text="npm run serve" label="Copy" />
    </div>
  );
}

function TargetRail({ targets, selected, onSelect, verdictOf, disabled }: { targets: Target[]; selected: string; onSelect: (id: string) => void; verdictOf: (id: string) => Verdict | null; disabled: boolean }) {
  return (
    <div role="radiogroup" aria-label="Demo app" className="space-y-2.5">
      {targets.map((t) => {
        const on = t.id === selected;
        const v = verdictOf(t.id);
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onSelect(t.id)}
            className={`focus-ring surface w-full p-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
              on ? "!border-saffron2/70 shadow-[0_0_0_1px_rgba(224,147,47,0.3)]" : "hover:!border-[#3a3122]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`mono text-xs ${on ? "text-saffron2" : "text-mutefg"}`}>{t.id}</span>
              {v ? <VerdictChip v={v} /> : <span className="h-2 w-2 rounded-full border border-hair" />}
            </div>
            <div className="mt-2 text-[14px] font-medium leading-tight text-fg">{t.title}</div>
            <p className="mt-1 text-[11.5px] leading-snug text-mutefg">{t.summary}</p>
          </button>
        );
      })}
    </div>
  );
}

function LiveLog({ lines, running }: { lines: LogLine[]; running: boolean }) {
  return (
    <div className="surface mt-5 overflow-hidden">
      <div className="flex items-center justify-between border-b border-hair px-5 py-2.5">
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-mutefg">
          {running && <span className="ping" />} Live log
        </span>
        <span className="mono text-[10px] text-mutefg">{lines.length} events</span>
      </div>
      <div className="mono max-h-[200px] overflow-auto px-5 py-3 text-[11.5px] leading-relaxed">
        {lines.length === 0 ? (
          <div className="text-mutefg/60">Awaiting a run…</div>
        ) : (
          lines.map((l) => (
            <div key={l.id} className="rise flex gap-3 py-0.5">
              <span className="tnum shrink-0 text-mutefg/50">{fmtDur(l.t)}</span>
              <span style={{ color: l.color }}>{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyResults({ running }: { running: boolean }) {
  return (
    <div className="surface flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
      <Chakra size={26} className={`text-saffron2/70 ${running ? "spin-slow" : ""}`} />
      <p className="mt-4 max-w-[220px] text-[13px] leading-relaxed text-mutefg">
        {running ? "Attacking the running app…" : "Press Run to see the verdict, the leaked record, and the three proofs."}
      </p>
    </div>
  );
}

/* ---------- page ---------- */
export default function Console({ embedded = false, forceReplay = false }: { embedded?: boolean; forceReplay?: boolean }) {
  const [targets, setTargets] = useState<Target[]>(FALLBACK_TARGETS);
  const [selected, setSelected] = useState("app-51");
  const [mode, setMode] = useState<"checking" | "live" | "replay">("checking");
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [stages, setStages] = useState(idleStages);
  const [discovery, setDiscovery] = useState<RunRecord["discovery"]>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [record, setRecord] = useState<RunRecord | null>(null);
  const [error, setError] = useState<{ message: string; fallback: string } | null>(null);
  const [recent, setRecent] = useState<RunRecord[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [runStart, setRunStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const esRef = useRef<EventSource | null>(null);
  const timers = useRef<number[]>([]);
  const startRef = useRef<number>(Date.now());
  const logId = useRef(0);

  const target = targets.find((t) => t.id === selected) ?? targets[0];
  const running = phase === "running";
  const verdictOf = (id: string): Verdict | null => {
    if (record?.target === id) return record.verdict;
    return (RECORDINGS[id]?.verdict as Verdict) ?? null;
  };

  useEffect(() => {
    // The static dashboard has no server — go straight to replay, no probe (and no
    // stray 404 in the console). `sudarshan serve` leaves forceReplay off and detects live.
    if (forceReplay) {
      setMode("replay");
      return;
    }
    // Live if a console server answers; otherwise replay the bundled recordings.
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        setMode("live");
        fetch("/api/targets").then((r) => r.json()).then(setTargets).catch(() => {});
        fetch("/api/runs").then((r) => r.json()).then(setRecent).catch(() => {});
      })
      .catch(() => setMode("replay"));
    return () => {
      esRef.current?.close();
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const h = setInterval(() => setNow(Date.now()), 60);
    return () => clearInterval(h);
  }, [running]);

  const later = (fn: () => void, dwell = 0) => {
    chain.current = chain.current.then(async () => {
      fn();
      if (dwell) await sleep(dwell);
    });
  };
  const pushLog = (text: string, color = "#C6BEAF") =>
    setLog((prev) => [...prev, { id: logId.current++, t: Date.now() - startRef.current, text, color }]);

  const applyStage = (ev: { name: StageName; time: string; outcome?: string | null }) => {
    if (ev.name === "PROVE" && ev.outcome) setOutcome(ev.outcome);
    pushLog(
      `${ev.name} ✓ ${ev.time}` + (ev.name === "PROVE" && ev.outcome ? `  self-relocating: ${ev.outcome}` : ""),
      ev.name === "PROVE" && ev.outcome === "CAUGHT" ? "#FF453A" : "#C6BEAF",
    );
    setStages((prev) => {
      const next = { ...prev };
      const idx = STAGES.findIndex((s) => s.name === ev.name);
      STAGES.forEach((s, i) => {
        if (i < idx && (next[s.name].state === "pending" || next[s.name].state === "running")) next[s.name] = { state: "skipped" };
      });
      next[ev.name] = { state: "done", time: ev.time };
      const t = Date.now();
      if (ev.name === "PROVE") {
        if (ev.outcome === "CAUGHT") next.FIX = { state: "running", startedAt: t };
        else if (ev.outcome) {
          next.FIX = { state: "skipped" };
          next.CHECK = { state: "skipped" };
          next.REMEMBER = { state: "running", startedAt: t };
        }
      } else if (ev.name === "FIX") next.CHECK = { state: "running", startedAt: t };
      else if (ev.name === "CHECK") next.REMEMBER = { state: "running", startedAt: t };
      return next;
    });
  };

  // Shared event handlers — live SSE and replay both feed these.
  const onDiscovery = (d: RunRecord["discovery"]) =>
    later(() => {
      setDiscovery(d);
      if (d) pushLog(`route re-discovered ${d.route} · login ${d.login} · port ${d.port}`, "#30D158");
    });
  const onStage = (d: any) => later(() => applyStage(d), DWELL_MS);
  const onResult = (rec: RunRecord) =>
    later(() => {
      setRecord(rec);
      setPhase("done");
      setRecent((prev) => [rec, ...prev.filter((p) => p.id !== rec.id)].slice(0, 10));
      pushLog(`VERDICT: ${rec.verdict} (exit ${rec.exitCode})`, VERDICT[rec.verdict].color);
    });
  const onFailure = (d: any) => later(() => { setError({ message: d.message, fallback: d.fallback }); setPhase("error"); });

  const resetForRun = (id: string, cmd: string) => {
    esRef.current?.close();
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    chain.current = Promise.resolve();
    const t0 = Date.now();
    startRef.current = t0;
    setPhase("running");
    setRecord(null);
    setError(null);
    setDiscovery(null);
    setOutcome(null);
    setRunStart(t0);
    setNow(t0);
    setLog([]);
    setStages({ ...idleStages(), PROVE: { state: "running", startedAt: t0 } });
    pushLog(`$ ${cmd}`, "#9A9284");
  };

  const liveRun = (id: string) => {
    resetForRun(id, target.cmd);
    let finished = false;
    const es = new EventSource(`/api/run?target=${encodeURIComponent(id)}`);
    esRef.current = es;
    es.addEventListener("discovery", (e) => onDiscovery(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("stage", (e) => onStage(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("result", (e) => { finished = true; es.close(); onResult(JSON.parse((e as MessageEvent).data)); });
    es.addEventListener("failure", (e) => { finished = true; es.close(); onFailure(JSON.parse((e as MessageEvent).data)); });
    es.onerror = () => {
      if (finished) return;
      finished = true;
      es.close();
      fetch("/api/health")
        .then((r) => r.json())
        .then((h) => onFailure({ message: h.busy ? "A verification is already running — try again in a moment." : "The run stream closed unexpectedly.", fallback: target.cmd }))
        .catch(() => onFailure({ message: "The console server is not reachable.", fallback: target.cmd }));
    };
  };

  const replayRun = (id: string) => {
    const rec = RECORDINGS[id];
    if (!rec) return;
    resetForRun(id, rec.cmd);
    for (const ev of rec.events as { t: number; type: string; data: any }[]) {
      const timer = window.setTimeout(() => {
        if (ev.type === "discovery") onDiscovery(ev.data);
        else if (ev.type === "stage") onStage(ev.data);
        else if (ev.type === "result") onResult(ev.data as RunRecord);
        else if (ev.type === "failure") onFailure(ev.data);
      }, ev.t);
      timers.current.push(timer);
    }
  };

  const run = (id = selected) => {
    if (running || mode === "checking") return;
    if (mode === "replay") replayRun(id);
    else liveRun(id);
  };

  const openRecord = (r: RunRecord) => {
    if (running) return;
    setRecord(r);
    setPhase("done");
    setError(null);
    setSelected(r.target);
    setDiscovery(r.discovery);
    const next = idleStages();
    STAGES.forEach((s) => {
      const hit = r.stages?.find((x) => x.name === s.name);
      next[s.name] = hit ? { state: "done", time: hit.time } : { state: "skipped" };
    });
    setStages(next);
    setOutcome(r.verdict === "VULNERABLE" ? "CAUGHT" : r.verdict);
    setRunStart(null);
  };

  const sameTarget = record?.target === selected;
  const recordedAt = (() => {
    const iso = RECORDINGS[selected]?.recordedAt;
    if (!iso) return "earlier today";
    const d = new Date(iso);
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  })();

  const content = (
    <div className={`relative z-10 mx-auto max-w-[1280px] px-5 sm:px-6 ${embedded ? "pb-16 pt-8" : "pb-20 pt-10"}`}>
      {mode === "replay" && <div className="mb-6"><ReplayBanner recordedAt={recordedAt} /></div>}

      <div className="flex flex-col gap-1.5">
        <Eyebrow>{mode === "replay" ? "Replay · recorded run" : "Live verification · localhost"}</Eyebrow>
        <h1 className="max-w-3xl text-balance text-[clamp(1.6rem,3.4vw,2.5rem)] font-semibold leading-[1.06] tracking-tight">
          Attack the running app. <span className="text-mutefg">Prove the leak — or say so honestly.</span>
        </h1>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* LEFT — targets, run, recent */}
        <aside className="space-y-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-mutefg">Target</div>
          <TargetRail targets={targets} selected={selected} onSelect={setSelected} verdictOf={verdictOf} disabled={running} />
          <button
            type="button"
            onClick={() => run()}
            disabled={running || mode === "checking"}
            className="btn-primary focus-ring inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[15px] font-semibold"
          >
            {running ? (
              <><Chakra size={16} className="spin-slow" /> Running <span className="mono tnum text-[13px]">{fmtDur(now - (runStart ?? now))}</span></>
            ) : sameTarget ? (
              <>{Icon.rerun()} Re-run {selected}</>
            ) : (
              <>{Icon.play()} Run {selected}</>
            )}
          </button>
          <div className="flex items-center gap-2 rounded-xl border border-hair bg-panel/80 py-1.5 pl-3 pr-1.5">
            <span className="mono min-w-0 flex-1 truncate text-[11.5px] text-dimfg"><span className="text-mutefg">$</span> {target.cmd}</span>
            <CopyButton text={target.cmd} label="Copy" />
          </div>
          <RecentRuns runs={recent} activeId={record?.id ?? null} onOpen={openRecord} />
        </aside>

        {/* RIGHT — pipeline+log (centre) and results (right) */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,390px)]">
          <div>
            <Pipeline stages={stages} now={now} discovery={discovery} outcome={outcome} phase={phase} runStart={runStart} total={record?.durationMs ?? null} compact />
            <LiveLog lines={log} running={running} />
          </div>

          <div>
            {phase === "error" && error ? (
              <div className="surface rise p-6" style={{ boxShadow: "inset 3px 0 0 0 #FF453A" }}>
                <div className="flex items-center gap-2 text-sm font-medium text-red">{Icon.x()} Run did not complete</div>
                <p className="mt-2 text-[13px] text-dimfg">{error.message}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="mono rounded-md border border-hair bg-ink/70 px-3 py-1.5 text-[12px] text-dimfg">$ {error.fallback}</span>
                  <CopyButton text={error.fallback} label="Copy fallback" />
                </div>
              </div>
            ) : phase === "done" && record ? (
              <div key={record.id} className="space-y-5">
                <VerdictHero rec={record} onRerun={() => run(record.target)} running={running} />
                <Contrast rec={record} />
                <Evidence rec={record} />
                <Proofs rec={record} />
                <FixGate rec={record} />
                <ScopeLine />
              </div>
            ) : (
              <EmptyResults running={running} />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) return content;
  return (
    <div className="relative min-h-screen">
      <Background />
      <Header online={mode === "live" ? true : mode === "replay" ? false : null} running={running} />
      {content}
    </div>
  );
}
