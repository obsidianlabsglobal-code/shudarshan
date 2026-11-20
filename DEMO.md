# Sudarshan — 90-second demo (golden path)

Team ANVORA · The Big Hack 2.0 · AI Research R1

**One line:** Sudarshan proves a security flaw by *attacking the running app*, and keeps the proof as memory — so when an AI rewrite **moves** the vulnerability, it re-discovers the route and re-proves the leak, where a frozen saved test false-passes (or misfires as "app broke"). Neither frozen case re-finds the flaw; the self-relocating memory does.

Runner used below: `npm run sudarshan -- verify <dir>` (alias for `npx tsx engine/cli.ts verify <dir>`).

---

## Setup (before you present)

- At repo root: `npm install` done. Clean ports: `pkill -f tsx` if anything is running.
- Two things on screen: a **terminal** (repo root) and the **dashboard** (`cd web && npm run dev`, or the deployed URL).
- Dry-run once: `npm run sudarshan -- verify victim/app-51` → ~3s, prints **CAUGHT**. It's deterministic (5/5).
- Keep a screen-capture of this golden path as a safety net.

---

## The 90 seconds

**1 · (0:00) The safe app.** "This is a clinic-records API. It's safe — ask for someone else's record and you get a 404. A saved security test passes. Good."
- optional: `npm run sudarshan -- verify victim/app-50` → self-relocating finds nothing.

**2 · (0:15) The AI rewrite.** "Now an AI *modernises* it — moves records to `/api/v2/items` and, in the refactor, drops the ownership check. That's `victim/app-51`, labelled as an induced regression in the source."
- show the header comment in `victim/app-51/server.ts`. "The saved test still points at the old `/records` route."

**3 · (0:30) The differentiator — one command.** `npm run sudarshan -- verify victim/app-51`
- Point at **PROVE**: "The frozen saved test says **PASS — false safety**. It hit the old route, got 404, assumed blocked. (The stricter real `to-test.ts` instead **FAILs as 'app broke'**. Neither re-finds the route.)"
- "**Self-relocating: CAUGHT.** It re-discovered `/api/v2/items/:id` and proved the leak."

**4 · (0:50) The visceral leak.** "Here's the actual stolen data: **Attacker (B) read Victim (A)'s private record** — patient, phone, account number, reason-for-visit. Masked, but real. A status code just became a person's medical record."

**5 · (1:05) The proof — deterministic, no LLM.** "Three proofs: the data is provably the victim's own (**collision-safe marker**), a **forged token is rejected** so it's an authorization flaw not broken login, and it **survived the rewrite**. And the **FIX** is accepted *only because the legitimate user still gets 200*."

**6 · (1:20) The kill shot — close the session.** "I'll close this AI session completely." *(close the terminal / open a fresh shell)*
- new shell: `npm run sudarshan -- verify victim/app-51` → **CAUGHT**.
- "The memory isn't in the session — it's in the repo. Still caught."

**7 · (1:30) The dashboard.** Switch to the before/after panel: *"A saved test says safe. The live memory says caught."* Point at the proof-trident strip and the masked leaked-record card.

---

## DevX beat (optional)

`npm run sudarshan -- verify victim/app-51 --watch` → edit `victim/app-51/server.ts`, save → it re-verifies automatically. "Security re-checks on every save — zero commands, without slowing the developer."

---

## The honesty line (say it, don't hide it)

> "To be straight: we prove **two flaw classes** — broken object-level authorization and hard-coded-secret session forgery. We **induced this one regression ourselves** and **labelled it in the source**. Everything runs on **localhost against our own synthetic apps**. And `verify.ts` — status codes, byte matching, identity — is the **final authority; no LLM decides pass or fail**. Measured across 23 AI-generated apps: **6 forgeable, 0 false positives**."

---

## Scope & honest limits

What we claim is exactly what the engine does — no more:

- **Re-discovery is dictionary-based, not semantic.** After a rewrite we re-find the moved route by probing known resource nouns across common API prefixes (`/api`, `/api/v1`, `/api/v2`, …). If an AI renames the resource to a noun *outside* that dictionary, the result is **INCONCLUSIVE (exit 2)** — we say "could not locate the endpoint," never a false **NO_LEAK_DETECTED**. (`victim/app-52` demonstrates this: route renamed to `/api/v2/manifests`, a real leak the scanner honestly can't reach.)
- **The fix is a deterministic BOLA template, not automated repair.** We restore the ownership check and re-attack to confirm it; we don't claim to auto-patch arbitrary code.
- **"0 false positives" is by construction on the evaluated set, not a population rate.** `verify.ts` only reports a leak it re-proved live (status + byte-match + identity), so across the 23 evaluated apps there were 0 false positives — that's a property of the gate, not a measured rate over all possible apps.
- **Survival comes from re-proving via discovery.** The proof persists in the repo and is re-earned on each run. A persisted, path-independent ownership invariant (so survival doesn't depend on the dictionary at all) is the stated roadmap, not a current claim.

Verdicts & CI exit codes: **VULNERABLE → exit 1** · **INCONCLUSIVE → exit 2** · **NO_LEAK_DETECTED → exit 0** (no supported BOLA leak reproduced — tested: per-object ownership; not a full security audit). `--watch` stays running regardless.

---

## Fallback ladder (if short on time or something breaks)

- Verify errored? `pkill -f tsx`, re-run — it's deterministic.
- No dashboard? The CLI contrast lands on its own.
- The pre-recorded capture of the golden path is the safety net.
- Never cut steps 3–4 (the contrast + the leak). Everything else is enhancement.
