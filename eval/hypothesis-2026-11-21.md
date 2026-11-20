# Preregistered rewrite-survival hypothesis — 2026-11-21 (Asia/Calcutta)

Committed before the renamed-route experiment results are generated.

## Hypothesis

On induced ownership regressions whose resource route is renamed, a frozen saved exploit test tied to the old path will report a false pass, while `scanByDiscovery` will find the new route and prove the cross-user read. A static secret scanner will not identify the runtime ownership regression.

## Planned measurement

- Use only locally seeded evaluation apps. Keep the original `eval/apps` unchanged; create labeled rewrite copies under `eval/rewrite-apps`.
- Rename a resource route in each copy. Remove its ownership check in roughly half, and retain it in the rest as safe controls.
- Verify both users can log in, the new route works, and the old route returns 404 before measuring detectors.
- Measure frozen-test false passes, discovery catches, and static-scanner catches on the induced regressions. Repeat detector measurements twice and report any disagreement.
- Report Wilson 95% intervals with observed numerators and denominators. An unscannable case stays in the table and is never counted as clean.
- Include a separate seeded-vulnerable positive control caught by discovery.

The expected direction is a hypothesis, not an observed result. Static scanner results may be reported as unavailable if a suitable scanner cannot run.

## Existing-data check at preregistration

- `eval/results/sudarshan-all.json`: 0 leaked, 23 clean, 23 scanned, 0 unscannable.
- `eval/results/stats.json`: the 0/23 Wilson 95% upper bound is approximately 14.31%.
- `eval/results/secret-all.json`: absent at preregistration; the claimed 6/23 forgeable result is not yet verified here.
