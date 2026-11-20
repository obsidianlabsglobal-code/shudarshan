import verifyData from "../data/verify.json";
import { useInView } from "../lib/useInView";
import { Chakra } from "./Chakra";

const v = verifyData as any;

function TridentBadge({ ok, title, desc, i, active }: { ok: boolean; title: string; desc: string; i: number; active: boolean }) {
  return (
    <div
      className={`flex items-start gap-3 transition-all duration-500 ${active ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      style={{ transitionDelay: `${i * 140}ms` }}
    >
      <span className={`mt-0.5 text-sm ${ok ? "text-green" : "text-red"}`}>{ok ? "✓" : "✗"}</span>
      <div>
        <div className="text-sm font-medium text-fg">{title}</div>
        <div className="text-xs text-mutefg">{desc}</div>
      </div>
    </div>
  );
}

export default function VerifyPanel() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  const f = v.finding;
  const frozen = v.frozen;
  const record: Record<string, string> = f?.leakedRecordMasked ?? {};
  const fields = Object.entries(record).filter(([k]) => k !== "id" && k !== "ownerId");

  return (
    <section className="border-t border-hair">
      <div ref={ref} className="mx-auto max-w-6xl px-6 py-24">
        <div className="flex items-center gap-2.5">
          <Chakra size={16} className="text-saffron" />
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-saffron">
            The differentiator · survives an AI rewrite
          </p>
        </div>
        <h2 className="mt-5 max-w-3xl text-balance text-[clamp(1.75rem,3.4vw,2.9rem)] font-semibold leading-[1.08] tracking-tight">
          A saved test says <span className="text-red">safe</span>. The live memory says{" "}
          <span className="text-green">caught</span>.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-dimfg">
          An AI refactored <span className="mono text-fg">{v.app}</span> — it moved the records route to{" "}
          <span className="mono text-fg">{f?.resource?.replace(/\/[^/]+$/, "")}</span> and dropped the ownership
          check. One command, <span className="mono text-fg">sudarshan verify</span>, runs two checks against the
          rewrite.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* LEFT — frozen saved test */}
          <div className="surface p-7 opacity-90">
            <div className="text-xs uppercase tracking-wider text-mutefg">What a saved test sees</div>
            <div className="mt-5 flex items-baseline gap-3">
              <span className="mono text-5xl font-semibold tracking-tight text-mutefg">{frozen?.verdict ?? "—"}</span>
              <span className="text-sm font-medium text-red">✗ false safety</span>
            </div>
            <div className="mt-6 rounded-lg border border-hair bg-ink/60 px-4 py-3 mono text-sm text-dimfg">
              <span className="text-mutefg">GET</span> {frozen?.path}{" "}
              <span className="text-red">→ {frozen?.status}</span>
            </div>
            <p className="mt-3 text-xs text-mutefg">
              The route moved, so the hard-coded path 404s and this saved test reads 404 as “blocked.” A stricter
              saved test (the real <span className="mono">to-test.ts</span>) instead FAILs as “app broke” — either way
              it never re-finds the route.
            </p>
          </div>

          {/* RIGHT — self-relocating memory */}
          <div className="surface spotlight relative overflow-hidden p-7 shadow-[inset_3px_0_0_0_#30D158]">
            <div className="text-xs uppercase tracking-wider text-mutefg">What the self-relocating memory sees</div>
            <div className="mt-5 flex items-baseline gap-3">
              <span className="mono text-5xl font-semibold tracking-tight text-green">{v.caught ? "CAUGHT" : "—"}</span>
            </div>
            <div className="mt-6 rounded-lg border border-hair bg-ink/60 px-4 py-3 mono text-sm text-dimfg">
              <span className="text-mutefg">GET</span> {f?.resource}{" "}
              <span className="text-green">→ {f?.controls?.attack}</span>
            </div>

            {/* leaked record card — reveals on scroll-in */}
            <div
              className={`mt-5 rounded-xl border border-red/30 bg-red/[0.05] p-5 transition-all duration-700 ${
                inView ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wider text-red">
                  Attacker ({f?.attacker}) read Victim ({f?.victim})'s private record
                </div>
                <div className="text-[10px] text-mutefg">masked</div>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                {fields.map(([k, val]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 border-b border-hair/50 pb-1.5">
                    <dt className="text-xs text-mutefg">{k}</dt>
                    <dd className="mono text-sm text-dimfg" title={val}>
                      {String(val).length > 16 ? String(val).slice(0, 16) + "…" : val}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>

        {/* proof trident strip */}
        <div className="surface mt-5 p-7">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <TridentBadge ok={!!v.trident?.marker} i={0} active={inView} title="Collision-safe marker" desc={`the leaked data is User ${f?.victim}'s own, absent from the attacker's`} />
            <TridentBadge ok={!!v.trident?.forgedDiscriminator} i={1} active={inView} title="Forged-token discriminator" desc={`wrong-secret token rejected (${f?.controls?.forged}) → an authorization flaw`} />
            <TridentBadge ok={!!v.trident?.selfRelocating} i={2} active={inView} title="Self-relocating" desc={`re-found ${f?.resource}, reproduced ×2`} />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hair pt-5 text-xs text-mutefg">
            <span className="flex items-center gap-2">
              <Chakra size={13} className="text-saffron" /> Deterministic · no LLM in the proof path
            </span>
            {v.fix?.accepted && (
              <span className="flex items-center gap-1.5">
                <span className="text-green">✓</span> fix accepted — legitimate user still {v.fix.legitStatus}
              </span>
            )}
            {v.benchmark && (
              <span className="rounded-full border border-hair px-2.5 py-0.5 mono text-dimfg">
                {v.benchmark.provable} of {v.benchmark.total} apps forgeable · 0 false positives
              </span>
            )}
          </div>
          <p className="mt-4 border-t border-hair pt-4 text-[11px] leading-relaxed text-mutefg">
            Scope: re-discovery is dictionary-based (known resource nouns + API prefixes), not semantic — a rename to an
            unknown noun returns <span className="text-dimfg">INCONCLUSIVE</span>, never a false{" "}
            <span className="text-dimfg">SECURE</span>. 0 false positives is by construction on the evaluated set.
          </p>
        </div>
      </div>
    </section>
  );
}
