VERDICT: NEEDS_FIXES (2) a97c0fd18f7bcac9c264dcf870021db9220ccfe2

# O1 review, round 3: overdue-asks-1 (delta re-review)

Reviewed: worktree /home/ben/Code/wt-overdue-asks-1-O1 at `a97c0fd18f7bcac9c264dcf870021db9220ccfe2`, taken from my own `git rev-parse HEAD`. The range `b05e85b..HEAD` has two commits:
- fb8adb3, the fix;
- a97c0fd, the gate-log refresh.

The code change touches only `skills/multi/scripts/note-flush.mjs` (+12/-1) and `note-flush.test.mjs` (+15). The rest of the range is the builder's own reports (O1-report.md, O1-state.md, O1-gate.log). No out-of-territory file changed: not note-send.mjs, not docs/work, and none of O2's files.

**Gate, re-run by me.** `node --test skills/multi/scripts/note-flush.test.mjs` gives 142 pass, 0 fail, which matches the report and the committed gate log. The worktree was clean before and after.

**Mutation checks.** I ran these on a scratch copy at `<scratchpad>/r3`, taken with `git archive HEAD`, never in the tree. I left the copy in place.
- M1: `const target = registered;`, which reverts the twin fix. The new test at note-flush.test.mjs:1989 fails (141/1). The fix is real and the test pins it.
- M2: the preference reversed to recipient-first. **All 142 tests still pass.** See MINOR 2.

Counts: BLOCKER 0, MAJOR 1 (carried; the builder cannot close it without a lead ruling), MINOR 1 (new), NIT 0.

---

## Prior findings: verification

| # | Round-2 finding | Status |
|---|---|---|
| MAJOR 1, twin (a stale sender chosen over a reachable recipient) | **Fixed.** note-flush.mjs:1481-1483 is the three-line selection I proposed in round 2, character for character apart from `Boolean(...)`. The `!target` / `overdue-no-inbox` branch still keys on "registered at all", which is correct. New test at note-flush.test.mjs:1989: stale sender cwd, recipient `cwd: home`, so one send `--to taxonomy` with `--recipient-repo home`. Mutation M1 shows the test fails without the fix. |
| MAJOR 1, main (R5 "host ledger only" when no repo is resolvable) | **Open: no lead ruling has landed.** See MAJOR 1 below. |

## Delta regression hunt: verified absences (first-class)

- **R1 ordering is unchanged.** `recordOverdueId` still runs before both the no-repo guard and the send (note-flush.mjs:1496). The selection change only picks which slug is used; it does not reorder anything.
- **R4: there is no new throw path.** `reachable()` uses `inboxes[slug]?.cwd` plus `existsSync`. Neither throws on a missing slug, an undefined cwd or a non-string cwd, because `existsSync` returns false for invalid input.
- **The no-inbox branch is unchanged.** With neither party registered, `registered` is null and so is `target`, which leads to `overdue-no-inbox`. The existing test at :1792 still passes.
- **Neither party reachable but at least one registered.** `target` falls back to `registered` (the sender first). The no-repo guard at :1508-1516 then logs `overdue-send-failed ... no repo resolvable` and records the id. The round-2 tests at :1964/:1979 still pass. The guard's second `existsSync` repeats `reachable(target)`: consistent, just redundant.
- **Existing tests are untouched.** The test diff adds one test block and changes no existing line. No assertion was weakened.
- **Status, json and SKILL.md are not touched this round.** The round-2 verification still holds.

---

## MAJOR 1 (carried, lead-blocked): an unresolvable recipient repo still drops the nudge, where R5 says "host ledger only"

- Evidence: note-flush.mjs:1506-1516. When neither party's registered inbox has a cwd that exists, the pass logs `overdue-send-failed ... no repo resolvable ...; not sent` and `continue`s. The nudge is never posted anywhere, including the host ledger (`~/.agents/notes`) and the inbox.
- Contract: contracts.md:30 (R5) says "The repo ledger is written only when the pickup's recipient-repo route can name a repo. Otherwise the host ledger only." Spec item 3 says "The note lands in the host ledger like any other".
- **What changed this round.** The twin is fixed, so the case is now narrower: only when *both* parties are registered-but-stale, or when one party is registered-but-stale and the other is unregistered.
- **Why this is lead-blocked.**
  - I re-read note-send.mjs:371-424. Every branch of `runNoteSend` either resolves a `targetRepo` or throws, and `ledgerTargets` (:475-479) always includes `ledgerPath(targetRepo, ymd)`. No existing flag gives "host ledger only".
  - R5's first bullet forbids a second send path. note-flush therefore cannot write `~/.agents/notes` itself.
  - So no in-territory change can meet R5 literally. The builder says so openly (O1-report.md, round 3).
