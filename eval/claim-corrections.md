# Claim corrections

- In the forged-token control for a forgeable embedded secret, the forged token is expected to be accepted before the fix and rejected after the fix. These are separate expectations; rejection is not universal.
- Use: “0 false positives on the evaluated set, by construction.” This describes the observed evaluation and its proof criteria; it is not a population-wide false-positive guarantee.
- The hardcoded-secret scan reported 6 proven weaknesses and 17 clean results among 23 apps. “Clean” applies to this particular test, not all security properties.
- On Windows, the current discovery implementation fails to launch its Unix-style `node_modules/.bin/tsx` path (`spawn ... ENOENT`). The rewrite experiment requires a portable runner or a Linux environment; no rewrite-survival results have been measured here.
