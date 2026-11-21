import { useInView } from "../lib/useInView";
import { Chakra } from "./Chakra";

// Feedback from Round 1 → what we changed. Sourced from the actual round-over-round
// changes in this repo's history (the README has no such table to mirror).
const ROWS: { feedback: string; change: string }[] = [
  {
    feedback: "“verify exits 0 even when it catches a vulnerability — it can’t gate CI.”",
    change: "Real exit codes: VULNERABLE → 1, INCONCLUSIVE → 2, NO_LEAK_DETECTED → 0. --watch stays tolerant.",
  },
  {
    feedback: "“calling a clean scan ‘SECURE’ overclaims.”",
    change: "Renamed the clean verdict to NO_LEAK_DETECTED — “no supported BOLA leak reproduced,” not a full audit.",
  },
  {
    feedback: "“a 0-of-10 regression result is too thin — show it generalizes and never false-clears.”",
    change: "Pre-registered rewrite benchmark: 25 route transformations, 0/21 vulnerable apps falsely cleared, Wilson 95% CIs, reproduced twice.",
  },
  {
    feedback: "“make it feel like a real, deployed tool — not a one-off script.”",
    change: "A local live console (sudarshan serve): pick an app, watch the four stages run, see the verdict and masked evidence.",
  },
  {
    feedback: "“ship something a judge can open.”",
    change: "Public dashboard on GitHub Pages, plus CI — typecheck, three-verdict self-test, dashboard build — green on every push.",
  },
];

export default function SinceRound1() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.15 });
  return (
    <section className="border-t border-hair">
      <div ref={ref} className="mx-auto max-w-6xl px-6 py-24">
        <div className="flex items-center gap-2.5">
          <Chakra size={16} className="text-saffron" />
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-saffron">Since Round 1</p>
        </div>
        <h2 className="mt-5 max-w-3xl text-balance text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold leading-[1.08] tracking-tight">
          Every change traces to a piece of feedback.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-dimfg">
          What the judges asked for, and what we shipped in response.
        </p>

        <div className="mt-12 surface overflow-hidden">
          {/* header row (md+) */}
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-6 border-b border-hair px-7 py-4 text-[11px] font-medium uppercase tracking-[0.18em] text-mutefg md:grid">
            <div>Feedback</div>
            <div>What we changed</div>
          </div>
          <ul>
            {ROWS.map((r, i) => (
              <li
                key={i}
                className={`grid grid-cols-1 gap-2 border-b border-hair/70 px-7 py-5 transition-all duration-500 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:gap-6 ${
                  inView ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                }`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="flex items-start gap-3">
                  <span className="mono mt-0.5 text-[11px] text-mutefg/70">{String(i + 1).padStart(2, "0")}</span>
                  <p className="text-[13.5px] leading-relaxed text-dimfg">{r.feedback}</p>
                </div>
                <div className="flex items-start gap-3 md:border-l md:border-hair/60 md:pl-6">
                  <span className="mt-1.5 hidden h-1.5 w-1.5 shrink-0 rounded-full bg-green md:block" />
                  <p className="text-[13.5px] leading-relaxed text-fg">{r.change}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
