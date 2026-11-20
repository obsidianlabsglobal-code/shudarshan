import Hero from "./components/Hero";
import DotGrid from "./components/DotGrid";
import ToolComparison from "./components/ToolComparison";

export default function App() {
  return (
    <div className="min-h-screen bg-ink text-fg antialiased">
      <header className="sticky top-0 z-20 border-b border-hair/70 bg-ink/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red" />
            <span className="font-semibold tracking-tight">Sudarshan</span>
          </div>
          <div className="hidden text-sm text-mutefg sm:block">Proof-carrying API security</div>
        </div>
      </header>

      <main>
        <Hero />
        <DotGrid />
        <ToolComparison />
      </main>

      <footer className="border-t border-hair">
        <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-mutefg">
          Every number on this page is read directly from the scanner's output files. No figure is hand-entered.
        </div>
      </footer>
    </div>
  );
}
