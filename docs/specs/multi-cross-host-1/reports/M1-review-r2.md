VERDICT: NEEDS_FIXES a7b22426f5209c404b747b6121a24cebdd4b90fe

# M1 delta re-review, round 2: code artifact a7b2242 (docs-only commits follow it up to 0bde489)

Scope: verify F1-F7 from M1-review.md against the lead's rulings (addendum-M1-r2.md), hunt for
regressions the fixes introduced, and re-run the F1, F3 and F4 mutation checks. Read-only on the
worktree. All mutations and trial patches ran on a `git archive` copy of a7b2242 in the session
scratchpad; each was restored byte-for-byte afterwards (cmp against `git show`). The worktree has no
changes from me except this report.

Gate: `node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/note-flush.test.mjs`
reported 314 tests, 314 pass, 0 fail.

Result: all seven round-1 findings are fixed, and the fixed code is correct. Two new MINOR items
came in with the fixes, both mechanical and both with tested patches:
- R2-1: the docs now contradict the F5 code.
- R2-2: a regression guard does not guard the case its name claims, and a mutation that refuses every
  real registered peer survives.

## C4 fields

Cause: Round 1 found four problems. First, a foreign-host inbox record exempted the refusal (F1).
Second, the prose advised `--sender-host <this host>`, which does nothing for a local run (F2).
Third, two mutations survived: F3 (inbox scoping) and F4 (the at-or-after boundary). Fourth,
`--dry-run` previewed success for a send that would be refused (F5). Round 2 added a docs sentence
for F5 that the F5 code then made false, and a same-host guard test with no `host` stamp.
Discriminating check: The F1, F3, F4 and F5 mutations each fail at least one test now. The mutation
`(!localInboxRec.host)`, which treats every stamped record as foreign, still passes all 314 tests.
The docs say "`--dry-run` never refuses", but the test "Defect 1: --dry-run on the quiet path reports
the exit-6 refusal too" asserts exit 6.
Fix location: skills/multi/SKILL.md:438, skills/multi/references/envelope.md:186,
skills/multi/scripts/note-send.test.mjs (one new test).
Simplification: No code change is needed. The code is right; one docs sentence in each of two files
changes and one test is added.

## Round-1 findings, verified

| # | Status | Evidence |
|---|---|---|
| F1 | FIXED | note-send.mjs:512-514 checks the host, and :544 fires Case A when `inboxRecord` is set. `canRefuse` already implies `!localInboxRegistered`, so an `inboxRecord` that reaches Case A is a foreign one. A local record never takes this path. The host comparison uses raw `os.hostname()`, which is exactly what `claudeInboxRecord` and `codexInboxRecord` stamp (transport.mjs:1517, :1539) and what C7 compares (inbox-claude.mjs:181, inbox-codex.mjs:200). They agree. Mutations: reverting the predicate fails 2 tests, and reverting the Case A `|| inboxRecord` fails 1. See R2-2 for the surviving inverse mutation. |
| F2 | FIXED | The JSON `hint` is byte-exact to the pin (note-send.mjs:534, and existing tests still assert it). The prose was rewritten per the ruling in the error message (:529-533), SKILL.md:380 and :433-436, and envelope.md:179-183. None of them documents `--sender-host <recipient host>`. NIT: the thrown message omits the ruling's clause "`--sender-host` naming the machine you are on has no effect". SKILL.md and envelope.md include it, so this is optional. |
| F3 | FIXED | The new test "an inbox registered for a DIFFERENT slug does not exempt --to". The `Object.keys(...).length > 0` mutation now fails 2 tests. |
| F4 | FIXED | The new test "an ACK in the SAME minute…". The `<=` mutation now fails 1 test. note-flush.mjs itself is unchanged this round (diff 3ba1cb4..a7b2242 touches only its test). |
| F5 | FIXED in code; docs regressed (R2-1) | `!dryRun` was dropped from the predicate (note-send.mjs:522). Restoring it fails 1 test. |
| F6 | FIXED | USAGE at note-send.mjs:1079 lists `[--local-ok]`. |
| F7 | FIXED | Both refusal tests now assert that neither `~/.agents/notes` nor `repo/docs` exists. The ledger, mirror and outbox all live under those two roots, so a write to any of them would fail the test. |

## Judgment on the F5 scoping note

