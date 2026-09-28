#!/usr/bin/env bash
# Evidence-only live proof for R1. Do not run without exclusive admission.
# Usage: L31-live-proof-posix.sh <fresh-checkout> <expected-full-sha>
set -u

checkout=${1:?fresh checkout required}
expected=${2:?expected full SHA required}
cd "$checkout" || exit 2
actual=$(git rev-parse HEAD) || exit 2
test "$actual" = "$expected" || { printf 'HEAD_MISMATCH=%s\n' "$actual" >&2; exit 2; }
test -f scripts/run-tests.mjs || { printf 'RUNNER_MISSING\n' >&2; exit 2; }

scratch=$(mktemp -d "${TMPDIR:-/tmp}/l31-r1-proof.XXXXXX") || exit 2
mkdir "$scratch/tmp"
probe="$scratch/forward.test.mjs"
ready="$scratch/controller.pid"
runner_out="$scratch/runner.out"
runner_err="$scratch/runner.err"
cat >"$probe" <<EOF
import test from "node:test";
import fs from "node:fs";
test("R1 live controller", async () => {
  fs.writeFileSync(${ready@Q}, String(process.ppid));
  await new Promise((resolve) => setTimeout(resolve, 10000));
});
EOF

TMPDIR="$scratch/tmp" TEMP="$scratch/tmp" TMP="$scratch/tmp" \
  node scripts/run-tests.mjs --no-sweep "$probe" >"$runner_out" 2>"$runner_err" &
runner=$!
deadline=$((SECONDS + 4))
while { test ! -s "$ready" || test ! -s "$runner_out"; } && test "$SECONDS" -lt "$deadline"; do sleep 0.05; done
test -s "$ready" && test -s "$runner_out" || { printf 'NOT_READY retained=%s\n' "$scratch" >&2; exit 1; }
home=$(head -n 1 "$runner_out")
controller=$(tr -d '[:space:]' <"$ready")
case $controller in (*[!0-9]*|'') printf 'BAD_CONTROLLER=%s retained=%s\n' "$controller" "$scratch" >&2; exit 1;; esac

sent_at=$(date +%s%3N)
kill -TERM "$runner"
deadline=$((SECONDS + 5))
while kill -0 "$runner" 2>/dev/null && test "$SECONDS" -lt "$deadline"; do sleep 0.05; done
if kill -0 "$runner" 2>/dev/null; then printf 'RUNNER_NOT_GONE_5S retained=%s\n' "$scratch" >&2; exit 1; fi
wait "$runner"; runner_exit=$?
elapsed=$(( $(date +%s%3N) - sent_at ))
if kill -0 "$controller" 2>/dev/null; then printf 'CONTROLLER_STILL_LIVE retained=%s\n' "$scratch" >&2; exit 1; fi
test ! -e "$home" || { printf 'RUNNER_HOME_REMAINS=%s retained=%s\n' "$home" "$scratch" >&2; exit 1; }
printf 'PASS R1_HEAD=%s RUNNER_EXIT=%s ELAPSED_MS=%s CONTROLLER=%s HOME_REMOVED=%s RETAINED=%s\n' \
  "$actual" "$runner_exit" "$elapsed" "$controller" "$home" "$scratch"

