// Sudarshan chakra — a spoked discus. Uses currentColor so callers tint it.
export function Chakra({ size = 22, className = "" }: { size?: number; className?: string }) {
  const c = 50;
  const outer = 44;
  const inner = 18;
  const spokes = Array.from({ length: 16 }, (_, i) => (i * 360) / 16);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true">
      <circle cx={c} cy={c} r={outer} fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx={c} cy={c} r={inner} fill="none" stroke="currentColor" strokeWidth="3.5" />
      {spokes.map((a, i) => {
        const rad = (a * Math.PI) / 180;
        return (
          <line
            key={i}
            x1={c + inner * Math.cos(rad)}
            y1={c + inner * Math.sin(rad)}
            x2={c + outer * Math.cos(rad)}
            y2={c + outer * Math.sin(rad)}
            stroke="currentColor"
            strokeWidth="2.2"
          />
        );
      })}
      <circle cx={c} cy={c} r="5.5" fill="currentColor" />
    </svg>
  );
}
