# Responsible use & security policy

Sudarshan is a **defensive** tool: it exists so developers can check their *own* applications before shipping them.

## Authorized use only

- Run Sudarshan **only against applications you own or are explicitly authorized to test.**
- It is designed for local test environments. The bundled demo targets (`victim/`, `eval/apps/`) are synthetic applications built for this project.
- `sudarshan serve` binds to `127.0.0.1` only and accepts targets from a fixed allowlist of our demo apps — no arbitrary input reaches it.

## Data handling

- All demo and benchmark data is **synthetic**. No real user data is used anywhere in this repository.
- Evidence shown in the CLI and dashboard is **masked** (e.g. `98XXXXXX76`) so nothing readable reaches a screen or projector.

## Scope of claims

Sudarshan reports a vulnerability only with reproduced runtime evidence. When it cannot locate or test an endpoint it reports `INCONCLUSIVE` — it never reports an untested application as safe. A `NO_LEAK_DETECTED` result is scoped to object-level authorization and is **not a full security audit**.

## Reporting an issue

Found a bug in Sudarshan itself? Open an issue at
<https://github.com/obsidianlabsglobal-code/shudarshan/issues>. Please do not include real credentials or real user data.
