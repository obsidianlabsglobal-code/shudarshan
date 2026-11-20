import { authorization, secret, gitleaks, llmReview, dash } from "../lib/loader";
import { useInView } from "../lib/useInView";
import { CountUp } from "./CountUp";

interface Row {
  tool: string;
  desc: string;
  metric: number | null;
  metricLabel: string;
  tone: "red" | "neutral";
  fp: number | null;
  speed: number | null;
  note: string;
  highlight: boolean;
}

export default function ToolComparison() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  const gitleaksSpeed = gitleaks ? gitleaks.totalDurationMs / 1000 / gitleaks.apps : null;

  const rows: Row[] = [
    {
      tool: "gitleaks",
      desc: "secret scanner — regex + entropy",
      metric: gitleaks?.totalFindings ?? null,
      metricLabel: "secrets found",
      tone: "neutral",
      fp: gitleaks ? 0 : null,
      speed: gitleaksSpeed,
      note: "Blind to a low-entropy secret written in plain code.",
      highlight: false,
    },
    {
      tool: "LLM review",
      desc: "a model reads the source",
      metric: llmReview?.totalFlags ?? null,
      metricLabel: "flags, none proven",
      tone: "neutral",
      fp: null,
      speed: null,
      note: "Flags are unverified — no way to tell a real bug from noise.",
      highlight: false,
    },
    {
      tool: "Sudarshan",
      desc: "runs the exploit, demands proof",
      metric: secret?.provableWeakness ?? null,
      metricLabel: "forgeable, proven",
      tone: "red",
      fp: secret?.falsePositives ?? null,
      speed: authorization?.avgSecondsPerApp ?? null,
      note: "Each one demonstrated end to end: forge, reach the data, reproduce.",
      highlight: true,
    },
  ];

  return (
    <section className="border-t border-hair">
      <div ref={ref} className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-mutefg">Same 23 apps, three tools</p>
        <h2 className="mt-4 text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold tracking-tight">
          Only one tool could <span className="text-red">prove</span> it.
        </h2>

        <div className="surface mt-12 overflow-hidden rounded-2xl">
          {/* header */}
          <div className="hidden grid-cols-[1.4fr_1fr_0.8fr_0.8fr] gap-4 border-b border-hair bg-panel px-6 py-3 text-xs uppercase tracking-wider text-mutefg sm:grid">
            <div>Tool</div>
            <div>Reported</div>
            <div>False positives</div>
            <div>Speed</div>
          </div>

          {rows.map((r) => (
            <div
              key={r.tool}
              className={`grid grid-cols-1 gap-4 border-b border-hair px-6 py-6 last:border-b-0 sm:grid-cols-[1.4fr_1fr_0.8fr_0.8fr] sm:items-center ${
                r.highlight ? "bg-red/[0.06] shadow-[inset_3px_0_0_0_#FF453A]" : "bg-ink"
              }`}
            >
              <div>
                <div className={`font-semibold tracking-tight ${r.highlight ? "text-fg" : "text-fg"}`}>{r.tool}</div>
                <div className="mt-0.5 text-sm text-mutefg">{r.desc}</div>
              </div>

              <div className="flex items-baseline gap-2">
                <span className={`mono text-4xl font-semibold tracking-tight ${r.tone === "red" ? "text-red" : "text-fg"}`}>
                  {r.metric === null ? "—" : <CountUp value={r.metric} active={inView} />}
                </span>
                <span className="text-sm text-mutefg">{r.metricLabel}</span>
              </div>

              <div className="mono text-lg text-dimfg">
                {r.fp === null ? <span className="text-mutefg">unknown</span> : r.fp === 0 ? <span className="text-green">0</span> : r.fp}
              </div>

              <div className="mono text-lg text-dimfg">
                {r.speed === null ? "—" : `${r.speed.toFixed(2)}s`}
                {r.speed !== null && <span className="text-sm text-mutefg">/app</span>}
              </div>

              <div className="text-sm text-dimfg sm:col-span-4">{r.note}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
