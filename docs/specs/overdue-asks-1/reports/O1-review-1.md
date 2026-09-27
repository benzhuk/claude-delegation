VERDICT: NEEDS_FIXES (5) e1bd2d5059f5991bb97f10ec821c5900f1566558

# O1 review, round 1: overdue-asks-1 (note-flush.mjs overdue pass)

Reviewed: worktree /home/ben/Code/wt-overdue-asks-1-O1 at `e1bd2d5059f5991bb97f10ec821c5900f1566558` (from `git rev-parse HEAD`), diff against d5d769f (the lead's spec commit). The builder's diff touches exactly the three O1 files plus its own reports. It does not touch docs/work or any O2 file.
Gate re-run by me: `node --test skills/multi/scripts/note-flush.test.mjs`: 134 pass, 0 fail. This matches O1-gate.log. The worktree is clean after the run.

Counts: BLOCKER 0, MAJOR 2, MINOR 3, NIT 2, plus observations for the lead.

---

## MAJOR 1: R5's host-ledger-only fallback is not implemented. The nudge writes a repo ledger under the flusher's own cwd (for the systemd timer that is `$HOME/docs/ledger/`)

- Evidence: `note-flush.mjs:1496-1499` builds the send argv with no `--recipient-repo`. It relies on `runNoteSend` (note-send.mjs:380-406, inboxRecord branch). When the target inbox's recorded `cwd` is missing or no longer exists (a removed worktree, the common case for a finished builder), note-send falls back to `mainCheckout(worktreePathFromEnv(env) ?? process.cwd())`. For a directory that is not a repo, `mainCheckout` returns that directory itself (transport.mjs:429). note-send then appends a repo ledger there before it writes the host mirror (note-send.mjs:541).
- I reproduced this with the real `runNoteSend`, a scratch HOME and a scratch cwd, never the live home. The script is `/tmp/claude-1000/.../scratchpad/r5.mjs`. The inbox cwd was `/nonexistent/removed-worktree`. The nudge line landed in `<cwd>/docs/ledger/2026-09-26.md`, which was created from nothing, as well as in the host ledger.
- Why this matters in production: `note-flush.service` (`~/.config/systemd/user/note-flush.service`) has no `WorkingDirectory=`, so a user unit runs in `$HOME`. The flusher would create `~/docs/ledger/<ymd>.md` and keep growing it. On Windows, if the Task Scheduler cwd cannot be written (for example System32), the repo-ledger append throws before the host mirror and the inbox post (note-send.mjs:541 writes targets in order). The nudge is then lost, logged `overdue-send-failed`, and by R1 never retried. That silently defeats the goal for exactly the stale-inbox case.
- Contract: R5 says "The repo ledger is written only when the pickup's recipient-repo route can name a repo. Otherwise the host ledger only." The report (O1-report.md:79-85) does name the cwd fallback, but it presents the violation as acceptable. The brief required a check-in before this kind of deviation; the builder did not check in.
- Fix (judgment call; needs a lead ruling, because the clean fix touches note-send.mjs, which is outside O1):
  - (a) Preferred. The lead authorises a minimal host-ledger-only mode in `runNoteSend`, for example a `--host-ledger-only` flag that drops `ledgerPath(targetRepo)` from `ledgerTargets` and skips the targetRepo resolution. O1 then always passes it unless the next bullet applies.
  - When `inboxes[target].cwd` exists on disk, O1 passes `--recipient-repo <that cwd>` explicitly. That makes the "route can name a repo" case explicit rather than inherited.
  - (b) If the lead rules against touching note-send: pre-check inside O1 and only send when `inboxes[target].cwd && fs.existsSync(cwd)`, passing `--recipient-repo cwd`. Otherwise log `overdue-send-failed [<id>] ... no repo resolvable` and record the id. This is weaker, because it drops the nudge.
  - Either way, add a test with a stubbed `send` asserting that `--recipient-repo` is present when the cwd exists and absent (or that the host-only flag is set) when it does not.
  - Predicted outcome: no ledger writes outside `~/.agents/notes` or a real recipient repo, and no Windows cwd-dependent loss.

## MAJOR 2: SKILL.md documents both kill switches at the wrong path

- Evidence: `skills/multi/SKILL.md:142` says `~/.agents/notes/ws-off-overdue` and `~/.agents/notes/ws-off`. The code checks `~/.agents/ws-off-overdue` (`note-flush.mjs:1267`) and `~/.agents/ws-off` (`note-flush.mjs:1440`, via `agentsBase = path.resolve(home, '.agents')`). The code matches spec item 1 and R4; the doc does not. The test at note-flush.test.mjs (the kill-switch case) uses `.agents/ws-off-overdue`, which confirms the code path.
- The report repeats the wrong path at O1-report.md:30.
- Impact: someone trying to stop a nudge storm by following SKILL.md touches a file that nothing reads.
- Patch (SKILL.md:142). Current:
  ```
  ask. `~/.agents/notes/ws-off-overdue` turns this off, beside the shared `~/.agents/notes/ws-off`; the
  ```
  Replacement:
  ```
  ask. `~/.agents/ws-off-overdue` turns this off, beside the shared `~/.agents/ws-off`; the
  ```
  Also correct O1-report.md:30 to `~/.agents/ws-off-overdue`.

## MINOR 3: The nudge omits `Needs: none` (spec item 3)

- Evidence: spec item 3 says "Needs none". `note-flush.mjs:1496-1499` passes no `--needs`, so the envelope has no Needs field. My scratch run shows the posted line ending at `... with no RESULT or BLOCKED.`, with no `Needs: none`.
- Patch (`note-flush.mjs:1498`). Current:
  ```
        '--text', text, '--re', id, '--id', nudgeId,
  ```
  Replacement:
  ```
        '--text', text, '--needs', 'none', '--re', id, '--id', nudgeId,
  ```
- Test: in the test at note-flush.test.mjs:1741, after `assert.equal(flag('re'), 'astra-lane10-1');`, add:
  ```
    assert.equal(flag('needs'), 'none');
  ```
- `validateKindNeeds` accepts `none` for BLOCKED (envelope.mjs:122), and the built line still matches `ENVELOPE_RE`. Predicted: the gate stays green.

## MINOR 4: Attack-brief items 4, 6, 8 and 9 are behaviourally correct but not pinned by tests

I confirmed each behaviour by running `runOverdueAsks` from scratch (`scratchpad/edge.mjs`), and all are correct today:
- An ASK `re`-ing an ASK does not close it.
- A mixed corpus of `tonight`, `15:00 NY`, `25:00` and `21:30` nudges only the `21:30` one.
- Prune drops a 9-day-old entry and keeps a 1-day-old one.
- The state file is created with mode 600.

The reviewer brief requires the prune to be tested (item 6), and R2 names the ASK-re-ASK case explicitly. Add these tests (append to note-flush.test.mjs; they use only the existing helpers):
```
test('overdue-asks: an ASK carrying re <id> does not answer the original (R2)', async () => {
  const home = tmp();
  writeOverdueLedgerLine(home, '2026-09-26', askLine());
  writeOverdueLedgerLine(home, '2026-09-26',
    'taxonomy → astra, 9.26.26 20:10 NYC [taxonomy-lane10-1 re astra-lane10-1] ASK: Which branch? Needs: decision by 23:00');
  writeInbox(home, 'astra', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't15' }, { now: DEADLINE });
  const calls = [];
  const result = await runOverdueAsks([], overdueContext(), { home, now: DEADLINE + 16 * 60_000, send: stubSend(calls) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].argv[calls[0].argv.indexOf('--re') + 1], 'astra-lane10-1');
  assert.equal(result.open, 1);
});

test('overdue-asks: malformed by-times never stop a well-formed ASK in the same corpus', async () => {
  const home = tmp();
  for (const [n, by] of [[1, 'tonight'], [2, '15:00 NY'], [3, '25:00'], [4, '21:30']]) {
    writeOverdueLedgerLine(home, '2026-09-26', askLine({ id: `astra-lane10-${n}`, by }));
  }
  writeInbox(home, 'astra', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't16' }, { now: DEADLINE });
  const calls = [];
  const result = await runOverdueAsks([], overdueContext(), { home, now: DEADLINE + 16 * 60_000, send: stubSend(calls) });
  assert.deepEqual(calls.map((c) => c.argv[c.argv.indexOf('--re') + 1]), ['astra-lane10-4']);
  assert.equal(result.open, 1);
});

test('overdue-asks: state entries older than 8 days are pruned on write; file is mode 600', async () => {
  const home = tmp();
  writeOverdueLedgerLine(home, '2026-09-26', askLine());
  writeInbox(home, 'astra', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't17' }, { now: DEADLINE });
  fs.mkdirSync(notesDir(home), { recursive: true });
  fs.writeFileSync(overdueStatePath(home), `${JSON.stringify({
    'old-x-1': new Date(DEADLINE - 9 * 86_400_000).toISOString(),
    'recent-x-1': new Date(DEADLINE - 86_400_000).toISOString(),
  })}\n`, { mode: 0o644 });
  await runOverdueAsks([], overdueContext(), { home, now: DEADLINE + 16 * 60_000, send: stubSend([]) });
  const state = JSON.parse(fs.readFileSync(overdueStatePath(home), 'utf8'));
  assert.deepEqual(Object.keys(state).sort(), ['astra-lane10-1', 'recent-x-1']);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(overdueStatePath(home)).mode & 0o777, 0o600);
  }
});
```
(The third test seeds the file at 0o644, so the 600 assertion proves that the tmp+rename write sets the mode, not a pre-existing file.)

Also add one line to the kill-switch test proving that the shared `~/.agents/ws-off` alone also skips the pass. R4 names both switches, but only `ws-off-overdue` is exercised.
Measured on a scratch copy outside the worktree: all three pass on the current code. Mutation check: removing the `mode` and `chmodSync` from `writeOverdueState` makes the prune/mode test fail, as expected.

## MINOR 5: The `<m> nudged` count does not mean what SKILL.md says it means

- Evidence: by R2, a posted nudge (BLOCKED `re <id>`) is itself an answer. note-send writes the host ledger before it attempts delivery (note-send.mjs:541). So on the next pass the ASK is no longer open (`collectOverdueAsks`, note-flush.mjs:1378, 1383). In my scratch run, after one real send the ASK dropped out of `open` even though the inbox post failed.
- As a result, `buildOverdueStatus`'s `nudged` (the ids in the state file that are still open) counts only asks that were recorded but whose nudge never reached the host ledger: no inbox here, or a send that threw before the ledger write. That is not "how many of those have already been nudged" (SKILL.md:142-143). The status test at note-flush.test.mjs (the `2 open, 1 nudged` case) seeds the state file by hand, so it never exercises this interaction.
- Fix: keep the code, which is consistent with R2, and reword SKILL.md:142-143 to match. Current:
  ```
  status line's own `; overdue: <n> open, <m> nudged` suffix says how many are still unanswered and how
  many of those have already been nudged.
  ```
  Replacement:
  ```
  status line's own `; overdue: <n> open, <m> nudged` suffix counts the overdue asks still unanswered and,
  of those, how many were already handled once without a nudge landing (no inbox here, or the send
  failed) — a nudge that lands is itself a BLOCKED `re` the ask, so it closes the ask and leaves the count.
  ```
  Also update the report's autonomy call 2 to say this.

## NIT 6: The admission budget ignores the pickup's own run time

`main()` passes the same `elapsedMs` to both passes (`note-flush.mjs:1581-1583`), so time spent inside `runPostFlushPickup` is not counted against `PICKUP_ADMISSION_MS` (30 s, `:132`). This is harmless today and it matches spec item 1's "same admission budget" literally. If the lead wants a strict budget: `const afterPickupMs = Date.now() - startedAt;` before the overdue call, and pass that instead.

## NIT 7: No lock around the state file

State is read once per pass (`:1447`) and rewritten per id (`:1485`, `:1490`). Two concurrent standalone runs (the timer plus a manual `note-flush`) could both pass the check in the window before either one's BLOCKED reaches the ledger. The second guard is the BLOCKED itself: once it is in the host ledger, R2 closes the ask. So a double nudge needs a true overlap of a few seconds. I am not asking for a fix; I record it so nobody believes the state file alone is the guarantee.

---

## Attack brief, item by item

1. **Double nudge.** Verified. The id is recorded before the send (`:1490`, then send at `:1501`). The test at `:1741` makes a second call and gets no send, and the test at `:1914` shows a throwing send is not retried. Across days, a landed BLOCKED also closes the ask through R2. See NIT 7 for concurrent runs.
2. **Retirement.** Verified. `supersededIds(ledgerTexts)` (`:1372`) excludes superseded ids (`:1383`), and the test at `:1986` covers it.
3. **Timezone edge.** Verified. `overdueDeadlineMs` adds a day when `by` is earlier than the note's time and lets `Date.UTC` carry the overflow. The test at `:1834` (23:50 by 00:10) sees nothing at +5 min and a nudge at +16. My own run across a month end (9.30.26 23:50 by 00:10) gave open=0 at 00:24:59 and open=1 at 00:25:00.
4. **An ASK `re`-ing an ASK.** The code is correct (only RESULT/BLOCKED count, `:1378`) and my scratch run confirms it, but there is no test (MINOR 4).
5. **The piggyback path.** Verified. `drainQuietly` is unchanged, and the test at `:2001` checks both behaviour (no `overdue-*` log, no state file) and source text. The source slice ends at the next section rule, before `main()`, so the check is meaningful.
6. **Unbounded growth.** Implemented as a 7-day window (`:1389`) plus prune-by-age over 8 days on each write (`:1327-1334`, `:1354-1359`). There is no invented cap, and the report names prune-by-age. The window is tested (`:1972`); the prune is not (MINOR 4). I checked the prune from scratch.
7. **Send failure.** A throw or a not-ok result is logged `overdue-send-failed [<id>]` and not retried (`:1502-1514`). The call site at `main()` `:1583` sits in its own try/catch after stdout is already written, and `main` always returns 0 on this path. `runNoteSend` itself writes nothing to stdout, so `--json` output is unchanged. See MAJOR 1 for a failure mode that loses the nudge.
8. **Malformed `by`.** Verified. `parseByTime` is strict and range-checked (`:1270-1277`) and returns null rather than throwing. A mixed corpus still nudges the well-formed ASK (my scratch run). The mixed case is not tested (MINOR 4).
9. **Mode 600 and atomic write.** Verified in code (`:1337-1352`: rm stale tmp, `writeFileSync` with mode 0o600, `chmodSync`, `renameSync`, tmp cleaned up on failure) and on disk (my scratch run showed mode 600). There is no test (MINOR 4).
10. **Id collision.** Verified. The nudge id is `note-flush-<topic>-overdue-<n>`, and `buildEnvelope` forces a `note-flush-` prefix. An ASK can only carry that prefix if note-flush sent it, and note-flush sends only BLOCKED.
11. **Repo ledger versus host ledger only.** The report does say which case happened (the cwd repo), but the behaviour violates R5 (MAJOR 1).
12. **Status ordering and existing tests.** Verified. The suffix is appended after the pickup suffix on both branches (`:363`, `:385`). All 9 edited pre-existing assertions extend the exact string or regex, and every anchored `$` stays in place. None were weakened.

## Verified absences (first-class)
- No second send path. It reuses `runNoteSend` through a dynamic import, and `deliverToInbox` is never called.
- No edits to `envelope.mjs`, `transport.mjs`, `note-send.mjs`, `decisions-pickup.mjs`, `docs/work/`, or any O2 file.
- A corrupt state file fails closed with one log line per pass (`:1445-1452`, test `:1956`). `--status` treats a corrupt state file as `{}` and does not throw.
- No test sends a real note: `send` is stubbed in every new test.

## Observations for the lead (not builder defects)
- **Nudge burst on first deploy (measured).** A read-only `buildOverdueStatus` against this host's live `~/.agents/notes` reports `; overdue: 7 open, 0 nudged`. All 7 are `skills-fable → skills-n` "Needs: ack by …" asks from 9.26 that have no `re` reply at all (for example `skills-fable-merge-on-acceptance-1`, although that merge landed at b7ddf11). On the first timer run after merge, 7 BLOCKED nudges fire at once. Consider closing these out, or accepting the burst.
- Of the 55 ASKs with a `by`, 2 use the form `10:15 NYC` or `09:00 NYC`. R3 ignores these, as pinned. Say so if that form should count.
- The builder's report (O1-report.md:192-203) records a real, unstubbed send that appended a line to `/home/ben/Code/claude-delegation/docs/ledger/2026-09-26.md`, which the builder then hand-edited back. That path is untracked (`?? docs/ledger/`), so git cannot confirm the restore. Worth a glance by the lead.

## C4 fields
Cause: the pass delegates repo-ledger placement to `runNoteSend`'s inbox-cwd fallback (note-send.mjs:399), which writes into `process.cwd()` when the recorded cwd is gone; and the SKILL.md kill-switch paths were written under `notes/` instead of `~/.agents/`.
Discriminating check: run `runOverdueAsks` with the real send, a scratch HOME, an inbox whose `cwd` does not exist, and a non-repo cwd. A `<cwd>/docs/ledger/<ymd>.md` appears (reproduced). For the doc, compare SKILL.md:142 with `note-flush.mjs:1267` and `:1440`.
Fix location: `skills/multi/scripts/note-flush.mjs:1496-1499` (send argv, plus a lead ruling on host-only mode) and `skills/multi/SKILL.md:142-143`.
Simplification: none of the fixes add new machinery. The doc fixes are one-line substitutions. The R5 fix is at most one flag passed through to the existing send, pending the lead's ruling.
