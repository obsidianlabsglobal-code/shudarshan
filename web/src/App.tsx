import Background from "./components/Background";
import Hero from "./components/Hero";
import VerifyPanel from "./components/VerifyPanel";
import DotGrid from "./components/DotGrid";
import { Chakra } from "./components/Chakra";
import ToolComparison from "./components/ToolComparison";
import AttackStory from "./components/AttackStory";
import Rigor from "./components/Rigor";

export default function App() {
  return (
    <div className="relative min-h-screen bg-ink text-fg antialiased">
      <Background variant="grid" />

      <div className="relative z-10">
        <header className="sticky top-0 z-20 border-b border-hair/70 bg-ink/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2.5">
              <Chakra size={18} className="text-saffron" />
              <span className="font-semibold tracking-tight">Sudarshan</span>
            </div>
            <div className="hidden text-sm text-mutefg sm:block">Proof-carrying API security</div>
          </div>
        </header>

        <main>
          <Hero />
          <VerifyPanel />
          <DotGrid />
          <ToolComparison />
          <AttackStory />
          <Rigor />
        </main>

        <footer className="border-t border-hair">
          <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-mutefg">
            Every number on this page is read directly from the scanner's output files. No figure is hand-entered.
          </div>
        </footer>
      </div>
    </div>
  );
}