I accept the scoping, but the report describes the typed case wrongly. The builder says a typed
`--dry-run` in the refusal set "still previews the … 'would record and exit 3' line". It does not.
Every send in the refusal set has no `--recipient-repo`, and dry-run resolves no pane, so the
target-repo chain always reaches `--dry-run without --recipient-repo cannot decide where the note
would live` and exits 1. A probe of a typed ASK with `--dry-run`, no inbox, no mirror and no
`--recipient-repo` gave exit 1. No send in the refusal set previews success on any path, so the
lead's ruling ("reports the same refusal instead of previewing success") is met in substance: exit 6
where the answer is knowable without orca, and exit 1 (never a success preview) where it is not.
The builder's report is not code, so this needs no fix. The report paragraph is simply inaccurate.

## Regression hunt, verified absences

- Same-host sends with a registered peer: a probe with a record stamped `host: os.hostname()` and an
  FYI gave exit 0. A missing `host` also exempts, which matches C7's `record.host &&` guard.
- `--no-type` with `--dry-run` in the refusal set: exit 6, nothing written. That is correct under the
  ruling.
- `--dry-run` with `--local-ok`: previews exit 0, which is tested.
- Callers: none of the round-2 changes touches the predicate's `--recipient-repo` exemption. The three
  live callers (collect-status.mjs:161-168, decisions-pickup.mjs:537-545, note-flush.mjs:1618-1622)
  all pass `--recipient-repo`, so they are still exempt. None has a `--dry-run` path.
- Refusal off: fails 7 tests (3 in round 1). Dropping Case B fails 1.

## Findings

### R2-1 MINOR: the docs say `--dry-run` never refuses, but it does now
Evidence: SKILL.md:438 says "`--dry-run` never refuses — it previews the send it would attempt,
unaffected by exit 6." envelope.md:186 says "`--dry-run` never refuses." But note-send.mjs:522 no
longer excludes dry-run. The test "Defect 1: --dry-run on the quiet path reports the exit-6 refusal
too" asserts exit 6, and my probe of `--no-type --dry-run` also exits 6. That sentence was my round-1
docs-only alternative; the lead chose the code fix instead, so the sentence should not have landed.

Patch for SKILL.md:438. Current:
```
`--dry-run` never refuses — it previews the send it would attempt, unaffected by exit 6.
```
Replacement:
```
`--dry-run` refuses the same way (exit 6, same JSON, nothing written) whenever that is knowable
without a pane lookup: a ledger-only ACK/FYI, `--no-type`, or a foreign-host inbox record. A typed
send in the same situation exits 1 under `--dry-run` instead (no `--recipient-repo`, no pane to plan from).
```
Patch for envelope.md:186. Current:
```
   still has no inbox for that slug. `--dry-run` never refuses.
```
Replacement:
```
   still has no inbox for that slug. `--dry-run` reports the same exit-6 refusal on every path that
   needs no pane lookup (quiet kind, `--no-type`, foreign inbox); a typed dry-run exits 1 there.
```
Predicted outcome: docs only, so tests are unaffected. Both statements match the probe results.

### R2-2 MINOR: the "SAME-host" guard test does not test a stamped record, so a mutation that refuses every real registered peer survives
Evidence: the test "Defect 1: a SAME-host registered inbox still exempts --to as before (no host
field, or matches os.hostname())" writes a record with no `host`. Every real registration is stamped
with `host: os.hostname()` (transport.mjs:1517, :1539). Mutating note-send.mjs:514 to
`(!localInboxRec.host)` would refuse every quiet or `--no-type` send to a genuinely registered local
peer with exit 6, and it passes all 314 tests.

Patch: append to note-send.test.mjs after that test (`os` is already imported at :6). Tested on the
scratch copy: it passes on a7b2242, and under the mutation the "Defect 1" subset goes from 15 pass to
14 pass, 1 fail.
```js
test('Defect 1: a registered inbox stamped with THIS host (as every real registration is) still exempts --to', async () => {
  const repo = tmp(); const home = tmp();
  writeInbox(home, 'nucleus', { kind: 'codex-queue', codexHome: '/x', threadId: 't', cwd: repo, host: os.hostname() }, { now: NOW });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films'],
    { orca: mockOrca({ panes: [] }), home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } },
  );
  assert.equal(res.exitCode, 0);
});
```
Optionally, rename the existing test by dropping "or matches os.hostname()" from its title, since it
only covers the no-host case.
