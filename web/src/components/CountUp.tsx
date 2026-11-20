import { useEffect, useState } from "react";

/** Animates 0 → value with an ease-out curve once `active` is true. Tabular. */
export function CountUp({
  value,
  active,
  duration = 1200,
  decimals = 0,
  className = "",
}: {
  value: number;
  active: boolean;
  duration?: number;
  decimals?: number;
  className?: string;
}) {
  const [v, setV] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(2, -10 * t); // easeOutExpo
      setV(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setV(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, value, duration]);

  return <span className={className}>{v.toFixed(decimals)}</span>;
}
