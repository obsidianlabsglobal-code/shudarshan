import { useState } from "react";
import Background from "./components/Background";
import { Chakra } from "./components/Chakra";
import Console from "./console/Console";
import SinceRound1 from "./components/SinceRound1";
import Study1 from "./components/Study1";
import ToolComparison from "./components/ToolComparison";
import Rigor from "./components/Rigor";

const REPO = "https://github.com/obsidianlabsglobal-code/shudarshan";
const METHODOLOGY = `${REPO}/blob/main/docs/METHODOLOGY.md`;

type Tab = "console" | "evidence";

export default function App() {
  const [tab, setTab] = useState<Tab>("console");

  const navBtn = (id: Tab, label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(id);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      aria-current={tab === id ? "page" : undefined}
      className={`focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
        tab === id ? "bg-saffron/15 text-saffron2" : "text-mutefg hover:text-fg"
      }`}
    >
      {label}
    </button>
  );

  const extLink = (href: string, label: string) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium text-mutefg transition-colors hover:text-fg"
    >
      {label} <span aria-hidden className="text-mutefg/60">↗</span>
    </a>
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-ink text-fg antialiased">
      <Background variant="grid" />

      <div className="relative z-10">
        <header className="sticky top-0 z-30 border-b border-hair/70 bg-ink/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-5 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <Chakra size={18} className="shrink-0 text-saffron2" />
              <span className="font-semibold tracking-tight">Sudarshan</span>
              <span className="hidden text-[13px] text-mutefg sm:inline">· API security that survives the rewrite</span>
            </div>
            <nav className="flex items-center gap-0.5 sm:gap-1">
              {navBtn("console", "Console")}
              {navBtn("evidence", "Evidence")}
              <span className="mx-0.5 hidden h-4 w-px bg-hair sm:block" />
              {extLink(REPO, "GitHub")}
            </nav>
          </div>
        </header>

        <div className="border-b border-hair/60 bg-ink/40">
          <div className="mx-auto max-w-[1280px] px-5 py-2.5 text-[12.5px] leading-snug text-dimfg sm:px-6">
            Checks whether one user can see another user\u2019s private data — and keeps checking after AI rewrites your app.
          </div>
        </div>

        <main>
          {tab === "console" ? (
            <Console embedded forceReplay />
          ) : (
            <div>
              <SinceRound1 />
              <Study1 />
              <Rigor />
              <ToolComparison />
              <div className="mx-auto max-w-[1280px] px-6 pb-16">
                <a href={METHODOLOGY} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-2 rounded-lg border border-hair bg-panel2/60 px-4 py-2.5 text-[13px] font-medium text-dimfg transition-colors hover:border-saffron/50 hover:text-fg">
                  Read the full methodology <span aria-hidden>↗</span>
                </a>
              </div>
            </div>
          )}
        </main>

        <footer className="border-t border-hair">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-1 px-6 py-8 text-[13px] text-mutefg">
            <span>Every number is read from the scanner's own output files. Replays reproduce a real recorded CLI run — never fabricated.</span>
            <span className="text-mutefg/70">Team ANVORA · localhost · synthetic data</span>
            <a href={METHODOLOGY} target="_blank" rel="noreferrer" className="focus-ring mt-1 inline-flex w-fit items-center gap-1 text-mutefg transition-colors hover:text-fg">Methodology <span aria-hidden>↗</span></a>
          </div>
        </footer>
      </div>
    </div>
  );
}
