VERDICT: NEEDS_FIXES (2) b6676527aa35d6063b0e7d1b41e75d4c968a44e0

NEEDS_FIXES

# L1 review, round 2: ledger-both-halves-1

I reviewed `b6676527aa35d6063b0e7d1b41e75d4c968a44e0`. I ran `git rev-parse HEAD` myself in
`/home/ben/Code/wt-ledger-both-halves-1-L1`. The range is `097f654..HEAD`, which is a single commit, `b667652`. The
worktree was clean before and after the review. Every trial edit went into a scratch copy (`git archive HEAD skills`) under
the session scratchpad. I touched no file in the reviewed tree.

**Gate, re-run by me:**
- `node --test skills/multi/scripts/note-send.test.mjs`: 147 pass, 0 fail.
- `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs`: 1 pass, 0 fail.
- `reports/L1-gate.log` agrees with both.

**Territory:** `git diff --stat 026a7a0..HEAD` shows only `SKILL.md`, `note-send.mjs` and `note-send.test.mjs`.

**Counts:** 0 blocker, 1 major, 1 minor. Both findings are about test strength. Every production-code fix from round 1
checks out.

## Bug-fix fields (C4)

Cause: Round 1's 4 major and 3 minor defects: an unhandled EPIPE on the mirror's stdin, `failureJson` dropping
`mirrorLedger`, a hostname-only self check, a stub-only R3 test, the `--append-ledger` length/CR hole, non-hermetic tests,
and a timeout that resolved only on `'close'`.
Discriminating check: For each fix, I reverted it on a scratch copy and re-ran the test that covers it. MAJOR-2, MAJOR-3
and the CR half of MINOR-1 fail when their fix is reverted, so those tests are real. The 701-char test and the MAJOR-4
retry test do not fail (findings below). MAJOR-1 and MINOR-3 were checked with a live `defaultSpawnMirror` probe.
Fix location: `skills/multi/scripts/note-send.mjs` holds the fixes: `defaultSpawnMirror` at :182-228,
`runAppendLedgerMode` at :277, the self check at :459-462, and `failureJson` at :1037-1049. The two weak tests are in
`skills/multi/scripts/note-send.test.mjs` at :1783-1793 and :1846-1877.
Simplification: none needed. Every fix is a small in-place correction inside the existing `runMirror`/`defaultSpawnMirror`
shape. Both remaining fixes are one-line test edits.

---

## MAJOR-1 (twin of round-1 MAJOR-4): the real-retry R3 test cannot catch a mirror on Netcup, the host this gate runs on

- File: `skills/multi/scripts/note-send.test.mjs:1870`. `runNoteFlush` gets `env: { SSH_CONNECTION: '100.69.249.18 1 2 3' }`,
  and `100.69.249.18` is zhuk-netcup's own address. This round's MAJOR-3 fix (`note-send.mjs:459-462`) treats any sender
  host whose `addr` is in `os.networkInterfaces()` as this machine, so it does not mirror. On this host, `hostname` =
  `v2202608391056492408`, and `networkInterfaces` includes `100.69.249.18`: `true`. The test injects no `hostname` or
  `localAddrs` into the flush deps. Any regression that routes the retry through `runNoteSend` with forwarded deps
  therefore resolves as "self" on Netcup and never calls `spawnMirror`. The comment at :1867-1868 says "a mirror bug
  reachable from note-flush would fire here if it existed", and on this host that is false. I suggested this address
  myself in round 1. The self-host fix is what turned it into a blind spot.
- Measured with a mutation on a scratch copy. At `note-flush.mjs:589` I inserted a regression that calls `runNoteSend`
  for each outbox entry and forwards the flush's `env`, `spawnMirror` and `orca`:
  - As shipped (address `100.69.249.18`): `✔ R3 (review MAJOR-4) …`, pass 1, fail 0. **The mutant survives.**
  - Address changed to `100.111.119.54` (zhuk-vps32, not local here): `✖ … count is unchanged`, `actual: 2, expected: 1`.
    **The mutant is caught.**
  - Unmutated `note-flush.mjs` with the address changed: the full file is 147/147 green.
- Attack-brief item 3 asks for a real test showing the retry path never reaches the mirror, and contracts R3 requires one.
  On the gate host the test is not a real check. The production claim itself still holds by inspection: `runNoteFlush`
  never imports `runNoteSend`.
- Patch (exact), `note-send.test.mjs:1867-1870`:
  - old:
    ```js
      // branch it takes — cannot reach the mirror. An SSH_CONNECTION that maps to the very host this send
      // named is passed on purpose: a mirror bug reachable from note-flush would fire here if it existed.
      await runNoteFlush([], {
        home, orca, env: { SSH_CONNECTION: '100.69.249.18 1 2 3' }, spawnMirror, now: NOW,
    ```
  - new:
    ```js
      // branch it takes — cannot reach the mirror. An SSH_CONNECTION mapping to a REMOTE table host
      // (zhuk-vps32, never this machine: hostname/localAddrs are pinned below) is passed on purpose, so a
      // mirror bug reachable from note-flush would fire here if it existed, on every host the suite runs on.
      await runNoteFlush([], {
        home, orca, env: { SSH_CONNECTION: '100.111.119.54 1 2 3' }, spawnMirror, now: NOW,
        hostname: 'test-host', localAddrs: [],
    ```
  - Predicted: passes today, and fails with `actual: 2` against the forwarded-deps mutant on any host. I verified the
    address change on the scratch copy. The extra `hostname`/`localAddrs` keys are ignored by `runNoteFlush` today. They
    also cover a regression that forwards deps wholesale on a host that happens to be vps32.

