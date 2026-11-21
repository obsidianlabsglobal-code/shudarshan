# Threat model & scope

## What Sudarshan defends against

1. **Authorization regressions introduced by AI rewrites** — an assistant moves or rewrites a route and drops an object-level ownership check, so one user can read another user's record, while the app still compiles and runs.
2. **Stale regression tests** — a saved, route-pinned security test that silently stops testing the vulnerable code after a route moves, and reports a pass.
3. **Forgeable session secrets** — a hard-coded fallback secret that lets anyone mint a valid session.

## Prerequisites (current implementation)

Sudarshan currently requires the target to:

- run as a local HTTP service,
- use JWT-style bearer authentication,
- have seeded test users declared in `sudarshan.json`,
- expose discoverable collection and get-by-id endpoints.

It is **not** plug-and-play on arbitrary repositories.

## Out of scope

- Vulnerability classes other than object-level authorization and forgeable secrets (e.g. injection, business-logic abuse).
- Cookie/session, OAuth/OIDC, GraphQL, and gRPC targets.
- Determining whether code was written by a human or an AI — Sudarshan tests behavior, not authorship.
- Generating fixes — the FIX stage verifies a proposed fix only.

## Verdict semantics

Sudarshan is designed to fail *safe*: if it cannot locate or test an endpoint, it reports `INCONCLUSIVE`. A `NO_LEAK_DETECTED` result means no supported leak reproduced during that scan; it is not a guarantee that the application is secure.

## Safety guardrails

- Intended for applications you own or are authorized to test.
- The live console binds to `127.0.0.1` and only accepts allowlisted demo targets.
- All data is synthetic; displayed evidence is masked.
- Target processes run in isolated process groups with timeouts.
