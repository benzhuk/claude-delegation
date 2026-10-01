VERDICT: NEEDS_FIXES 3ba1cb43ebfea2e26aa0ab5804c9a7771698206e

# M1 review, lane 25 (multi-cross-host), artifact 3ba1cb4

Reviewed: diff 0c92605..3ba1cb4 plus the spec pack, the M1 report and its state file. Read-only on the
worktree. Every mutation and trial patch ran on a `git archive` copy of 3ba1cb4 in the session
scratchpad. That copy was restored byte-for-byte afterwards (cmp confirmed), and `git status` in the
worktree is clean.

Summary: both pinned rules are implemented correctly. There are no blockers and no majors. I found
7 items: 4 MINOR and 3 NIT. The substantive one is F1, a lost-note path the brief asked me to hunt:
an inbox record stamped with another machine's hostname exempts the refusal. F3 and F4 are real
"passes because it isn't looking" gaps: two mutations survive the suite. Every item except F2 has a
ready patch. The F1, F3 and F4 patches were run on the scratch copy (309/309 pass), and the new
tests fail under the surviving mutations.

Gate as briefed: `node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/note-flush.test.mjs`
gives tests 307, pass 307, fail 0.

## C4 fields

Cause: Defect 1. A slug send with no local inbox, no mirror target and no `--recipient-repo` wrote
the local ledger and posted to nobody: ACK/FYI and `--no-type` resolve no pane, and H3 turned a
not-found pane into exit 2 after the write. Defect 2. `collectOverdueAsks` counted only RESULT and
BLOCKED as answers, so an ASK with `Needs: ack` that was ACKed on time still drew an overdue BLOCKED.
Discriminating check: Refusal off (`canRefuseNoLocalRecipient = false`) fails 3 tests. Dropping Case A
fails 2, dropping Case B fails 1, and making Case B refuse ambiguous panes fails 4. Removing the ACK
second pass fails 1, and each of from, stale and needs fails at least 1. Two mutations survive
(F3, F4).
Fix location: skills/multi/scripts/note-send.mjs:509-528 (refusal predicate and Case A), :600-602
(Case B), :1103-1106 (failureJson). skills/multi/scripts/note-flush.mjs:1404-1427 (ACK second pass).
Simplification: One predicate (`canRefuseNoLocalRecipient`) and one factory, used at two sites:
before any pane lookup (quiet or `--no-type`) and right after typed-path resolution. The ACK rule is
a single extra pass over envelopes already parsed. No new files and no new state.

## Brief question 1: are the refusal conditions exact?

Verified correct, with code and a probe on the scratch copy:
- `--to ben`: `slugWasGiven` is false (note-send.mjs:474), so it never refuses. Tested.
- `--recipient-repo`: note-send.mjs:511. Tested, and the mutation is caught by 5 tests.
- `mirrorTargetHost` null: :512. Tested through `--sender-host`. `--no-mirror` together with
  `--sender-host <remote>` refuses, which is correct (probe).
- No inbox for `--to`: :509 reads it independently of `--no-type`, which is correct. See F1 and F3.
- Quiet, `--no-type`, or typed not-found: Case A :526 runs before the drain, pane lookup, packet,
  ledger, mirror and outbox. Case B :600 runs after resolution and before step 4, so no ledger, packet,
  mirror, outbox or wake-queue write has happened yet. The only earlier side effect on the typed path
  is the piggyback drain of other notes' backlog, which is pre-existing and not this note.
- Case variants: slugs are lowercase-only (`assertLowercase` in envelope.mjs:86-88), so `--to Skills-Fable`
  exits 1. There is no case hole.
- `--by`/`--needs` variants are irrelevant: none of them enters the predicate. An ACK with `--re`
  refuses (probe).
- A malformed or unreadable inboxes file reads as `{}` (transport.mjs:1285), so the send refuses with
  exit 6 and writes nothing (probe). That fails safe.
- Ambiguous pane on the typed path: stays exit 2 and still records (tested). A true not-found is the
  only message starting `no pane titled "` (transport.mjs:382-386).
- A raw handle is never refused: it has no slug, and a handle that doesn't resolve already records
  nothing (:586-589).
