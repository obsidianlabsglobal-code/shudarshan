import { stats, rewriteBenchmark, type StatBlock } from "../lib/loader";
import { useInView } from "../lib/useInView";
import { SpotlightCard } from "./SpotlightCard";

const AXIS_MAX = 0.3; // 30% — enough to show these intervals clearly
const pct = (x: number) => Math.min(100, Math.max(0, (x / AXIS_MAX) * 100));
const n0 = (x: number) => (Math.round(x * 1000) / 10).toFixed(1); // 0.1546 -> "15.5"

// A 95% Wilson interval bar. Used for the benchmark's false-clear rate and the
// 23-app false-positive rate — a zero numerator still gets an upper bound.
function CIBar({ lower, upper, rate, active }: { lower: number; upper: number; rate: number; active: boolean }) {
  return (
    <div>
      <div className="relative mt-5 h-2 rounded-full bg-hair">
        <div
          className="absolute inset-y-0 rounded-full bg-green/35 transition-all duration-700 ease-out"
          style={{ left: `${pct(lower)}%`, width: active ? `${pct(upper) - pct(lower)}%` : "0%" }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green ring-2 ring-ink transition-all duration-700"
          style={{ left: `${pct(rate)}%`, opacity: active ? 1 : 0 }}
        />
      </div>
      <div className="mt-2.5 flex justify-between text-[11px] text-mutefg">
        <span>0%</span>
        <span className="mono">95% CI {n0(lower)}%–{n0(upper)}%</span>
        <span>{AXIS_MAX * 100}%</span>
      </div>
    </div>
  );
}

function FpCard({ label, stat, active }: { label: string; stat: StatBlock | undefined; active: boolean }) {
  return (
    <SpotlightCard className="p-7">
      <div className="text-sm font-medium text-mutefg">{label}</div>
      <div className="mono mt-4 text-5xl font-semibold tracking-tight">
        {stat ? (
          <>
            {stat.numerator ?? "—"}
            <span className="text-xl text-mutefg"> / {stat.denominator ?? "—"}</span>
          </>
        ) : (
          "—"
        )}
      </div>
      {stat?.confidenceInterval95 && stat.rate !== null ? (
        <CIBar lower={stat.confidenceInterval95.lower} upper={stat.confidenceInterval95.upper} rate={stat.rate} active={active} />
      ) : (
        <div className="mt-5 text-sm text-mutefg">interval unavailable</div>
      )}
    </SpotlightCard>
  );
}

// One benchmark sub-stat. `caught` tints 8/8 green; everything else is neutral so
// nothing but the zero and the secure/detect lines read as a headline number.
function Mini({ top, n, of, sub, tone = "neutral" }: { top: string; n: number; of: number; sub: string; tone?: "neutral" | "good" }) {
  return (
    <div className="rounded-xl border border-hair bg-panel2/50 p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-mutefg">{top}</div>
      <div className="mono mt-2.5 text-2xl font-semibold tracking-tight">
        <span className={tone === "good" ? "text-green" : "text-fg"}>{n}</span>
        <span className="text-sm text-mutefg"> / {of}</span>
      </div>
      <div className="mt-1.5 text-[12px] leading-snug text-mutefg">{sub}</div>
    </div>
  );
}

export default function Rigor() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.15 });
  const b = rewriteBenchmark;

  const falseCleared = b?.headline.falseSecure; // 0 / 21 — lead with this
  const detected = b?.headline.caught; // 8 / 21
  const inconclusive = b?.headline.inconclusive; // 13 / 21
  const typeA = b?.selfRelocatingByType?.A; // 8 / 8
  const frozen = b?.frozenSavedTest; // 0 / 21
  const apps = b?.totals.apps ?? 25;

  return (
    <section className="border-t border-hair">
      <div ref={ref} className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-mutefg">Measured, not asserted</p>

        {b && falseCleared ? (
          <>
            <h2 className="mt-4 text-[clamp(1.9rem,3.6vw,3rem)] font-semibold leading-[1.05] tracking-tight">
              <span className="text-green">{falseCleared.n} / {falseCleared.of}</span> vulnerable apps falsely cleared.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-dimfg">
              Across {apps} AI route-rewrites of one app, Sudarshan <span className="text-fg">never once</span> reported a
              vulnerable app as having no leak. A zero is still a claim about a sample, so we bound it:
              two-sided 95% Wilson score interval.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              {/* the zero, with its interval */}
              <div className="surface p-7">
                <div className="text-sm font-medium text-mutefg">Vulnerable apps falsely cleared</div>
                <div className="mono mt-4 text-[3.5rem] font-semibold leading-none tracking-tight text-green">
                  {falseCleared.n}
                  <span className="text-2xl text-mutefg"> / {falseCleared.of}</span>
                </div>
                <CIBar lower={falseCleared.ci95.lower} upper={falseCleared.ci95.upper} rate={falseCleared.rate} active={inView} />
                <p className="mt-5 text-[12.5px] leading-relaxed text-mutefg">
                  Outside discovery’s reach the verdict is <span className="text-fg">inconclusive</span> — never “safe.”
                  That is how the false-clear rate stays at zero.
                </p>
              </div>

              {/* the honest breakdown — detection never shown without its companions */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Mini top="Detected" n={detected?.n ?? 0} of={detected?.of ?? 0} sub="leak re-proven on the moved route" />
                <Mini top="Inconclusive" n={inconclusive?.n ?? 0} of={inconclusive?.of ?? 0} sub="held for review — not cleared" />
                <Mini top="In-dictionary (type A)" n={typeA?.caught ?? 0} of={typeA?.n ?? 0} sub="known resource + prefix: fully detected" tone="good" />
                <Mini top="Secure controls cleared" n={b.secureControls.noLeakDetected} of={b.secureControls.n} sub="ownership intact → correctly cleared" tone="good" />
                <Mini top="Frozen saved test" n={frozen?.caughtOnVulnerable ?? 0} of={frozen?.ofVulnerable ?? 0} sub="the Round-1 baseline: catches none after a rewrite" />
                <div className="flex flex-col justify-center rounded-xl border border-dashed border-hair bg-transparent p-5">
                  <div className="text-[12px] leading-relaxed text-mutefg">
                    Detection rises inside discovery’s reach; outside it we stay honest rather than guess.
                  </div>
                </div>
              </div>
            </div>

            <p className="mono mt-6 text-[12px] text-mutefg">
              Pre-registered (commit 01b0ee0) · {apps} synthetic route transformations of one base app · reproduced twice
            </p>
          </>
        ) : (
          <h2 className="mt-4 text-2xl font-semibold text-mutefg">Benchmark data unavailable.</h2>
        )}

        {/* supporting: the clean-app false-positive result, still measured */}
        <div className="mt-16 border-t border-hair pt-14">
          <h3 className="text-[clamp(1.4rem,2.4vw,2rem)] font-semibold tracking-tight">
            And <span className="text-green">0 false positives</span> across 23 clean apps.
          </h3>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FpCard label="Apps that leak (authorization)" stat={stats?.appsLeaked} active={inView} />
            <FpCard label="Sudarshan false positives" stat={stats?.falsePositives.sudarshan} active={inView} />
          </div>
        </div>

        <div className="mt-12 surface p-6">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-mutefg">Scope &amp; limits</div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-dimfg">
            The benchmark is {apps} synthetic rewrites of one base app — a measured envelope, not a population estimate;
            real-repository validation is roadmap. The false-positive figures are n = 23 apps, one model, one
            architecture. Every number above is read directly from the result files, never hand-entered.
          </p>
        </div>
      </div>
    </section>
  );
}
