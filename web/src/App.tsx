import { authorization, secret, dash } from "./lib/loader";

export default function App() {
  return (
    <div className="min-h-screen bg-ink text-fg antialiased">
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red" />
            <span className="font-semibold tracking-tight">Sudarshan</span>
          </div>
          <div className="text-sm text-mutefg">Proof-carrying API security</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-28">
        <p className="text-xs uppercase tracking-[0.2em] text-mutefg">Data layer online</p>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-hair bg-panel p-7">
            <div className="text-sm text-mutefg">Authorization — apps leaked</div>
            <div className="mono mt-3 text-6xl font-semibold tracking-tight">
              {dash(authorization?.leaked)}
              <span className="text-2xl text-mutefg"> / {dash(authorization?.total)}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-hair bg-panel p-7">
            <div className="text-sm text-mutefg">Secret-handling — forgeable</div>
            <div className="mono mt-3 text-6xl font-semibold tracking-tight text-red">
              {dash(secret?.provableWeakness)}
              <span className="text-2xl text-mutefg"> / {dash(secret?.total)}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