- The refusal JSON is a superset of the pinned object and always goes to stdout (main,
  note-send.mjs:1162). The hint string matches the spec verbatim.
- `--dry-run` is excluded from the predicate: see F5.

Paths that are now refused, accepted as spec trade-offs: a same-host peer whose pane is currently
gone or retitled without a binding, and a slug that is "known" only from recent ledger lines. Both
are exactly what `--local-ok` exists for.

## Brief question 2: callers

Verified absence of regressions. I grepped scripts/, hooks/ and skills/ for callers that build argv:
- scripts/collect-status.mjs:161-168 always passes `--no-type --recipient-repo`, so it is exempt.
- skills/decisions/scripts/decisions-pickup.mjs:537-545 always passes `--recipient-repo`, so it is exempt.
- skills/multi/scripts/note-flush.mjs:1618-1622 (the overdue nudge) always passes `--recipient-repo`
  and skips the send when none resolves (:1607-1614), so it is exempt.

janitor.mjs, goal-card.mjs, the hooks, mirror-shared-skills.mjs and build-loop-workflow.js only
mention note-send; none of them sends. The outbox drain re-delivers entries that are already
recorded and never calls runNoteSend. No live caller hits exit 6.

## Brief question 3: the ACK rule

Verified correct, at note-flush.mjs:1416-1427:
- Only an ASK with `needs === 'ack'` counts. The regex captures `ack` exactly, and "ack by 22:00"
  parses as needs=ack, by=22:00, which is correct.
- The ACK must come from `ask.to` (self-ACK rejected), carry `re === ask id`, and have an instant at
  or after the ASK's.
- An ACK to a review ask still does not answer it. The rewritten pinned test at
  note-flush.test.mjs:1848 still asserts the `Needs: review` case (`calls.length === 1`). The mutation
  that drops the needs check fails it.
- A cross-host ACK that exists only in the mirror half counts, because the corpus is `notesDir(home)`
  (:1399), which is where `--append-ledger` writes.
- Divergence, harmless: `hasReplyLine` also requires `g.to === ask.from`, and the ACK pass does not.
  The spec lists only from, re and instant, so this is compliant. An ACK sent to a third party
  still counts as the acknowledgement.
- See F4: the "at" half of "at or after" is untested.

## Brief question 4: the "inbox IS registered" clause

The builder is right that the literal clause cannot be reached. With an inbox registered for the
same `--to`, the typed path always takes the inbox branch (note-send.mjs:561-569, C9) and ends in
exit 0 or exit 3. It never runs a pane lookup, so exit 2 can't occur. There is no shape where the
inbox is registered, the kind is typed, and a pane lookup still runs.

The builder's substitute test does not prove what the report says it proves. It registers an inbox
for `someone-else-entirely` but also passes `--recipient-repo`, which exempts the send on its own.
Mutating the check to "any inbox anywhere exempts" passes the whole suite (F3). The contrapositive
("an inbox registered for `--to` exempts the quiet path") is covered only incidentally, by the
pre-existing test "N1: even a registered inbox is never posted to for a ledger-only kind", which is
the only test that fails when condition 4 is dropped. My judgment: the clause should have been read
as "the refusal is scoped to the `--to` slug's own registration". F3 adds the test that is missing.

## Brief question 5: mutation results (scratch copy)

| Mutation | Failing tests |
|---|---|
| refusal off | 3 |
| drop inbox condition | 1 (N1, incidental) |
| any inbox exempts | **0, survives (F3)** |
| drop `--recipient-repo` condition | 5 |
| drop mirror condition | 1 |
| drop `--local-ok` | 9 |
| drop Case A | 2 |
| Case A quiet-only | 1 |
| Case A no-type-only | 1 |
| drop Case B | 1 |
| Case B also refuses ambiguous | 4 |
| drop `!dryRun` | **0, survives (F5, unpinned)** |
| ACK pass off | 1 |
| ACK drop from | 1 |
| ACK drop stale | 1 |
| ACK drop needs | 2 |
| ACK `>` instead of `>=` | **0, survives (F4)** |

## Brief question 6: docs

