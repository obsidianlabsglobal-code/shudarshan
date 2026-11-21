# Hypothesis — self-relocating re-discovery generalization benchmark

**Committed:** 2026-11-20T23:25:02Z (before the harness was built or run)
**Author:** Krishna Seervi · Team ANVORA · The Big Hack 2.0 · AI Research R1
**Scope:** testing/verification of our *own* synthetic apps on localhost only. Read-only
use of engine functions (`scanByDiscovery`, `verifyApp`) and the engine's frozen-test
assertion logic. No change to `engine/` or `victim/` (the demo is locked).

## Hypothesis (pre-registered)

> Self-relocating re-discovery detects seeded authorization regressions across varied
> synthetic route transformations where frozen saved tests and static scanners fail — **and never
> reports NO_LEAK_DETECTED on a seeded-vulnerable app.**

## What we will measure

From one base BOLA app (`victim/app-50`, ownership intact), programmatically generate
20+ rewrites (fallback 12–15), each applying **one** rewrite type and each carrying a
**seeded, labeled ownership-drop regression** (except the secure controls):

- **Type A** — in-dictionary resource + known API prefix (`/records` → `/api/v2/items`).
  *Expectation:* VULNERABLE (self-relocating re-finds the moved route and re-proves the leak).
- **Type B** — unfamiliar resource name (`/records` → `/clinical-files`, `/manifests`).
  *Expectation:* INCONCLUSIVE (honest "could not locate the endpoint" — never false-safe).
- **Type C** — nested route (`/api/v2/clinic/items/:id`). *Expectation:* tests re-discovery
  reach; honestly INCONCLUSIVE where nesting exceeds the prefix dictionary.
- **Type D** — alternate structure (id as query param, non-standard list envelope).
  *Expectation:* tests the envelope assumptions; honestly INCONCLUSIVE where structure
  departs from `listPath/{id}`.
- **Secure controls** — ownership intact, no regression, discoverable route.
  *Expectation:* NO_LEAK_DETECTED (confirms zero false-positive alarms).

## Detectors (three, per app)

1. **self-relocating** — `verifyApp` verdict ∈ {VULNERABLE, INCONCLUSIVE, NO_LEAK_DETECTED}.
2. **frozen saved test** — the saved test authored against the *original* route, using the
   exact assertion logic of `engine/to-test.ts` (lenient: attack-path blocked; strict:
   attack-path blocked **and** owner list still 200). A fair baseline, not a strawman.
3. **static scanner** — gitleaks (secrets) and semgrep (`--config auto`), run over each app's
   source; does either flag the authorization regression?

## The three numbers that matter

`caught` / `inconclusive` / `false_secure`, with Wilson 95% CIs, and the self-relocating
catch rate **split by rewrite type**.

**Falsifiable pre-commitment:** `false_secure` (a seeded-vulnerable app reported
NO_LEAK_DETECTED) **must be 0**. If it is not, the hypothesis is refused and we report that.
We also report the real catch rate — not a flattering one. A result like "re-found and caught
X/N, inconclusive on Y/N (never once false-secure); frozen false-passed or misfired on all
vulnerable apps; scanner caught ~0" is the expected, honest outcome.

## Honest limit (stated up front)

These are synthetic apps we generated to span rewrite *structures*; they are not a random
sample of real repositories. Real-world-repository validation is roadmap, not claimed here.
"0 false-secure" is a property measured on this evaluated set, not a population rate.
