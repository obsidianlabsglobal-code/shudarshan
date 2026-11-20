#!/usr/bin/env bash
# Sudarshan pre-commit hook — OPTIONAL, manual install only.
# We never modify your git config; you install this yourself if you want it:
#
#   ln -sf ../../engine/hooks/pre-commit.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# It runs the self-relocating verify on the demo app before each commit, so a
# re-introduced (or AI-moved) leak is caught with zero developer action. Set
# SUDARSHAN_TARGET to point at a different app directory.
#
# This copy is informational (exit 0) because the demo app is intentionally
# vulnerable. For a real gate, uncomment the exit-on-catch block below.
set -euo pipefail

TARGET="${SUDARSHAN_TARGET:-victim/app-51}"
echo "sudarshan: verifying ${TARGET} before commit…"
npx tsx engine/cli.ts verify "${TARGET}"

# --- make it blocking (opt in) ---
# if npx tsx engine/cli.ts verify "${TARGET}" | grep -q "CAUGHT"; then
#   echo "sudarshan: a provable leak was caught — commit blocked." >&2
#   exit 1
# fi

exit 0
