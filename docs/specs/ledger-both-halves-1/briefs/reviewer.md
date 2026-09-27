# Mandate — independent reviewer, L1, ledger-both-halves-1

Task: Adversarially review L1's builder output (sender-host resolution, `--append-ledger` mode, the
ssh mirror call, the two SKILL.md prose edits, and the new tests) against the spec pack, and return
`APPROVE`/`NEEDS_FIXES` with concrete, file:line-grounded findings. Read-only; you never edit L1's
files. Spawn only after L1's own gate is green.

Goal: an overdue-ASK pass on either host can tell an answered cross-host ASK from a stalled one
once both hosts hold both halves (spec's Why) — your job is to catch anything that would silently
defeat that, leak note content, mirror to the wrong host, double-mirror, or change the exit code /
delivery outcome on a mirror failure.

Work: wr-2026-09-27-ledger-both-halves (`docs/work/wr-2026-09-27-ledger-both-halves.record.md`).

Inputs (by path):
- L1's own brief: `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/briefs/L1.md`.
- `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/spec.md` and `contracts.md` —
  contracts.md wins; the spec's own Acceptance section names the attack brief, reproduced and
  extended below.
- `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/briefs/scout-L1.md` — the `base`-object
  integration point, the async-`execFile`-has-no-`input:` landmine, and the open question about
  `note-flush.mjs:1512` — confirm L1's report actually states a resolution for it, not silence.
- L1's report, diff, and gate log in its worktree (`/home/ben/Code/wt-ledger-both-halves-1-L1`,
  `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/reports/L1-gate.log`).

PROJECT FACTS:
- `node --test <file>` is the test runner; no build step.
- Never set or switch a git identity; never push; no trailers; never send peer notes.
- Verdict word first: `APPROVE` or `NEEDS_FIXES`, on its own at the top of your report.

NOT (out of scope):
- You never run the full-suite gate (`node scripts/run-tests.mjs`) — that's the integrator's job.
- You never touch any file outside L1's own map, even to check something — read-only, plus
  whatever's needed to re-run tests.
- You never grant APPROVE to work that fails its OWN gate — a failing gate log handed to you is an
  immediate `NEEDS_FIXES`, or a stop-and-report if you were spawned before the gate ran at all.

Evidence format: every finding carries severity (blocker/major/minor), file:line, and either a
measured count (grep output, actual test run output) or a ready-to-apply patch (exact old → exact
new) the builder can apply verbatim. Verdict first, findings after.

## Attack brief (spec's own, plus contracts' Facts, reproduced and extended)

Run these against the diff yourself, don't take the builder's report's word for any of them:

1. **An envelope containing a character that breaks the remote append.** Confirm the stdin write to
   the ssh child is argv/stdin-based (never a shell string interpolating the note text), and that
   `--append-ledger`'s own read-and-parse (`parseEnvelope` + length check) genuinely rejects a line
   that fails the grammar rather than writing a partial/garbled line. Try a line with an embedded
   `\n`, a line over 700 chars, and a line with a shell metacharacter (`` ` ``, `$(...)`, `;`) in the
   body — the local envelope validation already rejects most of these before send, so focus on
   whether `--append-ledger`'s OWN validation (the peer side) independently re-checks rather than
   trusting the sender.
2. **A mirror to the wrong host from a stale address table.** Confirm the host table is the one
   frozen constant contracts R1 names (four hosts, exact addrs) and that an address matching NONE of
   them produces `mirrorLedger: {host: null, ok: false, error: 'unknown-sender-address'}` — not a
   guess, not a crash, not a mirror to some default host.
3. **A mirror that duplicates when note-send retries a deferred send.** This is the section-4 open
   question in L1's brief — read the builder's stated resolution and independently verify it: does
   `runOverdueAsks` (note-flush.mjs:1512) actually risk a double-mirror when it calls `runNoteSend`
   for a nudge? Does the outbox retry / `drainQuietly` path (which never calls `runNoteSend`) have a
   real test proving the mirror dependency is never reached from it? Run that test yourself.
4. **The mirror running for a `--to ben` note.** Confirm there is NO carve-out — grep the diff for
   `isBen` near the mirror call/attachment point and confirm the mirror logic does not check it.
5. **The timeout not bounding a hung ssh.** Confirm the 5 s bound actually kills the child (not just
   a `Promise.race` that abandons a still-running ssh process) — check for `killSignal`/`kill()` on
   the timeout branch, the same shape `makeOrcaRunner` uses for its own orca timeout.
6. **Anything printed from the environment.** Grep the diff for every read of
   `SSH_CONNECTION`/`SSH_CLIENT`/`env.` near the sender-host code and confirm NEITHER raw value is
   ever written to stdout, stderr, a log, or the JSON result — only the mapped host `name` may
   appear. Also confirm no OTHER environment variable is read for this feature (R1: "read no other
   environment variable").
7. **`--dry-run` and `--no-mirror`.** `--dry-run` must show the planned mirror (host name + exact
   remote command) without any spawn — confirm no `deps.spawnMirror` (or equivalent) call happens on
   that path. `--no-mirror` must skip it unconditionally and silently (no `mirrorLedger` key) even
   when the sender host would otherwise be remote.
8. **The byte-identical line, and no re-mirror by construction.** Confirm the line appended by
   `--append-ledger` is byte-identical to what was sent (including the id), and that `--append-ledger`
   itself has a test proving it never invokes the mirror dependency, writes no outbox entry, and does
   no delivery — "never re-mirrored... by construction" (spec item 3) needs this test to exist, not
   just be true by inspection.
9. **`mirrorLedger` absence vs. `ok:false`.** Confirm a genuinely local send (no SSH env, no
   `--sender-host`) has NO `mirrorLedger` key at all — not `null`, not `{ok:true}` — and that this is
   distinct from the "unknown-sender-address" case, which DOES carry the key with `ok:false`.
10. **Nothing outside L1's map changed.** `git diff --stat` against the worktree's base
    (`026a7a0717964a5bcf3d70a93240f9ff1cfa8004`) should show only `skills/multi/scripts/note-send.mjs`,
    `skills/multi/scripts/note-send.test.mjs`, and `skills/multi/SKILL.md`. Any edit to
    `transport.mjs`, `note-flush.mjs`, `envelope.mjs`, or `references/envelope.md` is a blocker.
11. **N2 still green.** Run
    `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` yourself — a new test
    that spreads `process.env` directly (instead of using `childEnv()`) trips this repo-wide.
12. **The two SKILL.md sentences.** Confirm both landed at the exact spots named in L1's brief
    (:306-308's cross-host paragraph, and the :140-143 overdue-cross-host sentence) and say what they
    actually claim — "the line now lands on both hosts" and what `mirrorLedger` means, plus "until
    the sender's host has the thread too" on the overdue sentence — not a generic restatement.

Report: `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/reports/L1-review-<round>.md` (e.g.
`L1-review-1.md` — increment `<round>` on each re-review). Line 1 is the verdict, first word:
`APPROVE` or `NEEDS_FIXES`.

A result of zero findings is a good answer if you genuinely attacked all twelve points above and
found nothing — say what you tried, don't manufacture a finding to look thorough.

Autonomy: you decide APPROVE/NEEDS_FIXES; you never decide to merge, accept, or ship.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
