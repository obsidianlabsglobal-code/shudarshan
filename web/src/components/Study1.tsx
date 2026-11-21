import { secret, authorization, gitleaks, llmReview } from "../lib/loader";
import { useInView } from "../lib/useInView";
import { Chakra } from "./Chakra";

// Study 1 — all numbers read from eval/results/*.json via the loader; none typed.
export default function Study1() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.15 });
  const total = secret?.total ?? 23;
  const forgeable = secret?.provableWeakness ?? null; // 6
  const secure = secret?.clean ?? (forgeable != null ? total - forgeable : null); // 17
  const leaked = authorization?.leaked ?? null; // 0
  const flags = llmReview?.totalFlags ?? null; // 33
  const authzFlags = llmReview?.categories?.["authorization / access control"] ?? 0; // 0
  const gl = gitleaks?.totalFindings ?? null; // 0

  const facts: { n: string; label: string; tone: "bad" | "good" | "neutral" }[] = [
    { n: `${forgeable ?? "—"} / ${total}`, label: "shipped a login anyone could forge", tone: "bad" },
    { n: `${secure ?? "—"} / ${total}`, label: "secure", tone: "good" },
    { n: `${leaked ?? "—"} / ${total}`, label: "leaked data across users (first versions)", tone: "good" },
    { n: `${flags ?? "—"} flags · ${authzFlags}`, label: `AI code reviewer: ${flags ?? "—"} flags, 0 about authorization · gitleaks: ${gl ?? "—"}`, tone: "neutral" },
  ];

  return (
    <section className="border-t border-hair">
      <div ref={ref} className="mx-auto max-w-[1280px] px-6 py-20">
        <div className="flex items-center gap-2.5">
          <Chakra size={16} className="text-saffron" />
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-saffron">Study 1</p>
        </div>
        <h2 className="mt-5 max-w-3xl text-balance text-[clamp(1.7rem,3.2vw,2.6rem)] font-semibold leading-[1.08] tracking-tight">
          We asked an AI to build {total} apps.
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((f, i) => (
            <div
              key={i}
              className={`surface p-6 transition-all duration-500 ${inView ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div
                className="mono text-3xl font-semibold tracking-tight"
                style={{ color: f.tone === "bad" ? "#FF453A" : f.tone === "good" ? "#30D158" : "#F3EFE7" }}
              >
                {i === 3 ? `${flags ?? "—"}` : f.n}
              </div>
              <p className="mt-2 text-[12.5px] leading-snug text-dimfg">
                {i === 3 ? (
                  <>flags from the AI code reviewer — <span className="text-fg">0 about authorization</span> · gitleaks: {gl ?? "—"}</>
                ) : (
                  f.label
                )}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-dimfg">
          Same AI, same kind of prompt — different security, invisible from outside. The first version is usually fine;
          the danger is the rewrite. That’s Study 2 below.
        </p>
      </div>
    </section>
  );
}
