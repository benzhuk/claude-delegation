VERDICT: APPROVE 693cd94823cc26b336ec16578b89b5c914c26150

# Delta review: build/loop-gates-1, 2c2f9b8 to 693cd94 (fix round 2)

JUDGMENT: Opus delta review before a push. Read-only on LG\wt-integrate (HEAD 693cd94, tree clean before and after). All mutation checks ran on a `git clone --no-hardlinks` in my own scratchpad, never in the worktree.

Line 1 carries the full sha after `VERDICT: APPROVE` on purpose. That makes a byte copy of this file usable as the deciding evidence for the re-pointed record, because `checkAcceptance` refuses an APPROVE line with no revision. The three findings are MINOR and do not block. None of them changes code behaviour at 693cd94.

## Gates (rerun once by this review, at 2026-09-24 ~22:55 EDT)

- `node --test "**/*.test.mjs"`: 1481 tests, 1481 pass, 0 fail, exit 0.
- `node scripts/run-tests.mjs` (sealed): 1481 tests, 1481 pass, 0 fail, exit 0.
- `git status --short` in wt-integrate afterwards: empty. HEAD is still 693cd94.
- The builder reported a `registered-pickup.contract.test.mjs` flake under `skills/decisions/`. It did not appear in my runs. That code is out of scope and I did not investigate it further.

## Main merge 0a82ec4: clean

- Parents are 2c2f9b8 and a874db9. `git show --cc 0a82ec4` is empty, so there is no conflict resolution and no evil-merge content.
- `git diff --stat 2c2f9b8 0a82ec4` touches only `.codex-plugin/plugin.json`, one line (0.20.6 to 0.20.7). That is the same diff as a874db9 itself.
- `git log 2c2f9b8..a874db9` contains only a874db9, and main's tip is a874db9, so nothing else came in.
- Both manifests read 0.20.7, and there is no version bump on the branch.

## The eight packet items

1. **Fixed, with tests.** `build-loop-workflow.js:125-126` is the seam patch verbatim. There is a new test at `build-loop-workflow.test.mjs:473-481`, and the R2-2 assertion is at `:433`. Mutations on the clone:
   - Reverting `longerSha` to its 2c2f9b8 form makes the new test fail (36/37).
   - Changing the mandate `VERDICT: APPROVE <sha>` at `:77` to `VERDICT: APPROVE` makes the worktree-naming test fail (36/37).
   - Both assertions bite.
2. **Already done, as claimed. Verified.** Pinned mode requires ancestry, and the reason is written at `work-record.mjs:606-609` and `:615-620`. Both tests exist at 2c2f9b8 (`git show 2c2f9b8:scripts/work-record.test.mjs` has both titles). The reason is now also stated for readers in `docs/work-record.md:139-140`. Mutations:
   - Disabling the ancestry branch (`if (false)`) makes the "diverged sibling branch" and "wholly unrelated repository" tests fail.
   - Forcing equality in pinned mode makes "pinned mode still passes when the artifact is an ancestor..." fail, along with two older tests.
   - Both directions are pinned. The packet's "record why ancestor is right and pin that with a test" is met. The committed spec (`docs/specs/2026-09-25-first-loop-build-gates.md`, T1 item 2) still says "must equal", and that stays true for live mode. For this build's own record, use live mode (see below) so equality holds literally.
3. **Fixed.** Record `:7` reads `Worktree: build/loop-gates-1`, and `:13` labels T3 as docs. No directory named `build/loop-gates-1` exists under the repo, so the value resolves as `refs/heads/build/loop-gates-1` (measured below).
4. **Fixed, with a test. MINOR hazard, see F1.** `bearings-state.mjs:23` does NFKC, strips `\s` and U+200B-U+200D/U+FEFF, then lowercases. `complete()` (`:128-129`) and `check()` (`:104-106`) share that one function. Mutations:
   - Reverting to trim+lowercase fails the test.
   - Dropping only the zero-width range fails the test.
5. **Fixed for the named lines. Residual drift, see F2.** `docs/work-record.md:108-147` now describes `accept`, the `Worktree:` rule, ancestor vs equal, and write-on-success. Each claim matches `work-record.mjs:522-712`. `SKILL.md:263-265` is corrected, and the "requirement above" it cites exists at `:231-232`.
6. **Fixed.** `README.md:247-252` has both breaking notes and no bump. Each claim checks out against the code:
   - The CLI requires `--reviewer-id` and `--lead-id` (`bearings-state.mjs:152`).
   - A receipt with no ids reads as `due` / `reviewer-not-independent` (`:104-107`), so "every existing receipt reads as due" is accurate.
   - A missing `Worktree:` fails closed (`work-record.mjs:574-578`).
7. **Fixed.** `GOALS.md:74` now says the due-notice reaches Ben's pane via `systemMessage` at SessionStart. The independence reason is "no receipt records a reviewer distinct from the lead", which is what the evidence supports, and nothing more is claimed.
8. **Fixed. MINOR, see F3.** The committed spec is byte-identical to the main checkout's untracked copy (`diff` is empty). The measures in the record match `reports/accept-census.md` exactly (wall clock, rounds, both token tables).

