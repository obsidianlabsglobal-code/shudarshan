// Atmosphere layer — background #1: fine masked grid + one cool glow.
// Swap `variant` to try the alternatives without touching anything else:
//   "grid"     — fine grid that fades to the edges + a cool glow (default)
//   "aurora"   — two slow, low-opacity cool blooms
//   "vignette" — flat near-black with a soft radial vignette
export default function Background({ variant = "grid" }: { variant?: "grid" | "aurora" | "vignette" }) {
  return (
    <div className="bg-layer" aria-hidden="true">
      {variant === "grid" && (
        <>
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
