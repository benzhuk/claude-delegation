VERDICT: APPROVE b87791b182b8d81b281842a57df094ce90381495

APPROVE

# L1 review, round 3 (delta): ledger-both-halves-1

I reviewed `b87791b182b8d81b281842a57df094ce90381495`. I ran `git rev-parse HEAD` myself in
`/home/ben/Code/wt-ledger-both-halves-1-L1`. The range `b667652..HEAD` is one commit, `b87791b`, and it touches only
`skills/multi/scripts/note-send.test.mjs` (+9/-4). The worktree was clean before and after. I made every mutation in a
scratch copy (`git archive HEAD skills`) under the session scratchpad, then re-extracted that copy from HEAD, and it
ran 147/147 green. I wrote nothing to the reviewed tree.

**Counts:** 0 blocker, 0 major, 0 minor.

## Bug-fix fields (C4)

Cause: Round 2 found two weak tests. The real-retry R3 test used Netcup's own address (`100.69.249.18`), which the
round-2 self-host check treats as "this machine", so on the gate host a mirror regression reachable from note-flush
could not fire. The 701-char `--append-ledger` probe was not a valid envelope, so `parseEnvelope` refused it whether or
not the length guard existed.
Discriminating check: I ran mutations on a scratch copy. (a) I put a regression into `runNoteFlush` that calls
`runNoteSend` for each outbox entry and forwards `home/orca/env/spawnMirror/now`. The R3 test goes `✖`, `actual: 2,
expected: 1`. (b) The same mutant also forwarding `hostname`/`localAddrs` wholesale: `✖`, `actual: 2, expected: 1`.
(c) With `|| body.length > MAX_LINE` removed from `note-send.mjs:277`, the 701-char test goes `✖` (pass 0, fail 1).
Before the fix, both (a) and (c) survived.
Fix location: `skills/multi/scripts/note-send.test.mjs:1788-1791` (a valid 701-char envelope, with the two asserts
that pin its length and prove it parses) and `:1870-1875` (the vps32 address plus pinned `hostname: 'test-host',
localAddrs: []`).
Simplification: none needed. Both are test-only edits, applied verbatim from the round-2 patches. No production code
changed this round.

## Round-2 findings: verification

- **MAJOR-1 (R3 blind spot on Netcup): fixed.** The diff matches the round-2 patch exactly. `runNoteFlush` never reads
  `deps.hostname` or `deps.localAddrs`: grep on `note-flush.mjs` finds only `os.hostname()` at :252, in a log base
  object. So the extra keys are inert today, and they only matter if a regression forwards deps. Both forwarded-deps
  mutants, (a) and (b) above, are now caught on this host (hostname `v2202608391056492408`, which holds
  `100.69.249.18`). vps32 (`100.111.119.54`, `MIRROR_HOSTS` row 3 at `note-send.mjs:138`) is not local here, and the
  pinned `hostname`/`localAddrs` stop it resolving as self on any host, vps32 included.
- **MINOR-1 (701-char test): fixed.** The probe is `head + 's'.repeat(...)`. It asserts `over.length === 701` and
  that `parseEnvelope(over)` is truthy, so only the length guard can refuse it. Mutation (c) confirms the test is real.

## Gate and regressions (re-run by me)

- `node --test skills/multi/scripts/note-send.test.mjs`: 147 pass, 0 fail.
- `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs`: 1 pass, 0 fail. The new test lines add no
  `process.env`.
- `reports/L1-gate.log` agrees: 147/0 and N2 1/0.
- Territory (attack item 10): `git diff --stat 026a7a0..HEAD` still shows only `SKILL.md`, `note-send.mjs` and
  `note-send.test.mjs`.
- Attack items 1-9 and 12: `note-send.mjs` and `SKILL.md` are byte-unchanged since round 2, so the results verified
  in rounds 1 and 2 still hold. No regression is possible from a test-only diff, beyond the two tests checked above.
