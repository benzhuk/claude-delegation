VERDICT: APPROVE 688fed458a94c0fd154ccf5730b20c8e5fe2a3a0

# Seam review, round 2 (delta): loop-gates T1 + T2

Round: 2
JUDGMENT: cross-territory seam delta re-review, Opus.
Reviewed: `LG\wt-integrate`, branch `build/loop-gates-1`, HEAD `688fed458a94c0fd154ccf5730b20c8e5fe2a3a0`. That is `ab3e1d1` (T1 seam fixes) followed by `688fed4` (T2 seam fixes), on top of `7ca07e1`. The reviewed tree was left untouched (`git status --short` is empty). All repros and mutation checks ran on a scratch clone at `<scratchpad>\seam-scratch2\repo`.
Finished 2026-09-24 21:50 America/New_York (approximate).
Prior findings: `seam-findings.md` (S1-S7).
Report path: the message named both `seamfix-report.md` and `seam-findings-r2.md`. I wrote only this file (`seam-findings-r2.md`), because the findings-file naming rule and the explicit write instruction both point here.

Line 1 carries the full sha on purpose: `VERDICT: APPROVE <sha>` is the form `checkAcceptance` needs from deciding evidence. A byte-for-byte copy of this file can therefore be this build's deciding evidence at `688fed4`; see the last section.

## Suites

| Suite | Result |
|---|---|
| The four touched test files (`work-record`, `build-loop-workflow`, `delegation-reminder`, `bearings-state`) | 176 pass, 0 fail |
| Sealed `node scripts/run-tests.mjs` | 1480 tests, 1479 pass, 1 fail |
| Plain `node --test "**/*.test.mjs"` | 1480 tests, 1479 pass, 1 fail |

In both full suites the one failure is `scripts/native-package.test.mjs:14` (`'0.20.6' !== '0.20.7'`). This is the known failure, already present on main; neither territory owns it. Logs are in the scratchpad: `seam-sealed-r2.log` and `seam-plain-r2.log`.

## Prior findings: verification

| # | Status | Evidence |
|---|---|---|
| S1 short vs full sha | FIXED | `sameSha` (`build-loop-workflow.js:108-119`) now accepts a prefix of 7 or more hex characters of a full 40-hex sha. Repro with the real T3 pair: `("5743ce8", full)` is true in both orders. A 7-char sha differing in the last char is false. A 5-char prefix is false. Two different short values (`"5743ce8"`, `"5743ce80"`) are false, because a full 40-hex sha is required. `longerSha` (`:124-128`) puts the full sha into `state.sha` and the integrator prompt. Tests: three new "seam S1" tests, plus an assertion on the integrator prompt. |
| S2 verdict grammar | FIXED | `REVIEW_MANDATE` (`:77`) now requires `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`. `VERDICT_RE` (`work-record.mjs:386`) accepts a `(<n>)` count. Repros at 688fed4: (A) Evidence = the real `T1-findings-r1.md` (NEEDS_FIXES (8)) plus an APPROVE for the head passes `check-acceptance --delivery-ref`. (B) A current `VERDICT: NEEDS_FIXES (3) <head>` still refuses, with `current artifact has refusing evidence`. (C) A bare `VERDICT: APPROVE` in the old loop format still refuses, with `approval omits a revision`. Mutation check: reverting the regex fails both "seam S2" tests. |
| S3 non-code accepted-without-check | FIXED | Guard at `work-record.mjs:193`. Repro: a doc-path `Artifact:` with `Status: accepted`, opened after the cutoff, gives `[]`. Mutation check: reverting the guard fails the "seam S3" test. |
| S4 bearings ids unbound | FIXED (minimal) | At SessionStart, `delegation-reminder.js:413-416` adds a `--lead-id <session_id>` hint to `additionalContext` only. `SKILL.md:46` now says the ids are attestation, not proof. `SKILL.md:51` names the exact sources. Tests: three "seam S4" tests (the hint is present and not in `systemMessage`; there is no hint when current; there is no hint for a subagent). |
| S5 non-sha equality | FIXED | Both sides must match `/^[0-9a-f]{7,40}$/`. `("HEAD","HEAD")` and `("unknown","unknown")` both return false. Fixtures were migrated to hex values. Tests: two "seam S5" tests. |
| S6 compact pane repeat | FIXED | `input?.source !== "compact"` at `:405`. Mutation check: reverting it fails "SessionStart injects the card, on every source", which now asserts `systemMessage === null` for `compact`. |
| S7 reason hidden | FIXED | `bearingsNotice` (`:343-345`) gives the reviewer-not-independent reason. Tests: two "seam S7" tests, which also check that the generic text stays for other due reasons. |

The other joint repros still hold at 688fed4:
- `Worktree:` missing: `[sha-not-in-git] Worktree: field is required`.
- A stale Artifact (`7ca07e1`) in live mode: `does not match delivery 688fed4…`.
- `accept`, then `validateRecord`: `[]`.

## Is the minimal S4 fix enough to APPROVE this build?

Yes. The spec's T2 item 2 asked for three things, and all three are now met honestly:
- the receipt records both ids;
- the check rejects equal, missing, and case- or whitespace-variant ids;
- the skill states the rule in one line and names the check.

My round-1 objection was that the lead had no harness source for its own id, and that the SKILL text left the subagent-session-id trap open. The hint and the exact-source text close both. The remaining gap is that nothing mechanically proves the reviewer was a distinct process. That gap is now stated in the SKILL (`:46`, "attestation, not proof"), so the check no longer claims more than it verifies. The transcript-proof variant (`<transcript dir>/<leadId>/subagents/agent-<reviewerId>.jsonl`) is a real improvement. It belongs in its own spec, as deferred. Deferring it does not block this build.

