#!/usr/bin/env bash
# Evidence-only live proof for F4. Do not run without exclusive admission.
# Usage: L31-live-proof-f4.sh <fresh-checkout> <expected-full-sha>
set -u

checkout=${1:?fresh checkout required}
expected=${2:?expected full SHA required}
cd "$checkout" || exit 2
actual=$(git rev-parse HEAD) || exit 2
test "$actual" = "$expected" || { printf 'HEAD_MISMATCH=%s\n' "$actual" >&2; exit 2; }
test -f scripts/test-home.mjs || { printf 'TEST_HOME_MISSING\n' >&2; exit 2; }

scratch=$(mktemp -d "${TMPDIR:-/tmp}/l31-f4-proof.XXXXXX") || exit 2
out="$scratch/out"
module_url=$(node -e 'console.log(new URL("./scripts/test-home.mjs", `file://${process.cwd()}/`).href)')
node --input-type=module -e '
  const { makeTempHome } = await import(process.argv[1]);
  let deliveries = 0;
  process.on("SIGTERM", () => {
    deliveries += 1;
    setTimeout(() => { process.stdout.write(`deliveries=${deliveries}\\n`); process.exit(0); }, 250);
  });
  const { home } = makeTempHome();
  process.stdout.write(`${home}\\n`);
' "$module_url" >"$out" 2>"$scratch/err" &
child=$!
deadline=$((SECONDS + 4))
while test ! -s "$out" && test "$SECONDS" -lt "$deadline"; do sleep 0.05; done
test -s "$out" || { printf 'F4_NOT_READY retained=%s\n' "$scratch" >&2; exit 1; }
home=$(head -n 1 "$out")
kill -TERM "$child"
deadline=$((SECONDS + 4))
while kill -0 "$child" 2>/dev/null && test "$SECONDS" -lt "$deadline"; do sleep 0.05; done
if kill -0 "$child" 2>/dev/null; then printf 'F4_CHILD_NOT_GONE retained=%s\n' "$scratch" >&2; exit 1; fi
wait "$child"; exit_code=$?
grep -qx 'deliveries=1' "$out" || { printf 'F4_NOT_ONE_DELIVERY retained=%s\n' "$scratch" >&2; exit 1; }
test ! -e "$home" || { printf 'F4_HOME_REMAINS=%s retained=%s\n' "$home" "$scratch" >&2; exit 1; }
printf 'PASS F4_HEAD=%s EXIT=%s DELIVERIES=1 HOME_REMOVED=%s RETAINED=%s\n' "$actual" "$exit_code" "$home" "$scratch"