- I found no lead ruling:
  - `docs/work/wr-2026-09-26-overdue-asks.record.md` has no R5 amendment;
  - `contracts.md:30` is unchanged;
  - no ruling file exists in `docs/specs/overdue-asks-1/`.
- **Fix: the orchestrator escalates this to the lead. Another builder round cannot close it.**
  - **(a) The lead authorises a note-send.mjs change.** Add a `--host-ledger-only` flag to `runNoteSend` that skips targetRepo resolution and drops `ledgerPath(targetRepo, ymd)` from `ledgerTargets`.
    - O1 then replaces the `continue` at note-flush.mjs:1515 with a send that carries `--host-ledger-only` in place of `--recipient-repo`.
    - Tests: in the gone-cwd test at :1964, expect one call carrying `--host-ledger-only`. Add one note-send test showing that only `notesMirrorPath` is written.
  - **(b′) The lead amends R5** to accept "logged, not sent" when neither party's inbox cwd resolves. This finding then closes with **no code change** at this sha.
- Severity stays MAJOR, not BLOCKER. Both production registrars always record a cwd (hooks/multi-inbox.js:224, hooks/multi-codex-hook.mjs:154), so a drop needs removed worktrees on both parties. The drop is also logged.

## MINOR 2 (new): no test pins spec item 3's "sender first" when both parties are reachable

- Evidence: mutation M2 reverses the preference at note-flush.mjs:1483 to `reachable(ask.to) ? ask.to : (reachable(ask.from) ? ask.from : registered)`. All 142 tests stay green.
- Every existing overdue test registers only one reachable party. The round-3 rewrite made the order a two-level expression, so it is now easier to invert by accident.
- Spec item 3: "if the sender slug has an inbox registered on this host, post to the sender; otherwise if the recipient has one".
- Fix: append this test to `skills/multi/scripts/note-flush.test.mjs`, after the twin test that ends near :2002, or anywhere among the overdue tests. Apply verbatim:

```js
test('overdue-asks: sender and recipient both reachable - spec item 3 sends to the sender', async () => {
  const home = tmp();
  writeOverdueLedgerLine(home, '2026-09-26', askLine()); // from astra (sender) to taxonomy (recipient)
  writeInbox(home, 'astra', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't-sender', cwd: home }, { now: DEADLINE });
  writeInbox(home, 'taxonomy', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't-recipient', cwd: home }, { now: DEADLINE });
  const calls = [];
  const result = await runOverdueAsks([], overdueContext(), { home, now: DEADLINE + 16 * 60_000, send: stubSend(calls) });
  assert.equal(calls.length, 1);
  const { argv } = calls[0];
  assert.equal(argv[argv.indexOf('--to') + 1], 'astra');
  assert.equal(result.nudged, 1);
});
```

- Outcome, verified on the scratch copy:
  - with HEAD's code, 143 pass, 0 fail;
  - under mutation M2, this test alone fails (142/1).

  No production code change is needed.

## C4 fields
Cause: the round-2 fix skips the send whenever the chosen target's inbox cwd is unresolvable. Round 3 fixed the twin: a stale sender no longer hides a reachable recipient. The remaining drop exists because `runNoteSend` has no host-ledger-only route, and R5 forbids a second send path. Separately, the sender-first order in the new selection has no test.
Discriminating check: `runOverdueAsks` with a stubbed `send`, where the sender inbox's cwd does not exist and the recipient is unregistered or also stale. Today `calls.length === 0` and the log reads `no repo resolvable`; an R5-literal pass makes one host-ledger-only call. For MINOR 2: register both parties with `cwd: home`. Today the send goes to `astra`, but no test fails if it goes to `taxonomy`.
Fix location: MAJOR 1 needs a lead ruling. Under (a) the change is in skills/multi/scripts/note-send.mjs:475-479 plus note-flush.mjs:1515; under (b′) it is contracts.md:30 only. MINOR 2 is one new test in skills/multi/scripts/note-flush.test.mjs.
Simplification: under (b′) MAJOR 1 needs no code, and MINOR 2 is one eleven-line test. Under (a) the `continue` becomes a single flag choice. Neither adds a mechanism.
