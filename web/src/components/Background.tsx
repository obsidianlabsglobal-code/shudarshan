// Atmosphere layer — background #1: fine masked grid + one cool glow + a faint
// orbital field (hairline rings with slow-moving signals, one in signal-red).
// Swap `variant` to try the alternatives without touching anything else:
//   "grid"     — grid + glow + orbit field (default)
//   "aurora"   — two slow, low-opacity cool blooms
//   "vignette" — flat near-black with a soft radial vignette

// Hairline rings centred lower so the arcs sweep up behind the hero; a few
// signals ride each ring via SVG animateMotion. Zero dependencies.
function OrbitField() {
  const cx = 750;
  const cy = 860;
  const rings: { id: string; r: number; cls: string; dur: number; sats: { off: number; red?: boolean }[] }[] = [
    { id: "orb0", r: 520, cls: "ring", dur: 74, sats: [{ off: 0.1, red: true }] },
    { id: "orb1", r: 700, cls: "ring-faint", dur: 98, sats: [{ off: 0.42 }, { off: 0.79 }] },
    { id: "orb2", r: 900, cls: "ring", dur: 130, sats: [{ off: 0.6 }] },
  ];
  const pathFor = (r: number) => `M${cx} ${cy - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0 ${-2 * r}`;
  return (
    <svg className="bg-orbits" viewBox="0 0 1500 1500" aria-hidden="true">
      <defs>
        {rings.map((g) => (
          <path key={g.id} id={g.id} d={pathFor(g.r)} />
        ))}
      </defs>
      {rings.map((g) => (
        <circle key={g.id} className={g.cls} cx={cx} cy={cy} r={g.r} />
      ))}
      {rings.map((g) =>
        g.sats.map((s, j) => (
          <circle key={`${g.id}-${j}`} className={s.red ? "sat-red" : "sat"} r={s.red ? 2.6 : 2}>
            <animateMotion dur={`${g.dur}s`} repeatCount="indefinite" begin={`${-s.off * g.dur}s`} rotate="auto">
              <mpath href={`#${g.id}`} />
            </animateMotion>
          </circle>
        )),
      )}
    </svg>
  );
}

export default function Background({ variant = "grid" }: { variant?: "grid" | "aurora" | "vignette" }) {
  return (
    <div className="bg-layer" aria-hidden="true">
      {variant === "grid" && (
        <>
          <OrbitField />
          <div className="bg-grid" />
          <div className="bg-glow" />
        </>
      )}
      {variant === "aurora" && (
        <>
          <div
            className="absolute left-[12%] top-[-10%] h-[520px] w-[520px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(150,168,205,0.10), transparent 70%)" }}
          />
          <div
            className="absolute right-[8%] top-[18%] h-[460px] w-[460px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(130,150,185,0.08), transparent 70%)" }}
          />
        </>
      )}
      {variant === "vignette" && (
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(255,255,255,0.03), transparent 60%)" }}
        />
      )}
    </div>
  );
}
