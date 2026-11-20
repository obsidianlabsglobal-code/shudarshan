import { secret } from "../lib/loader";
import { useInView } from "../lib/useInView";
import { CountUp } from "./CountUp";

function Dot({ app, forgeable, i, active }: { app: string; forgeable: boolean; i: number; active: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div
        className={`h-11 w-11 rounded-full transition-all duration-500 ease-out ${
          active ? "scale-100 opacity-100" : "scale-50 opacity-0"
        } ${
          forgeable
            ? "bg-red shadow-[0_0_22px_rgba(255,69,58,0.65)]"
            : "bg-green/20 ring-1 ring-inset ring-green/45"
        }`}
        style={{ transitionDelay: `${i * 35}ms` }}
        title={`${app} — ${forgeable ? "forgeable session" : "secure"}`}
      />
      <span className="mono text-[10px] tabular-nums text-mutefg">{app.replace("app-", "")}</span>
    </div>
  );
}

function Legend({ tone, label, n, active }: { tone: "red" | "green"; label: string; n: number; active: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`h-3 w-3 rounded-full ${tone === "red" ? "bg-red shadow-[0_0_10px_rgba(255,69,58,0.6)]" : "bg-green/25 ring-1 ring-green/50"}`}
      />
      <span className="text-sm text-mutefg">
        <span className="mono text-fg">
          <CountUp value={n} active={active} />
        </span>{" "}
        {label}
      </span>
    </div>
  );
}

export default function DotGrid() {
  const apps = secret?.apps ?? [];
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  const forgeable = secret?.provableWeakness ?? 0;
  const safe = apps.length - forgeable;

  return (
    <section className="border-t border-hair">
      <div ref={ref} className="mx-auto max-w-6xl px-6 py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-mutefg">
              The whole finding, at a glance
            </p>
            <h2 className="mt-4 text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold tracking-tight">
              23 apps. <span className="text-red">{forgeable} forgeable.</span>
            </h2>
          </div>
          <div className="flex gap-7">
            <Legend tone="red" label="forgeable session" n={forgeable} active={inView} />
            <Legend tone="green" label="secure" n={safe} active={inView} />
          </div>
        </div>

        <div className="mt-16 grid grid-cols-6 justify-items-center gap-5 sm:grid-cols-8 lg:grid-cols-12">
          {apps.map((a, i) => (
            <Dot key={a.app} app={a.app} forgeable={(a.findings?.length ?? 0) > 0} i={i} active={inView} />
          ))}
        </div>

        <p className="mt-12 max-w-2xl text-sm leading-relaxed text-dimfg">
          Same prompt, same model. Six apps fall back to a secret embedded in their own source — forge a
          token with it and you are any user, no password required. Nothing in the running app looks any
          different from the seventeen that are safe.
        </p>
      </div>
    </section>
  );
}
