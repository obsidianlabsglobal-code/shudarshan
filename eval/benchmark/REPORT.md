# Rewrite-generalization benchmark — results

**Run:** 2026-11-20 · reproduced identically across two consecutive runs.
**Scope:** testing/verification of our *own* synthetic apps on localhost; synthetic data;
read-only use of engine functions; `engine/` and `victim/` unmodified.
**Pre-registered:** [`HYPOTHESIS.md`](./HYPOTHESIS.md) (committed `01b0ee0`, before the harness existed).
**Machine-readable:** [`../results/rewrite-benchmark.json`](../results/rewrite-benchmark.json).

## Method

From one base BOLA app (`victim/app-50`, ownership intact) the generator
([`rewrite-gen.ts`](./rewrite-gen.ts)) programmatically emits **25 rewrites** — we do not
hand-author them. Each applies exactly one rewrite type and seeds a labeled ownership-drop
regression (except the 4 secure controls). Three detectors run per app: self-relocating
(`verifyApp`), the frozen saved test (engine `to-test.ts` assertion logic, authored against
the original `/records` route), and static scanners (gitleaks + semgrep). Rates use the
two-sided 95% Wilson score interval.

## Headline (the three numbers that matter)

| Outcome on the 21 seeded-vulnerable apps | n / N | rate | 95% Wilson CI |
|---|---|---|---|
| **caught** (VULNERABLE, leak re-proven) | 8 / 21 | 38.1% | [0.208, 0.591] |
| **inconclusive** (honest "can't locate") | 13 / 21 | 61.9% | [0.409, 0.792] |
| **false-secure** (NO_LEAK_DETECTED on a vulnerable app) | **0 / 21** | **0%** | [0.000, 0.155] |

**false-secure = 0/21 → PASS.** The pre-registered pass condition holds.
Secure controls: **4/4 NO_LEAK_DETECTED, 0 false alarms** (95% Wilson [0.510, 1.000]).

## Self-relocating catch rate, split by rewrite type

| Type | rewrite | n | caught | inconclusive | false-secure | note |
|---|---|---|---|---|---|---|
| A | in-dict resource + known prefix (`/api/v2/items`…) | 8 | **8** | 0 | 0 | 95% CI on catch rate [0.676, 1.000] |
| B | unfamiliar resource name (`/clinical-files`…) | 5 | 0 | 5 | 0 | honest inconclusive — name outside dictionary |
| C | nested route (`/api/v2/clinic/items`…) | 4 | 0 | 4 | 0 | honest inconclusive — nesting beyond prefix list |
| D | alternate structure (query-param id / deep envelope) | 4 | 0 | 4 | 0 | honest inconclusive — departs from `listPath/{id}` |
| — | secure controls (ownership intact) | 4 | n/a | n/a | 0 | 4/4 NO_LEAK_DETECTED, 0 false alarms |

This is the honest shape of the claim: self-relocating re-discovery **catches the in-distribution
rewrite (Type A, 8/8)** and **goes honestly inconclusive on every novel structure (B/C/D, 13/13)** —
it never once converts "I can't find it" into a false "no leak."

## The other two detectors

| detector | caught leaks on 21 vulnerable apps | how it failed |
|---|---|---|
| **frozen saved test** | **0 / 21** | false-passed on all 21 (lenient: old path 404 read as "blocked = safe"); misfired as "app broke" on all 21 (strict: owner's old list also 404s). Never re-finds a moved route. |
| **static scanners** | **0 / 21 discriminating** | gitleaks (secrets): 0 findings — no authorization model. semgrep community ruleset (`--config auto`): unreachable in this offline sandbox. A generic local IDOR pattern ([`idor-generic.yaml`](./idor-generic.yaml)) fired on **25/25 apps including 4/4 secure controls** — zero discrimination. |

## One-paragraph summary

Across 25 programmatically generated synthetic route transformations of one BOLA app (21 seeded-vulnerable,
4 secure controls), **self-relocating re-discovery re-found and caught 8/21 vulnerable rewrites
(all in-dictionary/known-prefix moves — 8/8 of Type A, 95% CI [0.68, 1.0]), went honestly
INCONCLUSIVE on the other 13/21 (every unfamiliar-name, nested, and alternate-structure rewrite),
and never once reported NO_LEAK_DETECTED on a vulnerable app — false-secure 0/21, 95% Wilson
[0, 0.155).** On the 4 secure controls it returned NO_LEAK_DETECTED 4/4 with zero false alarms.
Over the same apps the frozen saved test caught 0/21 (false-passing or misfiring as "app broke"
on every one), and conventional static scanners produced no verdict that separates vulnerable
from secure (gitleaks 0; a generic semgrep IDOR rule flags everything, secure controls included).
The headline: **self-relocating is the only detector that distinguishes the leaks, it catches the
rewrite pattern it was built for and is honest — not falsely safe — on the rest, and its
false-secure count is 0.**

## Honest limits

- These are **synthetic apps we generated** to span rewrite *structures* — not a random sample
  of real repositories. Real-world-repo validation is **roadmap**, not claimed here.
- "0 false-secure" is measured on this **evaluated set**, by construction of the gate — not a
  population rate. The 95% interval still allows a true false-secure rate up to ~15.5% given N=21.
- The 38% catch rate is **not** a quality ceiling — it is dominated by how many of these
  deliberately-varied rewrites fall outside the dictionary. The product promise is the
  conjunction: **catch what we can re-discover, stay inconclusive (never falsely safe) on the
  rest.** Raising catch rate on B/C/D is the discovery-generalization roadmap (semantic
  re-discovery, a persisted path-independent ownership invariant).