The SKILL.md exit table row and paragraph, envelope.md N3 and the overdue-asks-1 spec amendment
(line 14) match the code, with two exceptions: the `--sender-host <this host>` advice (F2) and the
missing `--local-ok` in USAGE (F6). SKILL.md and N3 also do not mention that `--dry-run` never
refuses (F5).

## Findings

### F1 MINOR: a foreign-host inbox record exempts the refusal, so the note lands only in the local ledger
Evidence: note-send.mjs:509 counts any record in `inboxes.json`. inbox-claude.mjs:179-188 and
inbox-codex.mjs:198-207 (C7) treat a record whose `host` is not `os.hostname()` as "this machine has
no inbox for that slug". The comment there names a restored backup or a synced profile as the source.
Probe on the scratch copy, with skills-fable registered with `host: "ben-desktop"` and the probe
running as a different host:
- FYI: exit 0, ledger-only here, `wake: none`. The quiet path never calls delivery, so the record is
  never dropped, and every ACK and FYI to that slug keeps being lost.
- Typed ASK: exit 3. The local ledger only; the record is dropped, "registered on ben-desktop".

This is precisely the "a note nobody here can read lands only in the local ledger" shape. It
satisfies the spec's literal "registered in this machine's inboxes file", but not the spec's intent.

Fix (patch, tested: 309/309 pass, and both probe cases become exit 6 with nothing but inboxes.json in the notes dir):

note-send.mjs:509, current:
```js
  const localInboxRegistered = slugWasGiven ? Boolean(readInboxes(home, fsImpl)[toRaw]) : false;
```
replacement:
```js
  // C7 (inbox-claude.mjs:179-188, inbox-codex.mjs:198-207): a record stamped with another machine's
  // hostname means this machine has no inbox for that slug, so it must not exempt the refusal either.
  const localInboxRec = slugWasGiven ? (readInboxes(home, fsImpl)[toRaw] ?? null) : null;
  const localInboxRegistered = Boolean(localInboxRec)
    && (!localInboxRec.host || localInboxRec.host === os.hostname());
```
note-send.mjs:526, current:
```js
  if (canRefuseNoLocalRecipient && (quietSkipsResolution || noType)) {
```
replacement (a foreign `inboxRecord` would otherwise route the typed path into the inbox branch and exit 3):
```js
  if (canRefuseNoLocalRecipient && (quietSkipsResolution || noType || inboxRecord)) {
```
Also add a test: `writeInbox(home, 'nucleus', { kind: 'codex-queue', codexHome: '/x', threadId: 't', host: 'another-box' }, { now: NOW })`,
then an FYI to nucleus should reject with exit 6.

### F2 MINOR: `--sender-host <this host>` has no effect on a local invocation, so a caller who follows the hint is refused again
Evidence: resolveSenderHost plus `mirrorIsLocal` (note-send.mjs:459-461). When `--sender-host` names
this machine, by hostname label or by tailnet address, `mirrorTargetHost` is null and the send is
refused again with exit 6. Probe, both variants: exit 6. What actually delivers from a local shell is
`--sender-host <the recipient's host>`: the probe gives exit 0, `mirrorLedger {host: ben-desktop, ok: true}`,
and the line lands in the recipient host's `~/.agents/notes`. The advice is correct only inside the ssh
command on the recipient's machine, and only when SSH_CONNECTION does not map.

The hint string is pinned verbatim by the spec, so leave the code as it is and route the wording to
the lead. SKILL.md:430-431 goes further and says "or pass `--sender-host <this host>` so the
cross-host mirror carries it", which is wrong for a local run.

Fix (docs, judgment call for the lead): at SKILL.md:380, :430-431 and envelope.md:178-179, say
either "run note-send on the recipient's machine over ssh (inside that command, add
`--sender-host <the host you came from>` if SSH_CONNECTION does not map)" or, from a local shell,
"`--sender-host <the recipient's host>` mirrors the line into the recipient's ledger". Decide which
one R1's semantics should bless. If the lead agrees, amend the pinned hint in the spec with a dated
line.

### F3 MINOR: no test shows that an inbox for a different slug does NOT exempt the refusal; the report claims coverage it lacks
Evidence: the mutation `Object.keys(readInboxes(...)).length > 0` at note-send.mjs:509 passes all
307 tests. The test at note-send.test.mjs:1175-1187 passes `--recipient-repo`, which exempts the send
by itself. The claim in M1-report.md (the "Interpreted instead as proving…" paragraph) is therefore
wrong.

