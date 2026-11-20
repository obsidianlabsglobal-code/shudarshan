import { stats, type StatBlock } from "../lib/loader";
import { useInView } from "../lib/useInView";
import { SpotlightCard } from "./SpotlightCard";

const AXIS_MAX = 0.3; // 30% — enough to show these intervals clearly

function pct(x: number) {
  return Math.min(100, Math.max(0, (x / AXIS_MAX) * 100));
}

function CIBar({ block, active }: { block: StatBlock; active: boolean }) {
  const ci = block.confidenceInterval95;
  if (!ci || block.rate === null) {
    return <div className="mt-5 text-sm text-mutefg">interval unavailable — {block.reason ?? "no denominator"}</div>;
  }
  const left = pct(ci.lower);
  const width = pct(ci.upper) - pct(ci.lower);
  return (
    <div>
      <div className="relative mt-5 h-2 rounded-full bg-hair">
        <div
          className="absolute inset-y-0 rounded-full bg-mutefg/45 transition-all duration-700 ease-out"
          style={{ left: `${left}%`, width: active ? `${width}%` : "0%" }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green ring-2 ring-ink transition-all duration-700"
          style={{ left: `${pct(block.rate)}%`, opacity: active ? 1 : 0 }}
        />
      </div>
      <div className="mt-2.5 flex justify-between text-[11px] text-mutefg">
        <span>0%</span>
        <span className="mono">
          95% CI {(ci.lower * 100).toFixed(1)}%–{(ci.upper * 100).toFixed(1)}%
        </span>
        <span>{AXIS_MAX * 100}%</span>
      </div>
    </div>
  );
}

export default function Rigor() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });

  const blocks: { label: string; stat: StatBlock | undefined }[] = [
    { label: "Apps that leak (authorization)", stat: stats?.appsLeaked },
    { label: "Sudarshan false positives", stat: stats?.falsePositives.sudarshan },
    { label: "Ownership lost after a feature add", stat: stats?.regressionOwnershipLoss },
  ];

  return (
    <section className="border-t border-hair">
      <div ref={ref} className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-mutefg">Measured, not asserted</p>
        <h2 className="mt-4 text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold tracking-tight">
          <span className="text-green">0 false positives</span> across 23 clean apps.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-dimfg">
          A zero result is still a claim about a sample, so we bound it. Two-sided 95% Wilson score intervals —
          a zero numerator does not imply a zero upper bound.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {blocks.map(({ label, stat }) => (
            <SpotlightCard key={label} className="p-7">
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
              {stat ? <CIBar block={stat} active={inView} /> : null}
            </SpotlightCard>
          ))}
        </div>

        <div className="mt-12 surface p-6">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-mutefg">Scope &amp; limits</div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-dimfg">
            n = 23 apps, one model (claude-sonnet-5-5), one architecture (JWT auth over REST CRUD), one prompt
            family. This is a measured signal under those conditions — not a population estimate for all AI-written
            code. Every figure above is read directly from the scanner's output files.
          </p>
        </div>
      </div>
    </section>
  );
}
