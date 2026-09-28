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
runner=

reap_runner() {
  test -n "$runner" || return 0
  if kill -0 "$runner" 2>/dev/null; then
    kill -TERM "$runner" 2>/dev/null || true
    deadline=$((SECONDS + 12))
    while kill -0 "$runner" 2>/dev/null && test "$SECONDS" -lt "$deadline"; do sleep 0.05; done
  fi
  if kill -0 "$runner" 2>/dev/null; then
    kill -KILL "$runner" 2>/dev/null || true
    deadline=$((SECONDS + 5))
    while kill -0 "$runner" 2>/dev/null && test "$SECONDS" -lt "$deadline"; do sleep 0.05; done
  fi
  if ! kill -0 "$runner" 2>/dev/null; then wait "$runner" 2>/dev/null || true; fi
}

fail() {
  reap_runner
  printf '%s retained=%s\n' "$1" "$scratch" >&2
  exit 1
}
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
test -s "$ready" && test -s "$runner_out" || fail NOT_READY
home=$(head -n 1 "$runner_out")
case $home in ("$scratch"/tmp/sealed-home-*) ;; (*) fail "BAD_RUNNER_HOME=$home";; esac
controller=$(tr -d '[:space:]' <"$ready")
case $controller in (*[!0-9]*|'') fail "BAD_CONTROLLER=$controller";; esac

sent_at=$(date +%s%3N)
kill -TERM "$runner"
deadline=$((SECONDS + 5))
while kill -0 "$runner" 2>/dev/null && test "$SECONDS" -lt "$deadline"; do sleep 0.05; done
if kill -0 "$runner" 2>/dev/null; then fail RUNNER_NOT_GONE_5S; fi
wait "$runner"; runner_exit=$?
test "$runner_exit" -eq 143 || fail "RUNNER_NOT_SIGTERM_EXIT=$runner_exit"
test ! -e "$home" || fail "RUNNER_HOME_REMAINS=$home"
elapsed=$(( $(date +%s%3N) - sent_at ))
test "$elapsed" -le 5000 || fail "RUNNER_ELAPSED_MS=$elapsed"
deadline=$((SECONDS + 5))
while kill -0 "$controller" 2>/dev/null && test "$SECONDS" -lt "$deadline"; do sleep 0.05; done
if kill -0 "$controller" 2>/dev/null; then fail CONTROLLER_STILL_LIVE; fi
printf 'PASS R1_HEAD=%s RUNNER_EXIT=%s ELAPSED_MS=%s CONTROLLER=%s HOME_REMOVED=%s RETAINED=%s\n' \
  "$actual" "$runner_exit" "$elapsed" "$controller" "$home" "$scratch"