## MINOR-1: the 701-char `--append-ledger` test does not test the length check

- File: `skills/multi/scripts/note-send.test.mjs:1788`. `const over = 'a'.repeat(MAX_LINE + 1);` is not an envelope, so
  `parseEnvelope` rejects it whether or not the new `body.length > MAX_LINE` guard (`note-send.mjs:277`) exists.
- Measured on a scratch copy, with `:277` reverted to round 1's `if (!body || body.includes('\n')) {`:
  - `✔ --append-ledger rejects a 701-char line …`: it still passes.
  - The CR test goes `✖`, so the CR test is real.
- Patch (exact), `note-send.test.mjs:1788`:
  - old:
    ```js
      const over = 'a'.repeat(MAX_LINE + 1);
    ```
  - new:
    ```js
      const head = 'taxonomy → nucleus, 9.27.26 08:00 NYC [taxonomy-ping-1] FYI: ';
      const over = head + 's'.repeat(MAX_LINE + 1 - head.length);
      assert.equal(over.length, MAX_LINE + 1);
      assert.ok(parseEnvelope(over), 'the probe must be a valid envelope, so only the length check can refuse it');
    ```
  - Verified on the scratch copy: it passes with the fix and fails (`✖`) with only the length guard reverted.
    `parseEnvelope` is already imported at :13.

---

## Round-1 findings: verification

- **MAJOR-1 (EPIPE)**: fixed at `note-send.mjs:216` with `child.stdin.on('error', …)`. Live probe on a scratch copy with
  `defaultSpawnMirror` exported: a child that runs `echo … >&2; exit 3` without reading 200 KB of stdin resolves in 7 ms
  to `{"ok":false,"code":3,"stderr":"fake ssh: refusing\n"}`. The process exits 0, with no uncaught EPIPE.
- **MAJOR-2 (failureJson)**: fixed at :1049 with a conditional spread, so the key is present only when the send set it.
  The test at :1713 fails when the spread is reverted. The local-omission test at :1735 guards the absent case.
- **MAJOR-3 (self check)**: fixed at :459-462, with `localAddrs` injectable. The test at :1589 fails when the
  `localAddrs.includes` clause is reverted. `os.networkInterfaces()` returns `{}` rather than throwing when libuv fails
  (Node v24.18.1 source), so plain local sends cannot crash on it. It reads no environment variable.
- **MAJOR-4 (real retry)**: the real `runNoteFlush` is now imported and driven. The test is weak on Netcup: see this
  round's MAJOR-1.
- **MINOR-1 (length/CR)**: the guard is correct. The CR test is real. The 701 test is not: see this round's MINOR-1.
- **MINOR-2 (hermeticity)**: every mirror-reachable L1 test now carries `hostname: 'test-host', localAddrs: []`. The
  dry-run test has a `spawnMirror` tripwire (:1504-1507).
- **MINOR-3 (grandchild timeout)**: fixed at :194-203 with a `settle` guard. Live probe `sh -c 'sleep 30'` with an 800 ms
  bound: it resolved at 801 ms with `{"timedOut":true}`, and the whole process exited at 859 ms. A single-process child
  that succeeds still resolves `ok:true`.
- **MINOR-4**: the lead's ruling. There is no code change, and the builder's report says so plainly.

## Lead's addendum items

- **Item 3 (SKILL.md).** A word-level diff (`git diff --word-diff=porcelain 097f654..HEAD -- skills/multi/SKILL.md`)
  shows exactly one change: `-kind,` → `+kind and stamped at or after the ASK,` (`SKILL.md:142`). Every other line in
  the hunk is a reflow with identical words. The claim matches the code: `note-flush.mjs:1382` checks
  `(envelopeInstant(g) ?? -Infinity) >= askAt`.
- **Item 4 (R2's constraints).** Both hold:
  - `--append-ledger` returns before any delivery, outbox or mirror code (:262-290), and writes only via `appendLine`. The
    test at :1808 checks no spawn and no outbox.
  - The fail-open behaviour against an old peer is `runMirror`'s `exit <code>: <stderr line>` shape. The test at :1633
    checks the exit code and delivery are unchanged. With this round's `failureJson` fix, the same holds on thrown paths.

## Attack brief: no regressions this round

1, 2, 4, 5, 6, 7, 8, 9: the round-1 verified-clean results still hold. This commit changes nothing in the argv/stdin
shape, `MIRROR_HOSTS`, the `isBen` placement, the environment reads, the dry-run/`--no-mirror` paths or the absent-key
logic. The only environment read in the diff is still `env.SSH_CONNECTION || env.SSH_CLIENT` (:65 of the diff). The dry
run plans from `mirrorTargetHost` (:693), which already excludes the self case.
10: territory is clean (3 files).
11: N2 is green, and no `process.env` appears in the test diff (count 0).
12: the SKILL.md sentences from round 1 are unchanged (:313 "lands on both hosts") plus the item-3 insertion above.
