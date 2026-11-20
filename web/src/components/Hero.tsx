import { useEffect, useState } from "react";
import { authorization, secret, dash } from "../lib/loader";
import { CountUp } from "./CountUp";
import { Stat } from "./Stat";

export default function Hero() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const forgeable = secret?.provableWeakness ?? null;
  const total = secret?.total ?? null;
  const secured = secret ? secret.total - secret.provableWeakness : null;

  return (
    <section className="mx-auto max-w-6xl px-6 pb-24 pt-24 sm:pt-28">
      <p className="text-xs font-medium uppercase tracking-[0.25em] text-mutefg">
        Same prompt · 23 apps · one model
      </p>

      <h1 className="mt-8 max-w-4xl text-balance text-[clamp(2rem,4.6vw,3.5rem)] font-semibold leading-[1.06] tracking-tight">
        The AI secured <span className="text-green">{dash(secured)}</span> and left{" "}
        <span className="text-red">{dash(forgeable)}</span> forgeable
        <span className="text-mutefg"> — and nothing visible tells you which.</span>
      </h1>

      <div className="mt-14 flex flex-wrap items-end gap-x-7 gap-y-2">
        <div className="mono text-[clamp(5rem,15vw,11rem)] font-bold leading-[0.82] tracking-tighter text-red">
          {forgeable === null ? "—" : <CountUp value={forgeable} active={active} />}
        </div>
        <div className="mb-3 text-lg leading-tight text-mutefg">
          of <span className="mono text-fg">{dash(total)}</span> generated apps
          <br />
          ship a forgeable session.
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Stat
          label="Authorization (object-level)"
          value={authorization?.leaked ?? null}
          total={authorization?.total ?? null}
          tone="green"
          active={active}
          sub="apps that leak another user's record — 0 false positives"
        />
        <Stat
          label="Secret-handling (session forgery)"
          value={secret?.provableWeakness ?? null}
          total={secret?.total ?? null}
          tone="red"
          active={active}
          sub="apps whose session can be forged with no password — 0 false positives"
        />
      </div>
    </section>
  );
}