**Scope check.** The delta touches only files named by the packet, plus the merged manifest. There is nothing under `skills/decisions/`, `hooks/hooks.json`, `.claude-plugin/`, or the other read-only files. No builder scratch worktrees are left in `git worktree list`.

## Findings

### F1 — MINOR — the zero-width set is invisible literal bytes in both the code and its test, so the test can go vacuous silently

Evidence:
- `od -c` on `skills/bearings/scripts/bearings-state.mjs:23` shows raw UTF-8 `342 200 213 - 342 200 215 357 273 277` inside the character class.
- `bearings-state.test.mjs:73` embeds a raw U+200B, and `:74` a raw U+FEFF.
- `fix2-report.md` item 4 says escapes were used "rather than embedding literal invisible Unicode bytes". That is inaccurate: the bytes are literal.

Measured on the clone: I stripped U+200B-U+200D/U+FEFF from the test file (what an editor, formatter or copy-paste can do) and also removed the zero-width range from the code. The test still passed, 9/9. Its strings collapse to `'claudea'` vs `'claudea'` and fail on plain equality, so the zero-width regression goes unseen. This is the brief's failure class: "a check that passes because it isn't looking".

Patch (apply verbatim):
- `bearings-state.mjs:23`. Current: the same line with raw invisible characters in `[\s…]`. Replacement:
  ```js
  const normalizeId = (v) => (typeof v === 'string' ? v.normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]/g, '').toLowerCase() : '');
  ```
- `bearings-state.test.mjs:73`: in `reviewerId: 'claude<U+200B>a'`, write the value as `'claude\u200Ba'`.
- `bearings-state.test.mjs:74`: in `reviewerId: '<U+FEFF>claudea'`, write the value as `'\uFEFFclaudea'`.

- Tooling trap, measured while writing this report: the Write tool decoded the six-character text backslash-u-2-0-0-B into the raw character. That probably explains the builder's inaccurate claim above: escapes were typed, and raw bytes landed on disk. Apply this patch with a byte-exact method (for example a node script that builds the backslash with String.fromCharCode(92)), then confirm with the grep -P line below before committing.

Predicted outcome:
- 9/9 still pass.
- `grep -P '[\x{200B}-\x{200D}\x{FEFF}]' skills/bearings/scripts/bearings-state*.mjs` returns nothing.
- The strip-the-invisibles mutation is no longer possible.
- Dropping `\u200B-\u200D` from the code fails the test.

### F2 — MINOR — docs/work-record.md's reference tables still omit what this branch added

Evidence:
- The Fields table (`docs/work-record.md:30-46`) has no `Worktree:` row. `work-record.mjs:16` lists `worktree` in `OPTIONAL_FIELDS`, and acceptance requires it.
- The finding-code table (`:162-176`) has no `accepted-without-check` row. It is in `FINDING_CODES` at `work-record.mjs:20`, and `SKILL.md:252` relies on it.

This is the same kind of drift as packet item 5: a reader of the tables cannot learn that either exists.

Patch:
- After the `| \`Class:\` | ...` row (`:44`), insert:
  ```
  | `Worktree:` | no (required by `accept` and `check-acceptance`) | absolute path, repo-relative path, or local branch name of the git worktree/branch that produced `Artifact:`; its live HEAD is read with git at acceptance |
  ```
- After the `| \`accepted-without-evidence\` | ...` row (`:168`), insert:
  ```
  | `accepted-without-check` | finding | `Status: accepted`, `Opened:` on or after 2026-09-24T13:00:00Z (or unparseable), `Artifact:` ends in a git revision, and no `Log: <iso> accepted <owner> artifact <40-hex>` line names that revision |
  ```

Predicted outcome: docs only, and no test reads these tables, so both suites stay at 1481/1481.

### F3 — MINOR — the record's measures cite a path that is not in the repo, and the Observed test counts are stale

Evidence (record `docs/work/wr-2026-09-24-loop-gates.record.md`):
- `:15` says the measures' source is "`reports/accept-census.md`". That file lives in the session scratchpad, and nothing under the repo resolves it. The packet asked for the measures to be in the record's evidence "so the record proves the measures".
- The turn count "7" is attributed to the census, but it is not in `accept-census.md`. It comes from the lead or the packet.
- `:13` still says "1480 tests, 1479 passing, with the one failure (`scripts/native-package.test.mjs:14`)". At 693cd94 that is 1481/1481.

Fix (record-only; fold it into the accept commit so it does not move the artifact):
- Copy `reports/accept-census.md` to `docs/work/evidence/wr-2026-09-24-loop-gates-census.md` and list it in `Evidence:`. Its line 1 is `VERDICT: ACCEPTED …`. That is not a deciding verdict, so `checkAcceptance` treats it as history. It starts with `VERDICT:`, so `validateRecord` is satisfied.
- Change "(source: the lead's own accept-census, `reports/accept-census.md`)" to "(source: `docs/work/evidence/wr-2026-09-24-loop-gates-census.md`; turn count from the lead's RESULT)".
- Update the `:13` test sentence as described in the re-point list below.

