# Architecture

Sudarshan is a small TypeScript system with one rule: **the verdict is decided by deterministic code, never by a model.** Everything else — the live console, the dashboard — is a presentation layer over that decision.

## Components

| Path | Responsibility |
|---|---|
| `engine/discover.ts` | Locates the login and resource endpoints on the **current** code, signs in as two seeded test users, and attempts a cross-user read. Probes known resource names across common API prefixes, so a moved route is re-found. |
| `engine/verify.ts` | The deterministic judge. Accepts a finding only when all checks pass (see *Proof* below). The sole authority on pass/fail. |
| `engine/verifyflow.ts` | Orchestrates one verification: PROVE → FIX → CHECK → REMEMBER, computes the verdict and exit code, and writes the result artifact. |
| `engine/secret.ts` | A separate check for forgeable session secrets (the 6/23 finding). |
| `engine/to-test.ts` | Generates a saved, route-pinned regression test — used as the *baseline* we compare against. |
| `engine/serverctl.ts` | Starts and stops target apps in isolated process groups and waits for ports, so every run is clean and reproducible. |
| `engine/cli.ts` | Command-line entry point: `verify`, `serve`, `scan`, `secret-all`. |
| `engine/serve.ts` | Local live console (`sudarshan serve`): binds to `127.0.0.1`, allowlisted demo apps only, streams the CLI's own output to the browser. |
| `engine/selftest.ts` | Asserts the three demo verdicts and their exit codes; run by `npm test` and CI. |
| `shared/` | Shared types and evidence masking. |
| `victim/` | Demo targets: app-50 (secure), app-51 (AI-rewritten, ownership dropped), app-52 (renamed outside the dictionary). |
| `web/` | The dashboard (React + Vite + Tailwind), deployed to GitHub Pages. |
| `eval/` | The 23-app study, the rewrite benchmark, baselines, and statistics. |

## The `verify` pipeline

1. **PROVE** — re-discover endpoints on the current code and attempt the cross-user read. Compare against the frozen, route-pinned baseline test.
2. **FIX** — if a fixed variant exists, verify it: the cross-user read must now fail **and** the legitimate owner must still succeed. Sudarshan verifies a proposed fix; it does not generate one.
3. **CHECK** — record which proofs held.
4. **REMEMBER** — write the result to the repository, so it survives a session restart and is re-earned on the next run.

## Proof (why a finding is not a guess)

A finding is accepted only when all of the following hold:

- **Victim-only marker** — the response contains a field present in the victim's record and absent from the attacker's own data, so the data provably belongs to someone else.
- **Wrong-secret control** — a token signed with the wrong secret is rejected, so the server does check identity and the flaw is an *authorization* failure rather than broken login.
- **Controls** — the owner's own request succeeds and an anonymous request is rejected.
- **Reproduction** — the result repeats.

## Verdict model

| Verdict | Exit | Meaning |
|---|---|---|
| `VULNERABLE` | 1 | A cross-user read was proven with runtime evidence. |
| `INCONCLUSIVE` | 2 | The endpoint could not be located or tested. Never reported as safe. |
| `NO_LEAK_DETECTED` | 0 | Discovery succeeded and no supported leak reproduced. Scoped to object-level authorization; not a full audit. |

Exit codes make the CLI usable as a CI gate; `engine/hooks/pre-commit.sh` shows an opt-in pre-commit integration.

## Presentation layers

- **CLI** — the reference interface and the fallback for every demo.
- **Live console** (`npm run serve`) — runs the same CLI command and streams its stages to the browser.
- **Dashboard** — renders committed result artifacts; read-only.