## New findings (delta), both MINOR, neither blocks acceptance

### R2-1 — MINOR — `longerSha` passes the reviewer's raw string through unnormalized

- Evidence: `build-loop-workflow.js:124-128` returns the untrimmed, un-lowercased input. The existing test at `build-loop-workflow.test.mjs:458-468` shows the path: builder `abcdef…12`, reviewer `ABCDEF…12\n`. Here `sameSha` approves, and then `longerSha` picks the 41-character reviewer string (with its newline) as `state.sha`. That string reaches the integrator prompt as `T1@ABCDEF…12\n`. Git still resolves it, so the cost is cosmetic.
- Patch (exact current code, then its replacement):
  ```js
  function longerSha(x, y) {
    const sx = String(x ?? '')
    const sy = String(y ?? '')
    return sy.length > sx.length ? sy : sx
  }
  ```
  becomes
  ```js
  function longerSha(x, y) {
    const sx = String(x ?? '').trim().toLowerCase()
    const sy = String(y ?? '').trim().toLowerCase()
    return sy.length > sx.length ? sy : sx
  }
  ```
  Predicted effect: every existing assertion (`aaaaaaa1`, `bbbbbbb2`, `T1@${full}`) still passes, because those values are already lowercase and trimmed. The padded case yields the lowercase 40-hex sha. Add `assert.equal(result.territories[0].sha, "abcdef1234567890abcdef1234567890abcdef12")` to the test at `:458`.

### R2-2 — MINOR — no test pins the S2 mandate wording, which is the essential half of S2

- Evidence: on the scratch clone I reverted `REVIEW_MANDATE` (`:77`) to the round-1 text ("VERDICT: APPROVE or NEEDS_FIXES"). `build-loop-workflow.test.mjs` still passed, 36 of 36. A later edit could silently bring back loop reviews that `checkAcceptance` refuses.
- Fix: in the existing test "the review prompt names the worktree and never contains the delivered sha…", add:
  `assert.ok(reviewCall.prompt.includes("VERDICT: APPROVE <sha>"), "the review mandate must require the sha on the verdict line, the form checkAcceptance accepts");`
  Predicted effect: it passes now and fails on the revert.

Timing: fixing R2-1 or R2-2 moves HEAD past `688fed4`, and then this approval no longer matches the Artifact. Either accept at 688fed4 and fix both minors in a follow-up, or fix them first and get a one-line delta approval at the new head.

## What this build's work record needs to pass `check-acceptance` with the SHA check live, at HEAD 688fed4

I tested each item on the scratch clone; the pass shown in repro A is measured.

1. **Record location:** `docs/work/wr-2026-09-24-<slug>.record.md` in the repo you pass as `--repo`. That is wt-integrate, whose HEAD is 688fed4.
2. **Header:** each field exactly once, all before the first blank line.
   - `Work: wr-2026-09-24-<slug>` (lowercase, `[a-z0-9-]`).
   - `Scope:`, `Owner:`, `Authority:`, `Next:`: non-empty.
   - `Status: reviewed`. `check-acceptance` refuses any other status, `accepted` included, so run it before `accept`. `accept` then runs the same check and flips the status.
   - `Artifact: build/loop-gates-1@688fed4`. A short or full sha both work, because git expands it.
   - `Worktree: .` (or `build/loop-gates-1`, or the absolute wt-integrate path).
   - `Opened:` a real timestamp after `2026-09-24T13:00:00Z`.
   - `Evidence:` see item 4.
   - No unknown labels. New `Log:` lines are fine.
3. **Body:** after the first blank line, an unindented `Observed: <text>` line at the start of the body or after a blank line.
4. **Evidence:** a byte-for-byte in-repo copy of this file, for example `docs/work/evidence/wr-2026-09-24-<slug>-seam.md`. Its line 1, `VERDICT: APPROVE 688fed458a94c0fd154ccf5730b20c8e5fe2a3a0`, is the one deciding APPROVE for the Artifact.
   - You may add other copies as history: the territory findings, including the `NEEDS_FIXES (<n>)` rounds, which no longer abort the check; `integrate-report.md` (PASS, not a deciding verdict); and `seam-findings.md` (NEEDS_FIXES (7), no sha, counted as history).
   - Do not add any file whose line 1 is `VERDICT: NEEDS_FIXES …` or `FAIL …` followed by a sha that resolves to 688fed4. That refuses acceptance.
   - Every Evidence path must be a regular file inside the repo.
5. **Command and commit order** (measured):
   - Live mode: `node scripts/work-record.mjs check-acceptance --record docs/work/<id>.record.md --repo . --delivery-ref build/loop-gates-1`, then the same arguments with `accept`. Both run while the record and the evidence copy are **uncommitted**, because live mode requires the Worktree HEAD to equal the Artifact. Commit afterwards, with your configured identity.
   - If the record is committed first, HEAD moves past 688fed4 and live mode fails `sha-not-in-git`. In that case use `--pinned-artifact 688fed4` instead: it passes on ancestry, and `accept` in pinned mode passes too.
   - After `accept`, `check-acceptance` refuses by design (Status is then `accepted`). The record's own `Log: … accepted … artifact <40-hex>` line keeps `validateRecord` clean (measured: `[]`).
