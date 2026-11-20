import { useEffect, useRef, useState } from "react";
import { secret } from "../lib/loader";
import { useInView } from "../lib/useInView";

function Pill({ code, good }: { code: number; good: boolean }) {
  return (
    <span
      className={`mono rounded-md px-2 py-0.5 text-sm font-semibold ${
        good ? "bg-green/15 text-green" : "bg-red/15 text-red"
      }`}
    >
      {code}
    </span>
  );
}

export default function AttackStory() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.25 });
  const [step, setStep] = useState(-1);
  const timers = useRef<number[]>([]);

  const f = secret?.apps.find((a) => a.app === "app-24")?.findings?.[0] ?? null;

  const steps = [
    {
      k: "SECRET",
      title: "Read the secret from the app's own source.",
      body: (
        <div className="text-sm text-dimfg">
          No guessing — the fallback secret is written in plain code:{" "}
          <span className="mono text-fg">{f?.embeddedSecretMasked ?? "—"}</span>
        </div>
      ),
    },
    {
      k: "FORGE",
      title: "Mint a session token with it. No login. No password.",
      body: (
        <div className="mono rounded-lg border border-hair bg-panel px-4 py-3 text-sm text-dimfg">
          <span className="text-mutefg">{f?.evidence.forgedRequest.method ?? "GET"}</span>{" "}
          {f?.resource ?? "—"}
          <br />
          <span className="text-mutefg">authorization:</span> Bearer{" "}
          <span className="text-red">&lt;forged&gt;</span>
        </div>
      ),
    },
    {
      k: "REACH",
      title: "The server accepts it. The victim's record comes back.",
      body: (
        <div>
          <div className="flex items-center gap-2 text-sm text-dimfg">
            response <Pill code={f?.evidence.forgedStatus ?? 0} good={false} /> — another user's private record
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(f?.leakedFields ?? [])
              .filter((x) => x !== "id")
              .map((name) => (
                <span key={name} className="mono rounded-md border border-hair bg-panel2 px-2 py-1 text-xs text-dimfg">
                  {name}
                </span>
              ))}
          </div>
          <div className="mt-2 text-xs text-mutefg">
            field names only — values never shown · proof marker {f?.markerMasked ?? "—"}
          </div>
        </div>
      ),
    },
    {
      k: "PROOF",
      title: "The controls hold — so it's a finding, not a guess.",
      body: (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-dimfg">
          <span className="flex items-center gap-2">
            real login still works <Pill code={f?.evidence.legitUserStatus ?? 0} good />
          </span>
          <span className="flex items-center gap-2">
            an unknown secret is rejected <Pill code={f?.evidence.unknownSecretStatus ?? 0} good />
          </span>
          <span className="flex items-center gap-2">
            reproduced <span className="text-green">{f?.reproduced ? "✓ twice" : "—"}</span>
          </span>
        </div>
      ),
    },
    {
      k: "FIX",
      title: "Set a real secret, and the identical forge dies.",
      body: (
        <div className="flex items-center gap-2 text-sm text-dimfg">
          with <span className="mono text-fg">JWT_SECRET</span> set, the same forged request →{" "}
          <Pill code={401} good /> <span className="text-mutefg">(verified by the false-positive test)</span>
        </div>
      ),
    },
  ];

  function play() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStep(-1);
    steps.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setStep(i), 350 + i * 900));
    });
  }

  useEffect(() => {
    if (inView) play();
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  return (
    <section className="border-t border-hair">
      <div ref={ref} className="mx-auto max-w-4xl px-6 py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-mutefg">One finding, start to finish</p>
            <h2 className="mt-4 text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold tracking-tight">
              app-24 — a session forged from its own code.
            </h2>
          </div>
          <button
            onClick={play}
            className="rounded-lg border border-hair px-4 py-2 text-sm text-dimfg transition-colors hover:border-mutefg hover:text-fg"
          >
            ▸ Replay
          </button>
        </div>

        <ol className="mt-12 space-y-4">
          {steps.map((s, i) => {
            const on = step >= i;
            return (
              <li
                key={s.k}
                className={`rounded-2xl border p-6 transition-all duration-500 ${
                  on ? "translate-y-0 border-hair bg-panel opacity-100" : "translate-y-2 border-transparent opacity-30"
                }`}
              >
                <div className="flex items-baseline gap-3">
                  <span className="mono text-xs tracking-widest text-mutefg">{String(i + 1).padStart(2, "0")}</span>
                  <span className="mono text-xs tracking-widest text-mutefg">{s.k}</span>
                </div>
                <div className="mt-2 text-lg font-medium tracking-tight text-fg">{s.title}</div>
                <div className="mt-3">{s.body}</div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
