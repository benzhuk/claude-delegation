VERDICT: NEEDS_FIXES (1) b05e85b07a39ddc2733337fb1b3c0982460ebe1e

# O1 review, round 2: overdue-asks-1 (delta re-review)

Reviewed: worktree /home/ben/Code/wt-overdue-asks-1-O1 at `b05e85b07a39ddc2733337fb1b3c0982460ebe1e` (from my own `git rev-parse HEAD`). Range `e1bd2d5..HEAD` is one commit, b05e85b. Outside the builder's own reports it touches only the three O1 files: SKILL.md, note-flush.mjs and note-flush.test.mjs. No out-of-territory file changed.

Gate re-run by me: `node --test skills/multi/scripts/note-flush.test.mjs` gave 141 pass and 0 fail, which matches the report. The worktree was clean afterwards.

Mutation check on a scratch copy outside the worktree (`<scratchpad>/r2`, left there and never in the tree). I made two changes:
- replaced the cwd existence guard with `inboxRecord?.cwd ?? 'x'`;
- dropped `'--needs', 'none'`.

The first sender-nudge test and both "no repo" MAJOR-1 tests then failed. The new tests catch both regressions.

Counts: BLOCKER 0, MAJOR 1 (carried forward, and it needs a lead ruling), MINOR 0, NIT 0.

---

## Prior findings: verification

| # | Round-1 finding | Status |
|---|---|---|
| MAJOR 1 | R5: stray repo ledger through note-send's process.cwd fallback | **Partly fixed.** The stray write is gone. The fallback that R5 requires (host ledger only) is still not implemented; nothing is sent instead. See MAJOR 1 below. |
| MAJOR 2 | Wrong kill-switch paths in SKILL.md | Fixed. SKILL.md:142 now reads `~/.agents/ws-off-overdue` / `~/.agents/ws-off`, which matches note-flush.mjs:1267 and :1440. The report's remaining `notes/ws-off` mention (O1-report.md:27) only quotes the old text as the "from" side of the fix. |
| MINOR 3 | `Needs: none` missing | Fixed. note-flush.mjs:1516 passes `'--needs', 'none'`, and test :1757 asserts `flag('needs') === 'none'`. The mutation removing it failed that test. |
| MINOR 4 | Items 4, 6, 8 and 9 untested | Fixed. The ASK-re-ASK test is at :2071, the mixed malformed `by` test at :2084, and the prune plus mode 600 test (seeded at 0o644) at :2096. The shared `ws-off` test at :1882 asserts `reason: 'kill-switch'`. In each block the only adaptation from my round-1 text is `cwd: home` on the inbox, which the new guard requires, and none of the assertions were weakened. The prune test's inbox has no cwd, so its send is now skipped, but the id is recorded before the guard, so the prune/mode assertions still exercise the write. |
| MINOR 5 | Meaning of the `nudged` count | Fixed. SKILL.md:143-145 uses my replacement text verbatim. |
| NIT 6, NIT 7 | Budget, lock | Not changed, as round 1 framed them (no fix requested). |

Nine pre-existing overdue tests were changed. The only change is adding `cwd: home` to `writeInbox`, which the new guard needs for a send to be reached. No assertion was removed or loosened; I checked each hunk in the diff.

---

## MAJOR 1 (carried forward): an unresolvable recipient repo now drops the nudge, where R5 and spec item 3 say to post it to the host ledger only