Patch: append after note-send.test.mjs:1187. It is tested to pass on 3ba1cb4 and to fail under the mutation.
```js
test('Defect 1: an inbox registered for a DIFFERENT slug does not exempt --to - still exit 6, nothing written', async () => {
  const repo = tmp(); const home = tmp();
  writeInbox(home, 'someone-else-entirely', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't9' }, { now: NOW });
  const orca = mockOrca({ panes: [] });
  const err = await rejectsWith(
    runNoteSend(
      ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films'],
      { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } },
    ),
    6,
  );
  assert.equal(err.refused, 'no-local-recipient');
  assert.deepEqual(err.ledgers ?? [], []);
  assert.deepEqual(fs.readdirSync(path.join(home, '.agents', 'notes')).filter((f) => f !== 'inboxes.json'), [], 'no ledger, no outbox');
  assert.equal(fs.existsSync(path.join(repo, 'docs')), false);
});
```
Also correct the M1-report paragraph, which is the builder's file.

### F4 MINOR: "at or after" has no test for the "at" half
Evidence: the mutation `ackAt < askAt` to `ackAt <= askAt` (note-flush.mjs:1426) passes all tests.
Envelope times have minute resolution, so an ACK in the same minute as the ASK is the common fast
case. Dropping it would bring back the 2026-09-27 false BLOCKED.

Patch: append after note-flush.test.mjs:1906. It is tested to pass on 3ba1cb4 and to fail under the mutation.
```js
test('overdue-asks: an ACK in the SAME minute as its Needs: ack ask answers it (at or after) - never nudged', async () => {
  const home = tmp();
  seedOverdueState(home);
  writeOverdueLedgerLine(home, '2026-09-26', askLine({ needs: 'ack' }));
  writeOverdueLedgerLine(home, '2026-09-26', ackLine({ time: '20:00' }));
  writeInbox(home, 'astra', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't4g', cwd: home }, { now: DEADLINE });
  const calls = [];
  const result = await runOverdueAsks([], overdueContext(), { home, now: DEADLINE + 16 * 60_000, send: stubSend(calls) });
  assert.equal(calls.length, 0, 'at-or-after: a same-minute ACK from the recipient answers it');
  assert.equal(result.open, 0);
});
```

### F5 NIT: `--dry-run` previews success for a send that would be refused
Evidence: `!dryRun` at note-send.mjs:511. Probe: `--dry-run` on a quiet FYI previews "exit 0,
append envelope to …" while the same send without `--dry-run` exits 6. The spec says nothing on
dry-run, but N4's own principle is that "a preview that cannot see … describes the wrong world".

Fix: in dry-run, when every refusal condition holds, push a plan line instead of throwing. For the
quiet or `--no-type` path: `refused: exit 6 no-local-recipient, nothing would be written (--local-ok bypasses)`.
For the typed path: `if no pane resolves: exit 6 no-local-recipient`. Also add one sentence to
SKILL.md saying dry-run never refuses. The code change is optional; the docs sentence is not.

### F6 NIT: USAGE does not list `--local-ok`
Evidence: note-send.mjs:1061. The exit line mentions it, but the flag synopsis does not.

Patch, current:
```
            [--sender-host <name>] [--no-mirror] [--no-type] [--no-drain] [--dry-run] [--json]
```
replacement:
```
            [--sender-host <name>] [--no-mirror] [--local-ok] [--no-type] [--no-drain] [--dry-run] [--json]
```

### F7 NIT: the quiet and `--no-type` refusal tests don't assert that nothing was written
Evidence: note-send.test.mjs:1125-1150 assert only `refused` and `orca.calls.length === 0`. The code
is correct, since Case A throws before any write (probe confirms: no ledger), but the tests would not
notice a write that crept in ahead of it.

Patch: add to both tests after the `refused` assert:
```js
  assert.equal(fs.existsSync(path.join(home, '.agents', 'notes')), false, 'no ledger, no outbox');
  assert.equal(fs.existsSync(path.join(repo, 'docs')), false, 'no repo ledger');
```
