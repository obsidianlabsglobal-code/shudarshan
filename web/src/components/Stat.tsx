import { CountUp } from "./CountUp";
import { SpotlightCard } from "./SpotlightCard";
import { dash } from "../lib/loader";

type Tone = "red" | "green" | "neutral";

const toneClass: Record<Tone, string> = {
  red: "text-red",
  green: "text-green",
  neutral: "text-fg",
};

/** A labelled statistic block with an instrument-grade, count-up numeral. */
export function Stat({
  value,
  total,
  label,
  sub,
  tone = "neutral",
  active,
  decimals = 0,
  suffix = "",
}: {
  value: number | null;
  total?: number | null;
  label: string;
  sub?: string;
  tone?: Tone;
  active: boolean;
  decimals?: number;
  suffix?: string;
}) {
  return (
    <SpotlightCard className="p-7">
      <div className="text-sm font-medium text-mutefg">{label}</div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className={`mono text-6xl font-semibold tracking-tight ${toneClass[tone]}`}>
          {value === null ? "—" : <CountUp value={value} active={active} decimals={decimals} />}
          {value !== null && suffix}
        </span>
        {total !== undefined && (
          <span className="mono text-xl text-mutefg">/ {dash(total)}</span>
        )}
      </div>
      {sub && <div className="mt-3 text-sm text-dimfg">{sub}</div>}
    </SpotlightCard>
  );
}
