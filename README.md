<div align="center">

# Sudarshan

### The AI forgets what it fixed. Sudarshan doesn't.

**Proof-carrying API security that survives the rewrite**

[![CI](https://github.com/obsidianlabsglobal-code/shudarshan/actions/workflows/ci.yml/badge.svg)](https://github.com/obsidianlabsglobal-code/shudarshan/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-b45309.svg)](./LICENSE)
[![Live dashboard](https://img.shields.io/badge/dashboard-live-1e7a4d.svg)](https://obsidianlabsglobal-code.github.io/shudarshan/)

[**Live dashboard**](https://obsidianlabsglobal-code.github.io/shudarshan/) · [Demo script](./DEMO.md) · [Methodology](./docs/METHODOLOGY.md) · [Benchmark report](./eval/benchmark/REPORT.md)

*Team ANVORA · The Big Hack 2.0 · AI Research — R1 "Vibe-coded and vulnerable"*

</div>

---

> **An exploit is the only security statement that survives an AI rewrite.**
> AI rewrites applications on every prompt. Route-pinned security tests go stale, and fixes silently disappear. Sudarshan keeps the *proof*, re-discovers the moved endpoint, and re-proves the vulnerability against the current code — with deterministic runtime evidence, and **never a false "safe."**

## The problem

From one prompt template and one model we generated **23 applications**. The AI secured 17 and shipped **6 with a forgeable session secret** — and nothing in the running apps tells you which 6.

It gets worse on the next prompt. Ask for one more feature and the assistant rewrites the route — `/records/:id` becomes `/api/v2/items/:id` — and drops the ownership check. The app still compiles and runs. A saved security test pinned to the old path now gets a 404 and reports **PASS**. The fix didn't just break; it became invisible.

Static review can't see this: the flaw is a check that was never written, and there is no bad pattern to match.

## What Sudarshan does

It tests the **running** application rather than reading code. It signs in as two test users, re-discovers the resource endpoint on the current code, and attempts a cross-user read. It reports a vulnerability **only** when the leak is proven with reproduced runtime evidence — **no model decides the verdict.**

## Quickstart

```bash
npm ci
npm run verify -- victim/app-51   # an app an AI rewrote and silently broke
npm run serve                     # live console at http://127.0.0.1:4545
npm test                          # typecheck + the three demo verdicts
```

```text
SUDARSHAN · verify victim/app-51
the app was rewritten by an AI — a deterministic re-check, no LLM in the proof path

  PROVE    · 3.1s
    frozen saved test   PASS  ✗ false safety (/records/rec-1001 → 404, assumed blocked)
    self-relocating     CAUGHT ✓ re-found /api/v2/items/rec-1001
    Attacker (B) read Victim (A)'s private record — masked:
      patient AnXXXXXXXXXXXd… · phone 98XXXXXX76 · accountNo INXXXXXXXXX10

  FIX      · 441ms
    ✓ fix accepted — legitimate user still 200

  CHECK    · <1ms
    ✓ collision-safe marker       victim-only field, absent from attacker data
    ✓ forged-token discriminator  wrong-secret token rejected → authorization flaw
    ✓ self-relocating             re-discovered /api/v2/items/rec-1001, reproduced ×2

  REMEMBER · 2ms
    the proof lives in the repo — survives a session restart

  VERDICT: VULNERABLE (exit 1)
```

The saved test said **safe**. Sudarshan re-found the moved route and **caught the leak**.

## How it works

| Stage | What happens |
|---|---|
| **PROVE** | Re-discover endpoints on the current code and attempt a cross-user read, reproduced twice, against controls. |
| **FIX** | Verify a proposed fix: the cross-user read must fail **and** the legitimate owner must still succeed. |
| **CHECK** | Confirm the finding with three independent, deterministic proofs. |
| **REMEMBER** | Keep the proof in the repository; re-earn it on every run — through a session restart and a route rename. |

**Why a finding is never a guess** — it is accepted only when the leaked data contains a field unique to the victim and absent from the attacker's own data; a token signed with the wrong secret is rejected (so the flaw is authorization, not broken login); the owner and anonymous controls behave as expected; and the result reproduces. See [ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Verdicts

| Verdict | Exit | Meaning |
|---|---|---|
| `VULNERABLE` | 1 | A leak was proven with runtime evidence. |
| `INCONCLUSIVE` | 2 | The endpoint could not be located (e.g. an unfamiliar rename). **"Don't know" — never "safe."** |
| `NO_LEAK_DETECTED` | 0 | Discovery succeeded and no supported leak reproduced — scoped to object-level authorization, not a full audit. |

Real exit codes make `sudarshan verify` a CI gate.

## Evidence

**Hypothesis pre-registered** before the harness existed (commit `01b0ee0`). **25 synthetic route transformations** of one base app — 21 seeded-vulnerable, 4 secure controls — reproduced identically across two runs.

| Outcome (21 seeded-vulnerable apps) | Result | 95% Wilson CI |
|---|---:|---|
| Detected | 8 / 21 | [0.21, 0.59] |
| Inconclusive | 13 / 21 | [0.41, 0.79] |
| **Falsely cleared ("safe")** | **0 / 21** | **[0.00, 0.155]** |
| Secure controls correctly cleared | 4 / 4 | [0.51, 1.00] |

In-dictionary rewrites: **8 / 8 detected** (CI [0.68, 1.00]). Unfamiliar names, nested routes, and alternate structures: **inconclusive, never falsely safe.** Frozen saved tests: 0 / 21. Static baselines: no discriminating verdict.

**The number that matters is the zero.** For a security tool, never telling you an unsafe app is safe matters more than catching everything — so we map our envelope honestly instead of cherry-picking. Full design, results, and threats to validity: [METHODOLOGY.md](./docs/METHODOLOGY.md).

## Scope — stated plainly

- Re-discovery is **dictionary-based**, not yet semantic — an unfamiliar rename returns `INCONCLUSIVE`.
- The FIX stage **verifies a proposed fix**; it does not generate one.
- Requires a local HTTP service, JWT-style auth, seeded test users, and discoverable collection endpoints — **not plug-and-play on any repository.**
- The benchmark is **synthetic transformations of one base app**, not independent real-world applications.
- "Memory" is **saved evidence plus live re-discovery**, not yet a persistent semantic invariant.

See [THREAT_MODEL.md](./docs/THREAT_MODEL.md).

## Where it fits

Static review (CodeRabbit, Snyk) reads code and cannot observe runtime authorization. Commercial runtime testing (StackHawk, Bright) needs specifications, configured user profiles, and an account, and does not claim to re-prove a saved finding after the application is rewritten. Sudarshan is free, local, and zero-config, and asks the one question those don't: **does the proof survive regeneration?**

## Where this goes

Success is not how many of our own apps we support — it's whether an application we've **never seen** can be onboarded and checked **without changing Sudarshan's code.**

1. A blind holdout on unseen applications.
2. Local-first, zero-config onboarding of a developer's own project.
3. Broader frameworks and login styles beyond Express + JWT.
4. Semantic, path-independent proofs that survive *any* rename.

## Repository

```text
engine/     the deterministic verifier, CLI, live console, self-test
victim/     demo targets — app-50 (secure), app-51 (rewritten), app-52 (unfamiliar rename)
web/        dashboard (React + Vite + Tailwind) → GitHub Pages
eval/       23-app study, rewrite benchmark, baselines, statistics
shared/     shared types and evidence masking
docs/       architecture, methodology, threat model
```

## Team ANVORA

| | Role |
|---|---|
| **Krishna Seervi** | Engine, verification, live console, integration |
| **Pradeep Beleri** | Evaluation, benchmark design, statistics |
| **Abhinav Hande** | Methodology, threat model, documentation |

Built from an empty repository during The Big Hack 2.0. Responsible use: [SECURITY.md](./SECURITY.md) · License: [MIT](./LICENSE) · Cite: [CITATION.cff](./CITATION.cff)

<div align="center">

**Prove the flaw. Verify the fix. Remember it — through the rewrite.**

</div>