- Evidence: note-flush.mjs:1498-1508. When `inboxes[target].cwd` is missing or no longer exists on disk, the pass logs `overdue-send-failed ... no repo resolvable ...; not sent` and `continue`s. The id was already recorded (:1490), so the nudge is never retried.
- Contract: spec item 3 says "The note lands in the host ledger like any other; the repo ledger is written when … and skipped otherwise." R5 says "Otherwise the host ledger only." Under this code, a stale or absent cwd means no host-ledger line, no inbox post and no nudge at all. That is not "host ledger only"; it is "nothing".
- Compared with round 1, this trades a misplaced write (the repo ledger under the flusher's cwd) for a lost nudge. Against the goal ("work lost or stalled"), that is the worse side of the trade.
- A twin inside the same code: target selection (:1475) picks the sender whenever it is registered, and only then checks the cwd. Suppose the sender's record is stale (its worktree was removed) and the recipient has a live inbox with a live cwd. The pass then sends nothing, although a reachable party exists.
- The builder was transparent about this. The report (O1-report.md:9-18) says option (b) was taken because no lead ruling on option (a) arrived and option (a) touches note-send.mjs, which is outside O1. The report calls it a deferred lead call. The builder cannot close this alone; resolving it needs a lead ruling. Once the lead has ruled, the fix is one of:
  - **(a) Contract-faithful. The lead authorises a small change to note-send.mjs.** Add a `--host-ledger-only` flag to `runNoteSend` that skips targetRepo resolution and drops `ledgerPath(targetRepo, ymd)` from `ledgerTargets` (note-send.mjs:475-479). The inbox post (:608-614) still runs. O1 then passes `--recipient-repo <cwd>` when the cwd exists, which it already does, and `--host-ledger-only` otherwise, in place of the `continue` at :1507.
    - Test: stub `send`; a gone cwd yields exactly one call carrying `--host-ledger-only` and no `--recipient-repo`. Add one note-send test showing that the flag writes only `notesMirrorPath`.
    - Predicted: the nudge lands in every registered-inbox case, and no ledger is written outside `~/.agents/notes` or a real recipient cwd.
  - **(b′) The lead amends R5 / spec item 3 to accept "not sent" for an unresolvable cwd.** Then the only in-territory change I would still ask for is the twin: choose the first of `[ask.from, ask.to]` whose inbox has an existing cwd, and log `no repo resolvable` only when neither has one. Suggested replacement for the selection at :1475 plus the guard at :1498-1508:
    ```
    const reachable = (slug) => inboxes[slug]?.cwd && fsImpl.existsSync(inboxes[slug].cwd);
    const registered = inboxes[ask.from] ? ask.from : (inboxes[ask.to] ? ask.to : null);
    const target = reachable(ask.from) ? ask.from : (reachable(ask.to) ? ask.to : registered);
    ```
    and `const recipientRepo = reachable(target) ? inboxes[target].cwd : null;`. The no-inbox branch still keys on `!target`.
    - Test: the sender has a gone cwd and the recipient has `cwd: home`. Expect one send to the recipient, with `--recipient-repo home`.
    - Predicted: every existing test stays green, because they register only one party.
- Severity: MAJOR rather than BLOCKER, because both production registrars always record a cwd (hooks/multi-inbox.js:224 and hooks/multi-codex-hook.mjs:154). The loss therefore needs a removed worktree, and the failure is logged, not silent.

---

## Round-2 regression hunt: verified absences (first-class)

- **The `--recipient-repo` path is equivalent to the old fallback's good case.** note-send.mjs:374-375 resolves `--recipient-repo` with `mainCheckout(cwd)`. For an existing cwd, that is exactly what the inboxRecord branch (:392-393) did before. The `--recipient-repo` branch comes before the pane and inbox branches, and `pane` stays null because `inboxRecord` is set (:290, :321). So the pane-on-another-host exit 5 at :361 cannot trigger. Delivery through the inbox is unchanged.
- **The R1 ordering holds.** The id is still recorded (:1490) before both the new guard and the send. The no-repo branch is not retried on later passes; the test at :1964 asserts that the id is in the state file.
- **R4 is untouched.** The guard adds no throw path; `existsSync` does not throw. The `main()` try/catch and `drainQuietly` are unchanged.
- **Status/json.** The round-2 diff does not change them. With round 2's code, a no-repo drop is still counted in `nudged` while the ASK is open. That matches the reworded SKILL.md, whose "handled once without a nudge landing" covers this case.
- **Test portability.** The gone-cwd test uses a fixed name under `os.tmpdir()`. It would fail only if that exact directory existed; I judge that acceptable.
- **No out-of-territory edits.** Nothing in docs/work, note-send.mjs, transport.mjs, envelope.mjs or O2's files.

## C4 fields
Cause: to avoid note-send's process.cwd repo-ledger fallback, the round-2 fix skips the send entirely when the target inbox's cwd is unresolvable. That drops the host-ledger line which spec item 3 and R5 require in that case. It also checks reachability only after choosing the sender over a recipient that might be reachable.
Discriminating check: call `runOverdueAsks` with a stubbed `send`, a sender inbox whose `cwd` does not exist, and (optionally) a recipient inbox with `cwd: home`. Today `calls.length === 0`, and the log reads `overdue-send-failed [astra-lane10-1] -> astra — no repo resolvable`. A contract-compliant pass would make one call.
Fix location: skills/multi/scripts/note-flush.mjs:1475 and :1498-1508. Under ruling (a), also skills/multi/scripts/note-send.mjs:475-479 (a host-ledger-only flag); under ruling (b′), the amendment goes into contracts.md R5.
Simplification: under (a) the pass loses its early `continue` and always sends, with one flag chosen by `existsSync(cwd)`. Under (b′) the fix is a three-line target selection. Neither adds a new mechanism.