## The build's own record: would it pass check-acceptance re-pointed at 693cd94? Yes (measured on the clone)

As committed, it fails: `[acceptance-failed] Status must be reviewed immediately before acceptance, got: accepted`. That is expected, because the check is only for the moment before acceptance.

What must change, all uncommitted, while wt-integrate HEAD is still 693cd94:
1. `Status: accepted` becomes `Status: reviewed`. Never hand-edit it back; `accept` flips it.
2. `Artifact: build/loop-gates-1@688fed458a94c0fd154ccf5730b20c8e5fe2a3a0` becomes `Artifact: build/loop-gates-1@693cd94823cc26b336ec16578b89b5c914c26150`.
3. Evidence: add `docs/work/evidence/wr-2026-09-24-loop-gates-fix2.md`, a byte copy of this file. Its line 1 is the deciding `VERDICT: APPROVE 693cd94…`. Keep the seam copy: its `APPROVE 688fed4` resolves to a different commit, so it is skipped as history. Add the census copy from F3 too.
4. `Worktree: build/loop-gates-1` stays unchanged. Do not create a directory at that repo-relative path, or it will be read as a worktree path instead of a branch.
5. Keep the existing `Log: … accepted … artifact 688fed4…` line. `accept` appends the new one.
6. For accuracy only (not checked mechanically):
   - Authority: "seam round 2 approval is the deciding evidence" becomes "the fix-round-2 delta approval at 693cd94 is the deciding evidence; seam round 2 at 688fed4 is history".
   - Observed: add one sentence. After merging main a874db9 and fix round 2 (items 1-8), both suites pass 1481/1481 at 693cd94. The earlier 1479/1480 figure and the native-package failure are history.
7. Optional: `Scope:` can now name the committed spec, `docs/specs/2026-09-25-first-loop-build-gates.md@693cd94`.

Command order, all measured on the clone with steps 1-3 applied:
- `node scripts/work-record.mjs check-acceptance --record docs/work/wr-2026-09-24-loop-gates.record.md --repo . --delivery-ref build/loop-gates-1` returns `{"ok":true,…,"artifact":"693cd948…","delivery":"693cd948…"}` and exits 0.
- The same with `--pinned-artifact 693cd94…` also returns ok.
- `--pinned-artifact 688fed4` is refused (`Artifact … does not match delivery`), as it should be.
- `accept` with the live args returns ok. It appended `Log: <iso> accepted loop-gates-integrator artifact 693cd948…` and flipped Status.
- `validateRecord(parseRecord(text))` on the result returns `[]`.
- Then commit the record and evidence together as the new accept commit. If anything is committed before the check, HEAD moves past 693cd94 and live mode fails with `sha-not-in-git`. In that case use `--pinned-artifact 693cd94823cc26b336ec16578b89b5c914c26150`, which passes on ancestry.

**Sequencing with F1 and F2.** Applying either before the accept moves HEAD past 693cd94, and this approval then no longer names the Artifact. Either accept at 693cd94 now and land F1/F2 in a follow-up commit, or apply them first and get a one-line delta approval at the new HEAD. F3 is record-only and goes into the accept commit itself.

## Informational (not counted)

- The README 0.20.8 entry leads with "GOALS.md status updates:". It never mentions the non-breaking behaviour this branch ships: `accept` runs the check itself, the due-notice goes into `systemMessage`, and the reviewer prompt no longer carries the sha. That is optional wording for Ben's release.
- `GOALS.md:74` says "now reaches Ben's pane" for something that is unreleased and installed nowhere. The packet asked for exactly this wording. Adding "(on build/loop-gates-1, not yet released)" would match how the "One package" status treats 0.20.7.

## C4 fields

Cause: `longerSha` returned the raw, untrimmed reviewer string. `normalizeId` folded only case and outer whitespace, so ids that differ only by inner tabs or zero-width characters counted as different agents. Both are fixed at 693cd94.
Discriminating check: on a scratch clone, reverting `longerSha` fails "longerSha's chosen sha is trimmed and lowercased…". Reverting the mandate wording fails the worktree-naming test. Reverting or narrowing `normalizeId` fails "complete refuses a reviewer who is not independent of the lead". All three pass at 693cd94.
Fix location: `skills/team-build/references/build-loop-workflow.js:124-128`, `skills/bearings/scripts/bearings-state.mjs:23`, and their tests at `build-loop-workflow.test.mjs:433,473-481` and `bearings-state.test.mjs:72-74`.
Simplification: one normalizer per identity type, shared by every comparison site (`sameSha`/`longerSha`; `complete`/`check`). F1 makes the zero-width set visible as escapes so it cannot be stripped silently.
