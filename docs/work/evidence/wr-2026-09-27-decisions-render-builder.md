VERDICT: DONE e2ceba8967d9cb529ca12efc840a06cea3b91153

# Lane 26 (decisions-render) — report

Branch `build/decisions-render-1` in worktree `C:/Users/benzh/Code/decisions-render/wt`,
base `d153389`, 5 commits, HEAD `a806bb3810308edbe525bdcdaea76d9dadbe9447`. Nothing
pushed, merged, or released. Nothing outside the Owns list touched except one
mechanical, additive fix to `skills/decisions/scripts/decisions-archive.contract.test.mjs`
(see "Deviations" below).

Serves GOAL's "work lost or stalled" (a hand-edited or crashed-mid-write decisions page
now drifts loudly — refused or blocked — instead of silently) and "rework after
acceptance" (every render refusal is a unit test, catching a bad source file before it
ever reaches Ben). Nearest NOT avoided: "a rule no script checks" — every Acceptance-list
refusal/path named in the spec has a dedicated test.

## Gate

```
node --test skills/decisions/scripts/*.test.mjs skills/multi/scripts/hooks.test.mjs > C:/Users/benzh/Code/decisions-render/pack/reports/B-gate.log 2>&1
```

Result (round 2, current HEAD): **448 pass, 0 fail** (full log at
`pack/reports/B-gate.log`). Round 1 result was 425 pass, 0 fail.

## What was built

- `skills/decisions/scripts/decisions-render-core.mjs` (385 lines) — pure `render()`:
  composes Waiting/What-is-going-on/This-session/History/archive/callout/Done from
  `docs/decisions/**`, with every Acceptance-list refusal (bold/hex prose rule, sentence
  counts, bullet counts/length, missing `Summary:` line, `git ls-tree origin/main`
  404-link refusal, SHAPELESS waiting item, `--drop-owner-lines` leak check) as a
  `RefusedError`/`BlindError`.
- `skills/decisions/scripts/decisions-render-publish.mjs` (353 lines) — the 8-step
  `publish()`: fresh read, owner-input gate (`--clear-done` verifies the pickup's
  captured triples land verbatim in a history file or waiting item before clearing
  Done), drift check (`--adopt-live` crash-recovery path), render, `notion.js
  replace-md`, readback verification, retitle (`decisions-title.mjs set`, step 7),
  commit+push `last-render.md` with rebase-and-retry (fake-git-tested).
- `skills/decisions/scripts/decisions-render.mjs` (188 lines) — CLI entry point;
  `--reader <path>` binds `deps.readPage`/`replaceMd` to a real `notion.js`-shaped CLI
  the same explicit-path-never-hardcoded way `decisions-pickup.mjs`'s
  `readPageWithCli` already does (file:17-20, 68-113).
- Tests: `decisions-render.test.mjs` (52 tests) + `decisions-render-publish.test.mjs`
  (21 tests) — normalisation, every prose/refusal path above, the acceptance test
  (render output parses clean through `decisions-read.mjs`: exit 0, zero warnings,
  `DONE false`, nothing but blank/`<empty-block/>` after Done — file:383-395), CLI
  dispatch, and `--reader` wiring against a real (fake) child process.
- `skills/decisions/scripts/decisions-handback.mjs` — one added check (file:461-477):
  the live decisions read must equal `docs/decisions/last-render.md` (normalised) or it
  prints a `DRIFT` line and blocks (`HANDBACK blocked`) — a content objection, rescued
  by the kill switch like any other (WARN/UNATTACHED/...), never a `BlindError` of its
  own unless `last-render.md` itself is unreadable. One new test in
  `decisions-handback.test.mjs` ("page-drift: ..."), covering drift, CRLF-only
  non-drift, unreadable-is-BLIND, and kill-switch rescue.
- `skills/decisions/templates/decisions-page.md` (new) — documents the rendered
  page's six sections and where each section's bytes come from.
- `docs/pane-setup.md`'s new `## Closing a lane` section (before `## Releasing`,
  touching no other section) — history-file-append in the merge commit, then
  `decisions-render.mjs publish`.
- `skills/decisions/SKILL.md` rewritten (see file for full text): the decisions page is
  never hand- or anchored-edited by any agent — only `decisions-render.mjs publish`
  writes it (goals-page anchored-edit rules are unchanged); the merge/Closed-entry
  paragraph now appends to `docs/decisions/history/<today>.md` then runs `publish`; the
  "two writers never edit at once" paragraph is replaced by `publish`'s own drift
  check/git-push-retry; retitling is `publish`'s own step 7 (no agent calls
  `decisions-title.mjs set` for this page directly any more); the hand-back section
  names the new page-drift check. `skill-text.test.mjs`'s 14 pinned assertions all
  still pass (verified individually during the edit, then in the full gate).
- Migration: `docs/decisions/now.md`, `session.md` (`since: 2026-09-27T18:16:00Z`),
  `last-render.md`, and a `Summary:` line inserted as line 2 of each of the 8
  `docs/decisions/history/*.md` files — all derived verbatim from `pack/live-page.md`.

## Live proof

One real, read-only `publish --dry-run` (steps 1-4 only) against the real page:

```
node skills/decisions/scripts/decisions-render.mjs publish --repo . \
  --page 3e1da11277a18174bccfea187d5c3972 \
  --reader /c/Users/benzh/.claude/scripts/notion.js --dry-run
```

Exit 0. `diff -u pack/live-page.md <dry-run stdout>` → **empty** (diff exit 0, zero
lines of difference) — the fresh live read matches `docs/decisions/last-render.md`
(normalised) at step 3, and `render()`'s output at step 4 is byte-for-byte identical to
the real live page. No write of any kind was made (`replaceMd` is never called on the
dry-run path — `decisions-render-publish.mjs:309-312`).

## The exact command the lead should run to actually publish

Nothing needs publishing right now (the dry-run proved the page and the repo already
agree). The next time a lane lead closes a lane or Ben's Done is cleared:

```
node <skill-dir>/scripts/decisions-render.mjs publish --repo . \
  --page 3e1da11277a18174bccfea187d5c3972 \
  --reader ~/.claude/scripts/notion.js \
  [--clear-done]
```

## Deviations / judgment calls

- `skills/decisions/scripts/decisions-archive.contract.test.mjs` (not in my Owns list)
  calls `decisions-handback.mjs`'s `run()` directly and broke once the new
  `readLastRender` param existed (its synthetic fixtures never matched a real
  `last-render.md`). Fixed with a one-line, purely mechanical addition
  (`readLastRender: () => decisions`) pinning it to that contract's own fixture, out of
  scope for Lane 26's drift check — no other line in that file touched.
- `--reader <path>` and its production wiring in `decisions-render.mjs` were not called
  out explicitly in the brief's file list, but without it `publish` had no way to reach
  Notion at all (the literal commands already written into SKILL.md/pane-setup.md would
  not have worked) — added inside my owned `decisions-render.mjs`, following the
  existing `decisions-pickup.mjs` convention exactly.
- `--adopt-live` interpreted as: skip re-writing Notion (it's already correct — the
  documented crash-recovery case), only catch up `last-render.md` and commit+push.
  Implemented and unit-tested; flagged in the state file as worth a second look.
- Archive-bullet phrasing is hardcoded to the one-time redesign wording ("today's
  rewrite" / the single 2026-09-27 archive file) since only one archive file is
  expected to ever exist; documented in-code as a known limitation.
- Never faked owner input: `--clear-done` is exercised only via unit tests with a
  faked pickup capture (`decisions-render-publish.test.mjs`), never against any real
  page state or a comment Ben did not write.

## Round 2 (review fixes)

Opus's review of `a806bb3` (`pack/reports/review.md`, full text) came back NEEDS_FIXES:
1 BLOCKER, 5 MAJOR, 10 MINOR, 1 NIT, plus one spec-gap note the review itself marks as
not the builder's. New HEAD `e2ceba8967d9cb529ca12efc840a06cea3b91153` (commits `7352f45`,
`e9a850a`, `e2ceba8` on top of `a806bb3`). Gate re-run twice, final: **448 pass, 0 fail**
(`pack/reports/B-gate.log`). Same Owns list, no push/merge, no fake owner input against a
real page.

| Finding | Status | What changed |
| --- | --- | --- |
| F1 (BLOCKER) | FIXED | Added `revertOwnerInput()` — under `--clear-done`, deletes comment lines and un-ticks option lines by their parsed `.line`, then flips the last matching Done label back to `- [ ] <label>`, before the step-3 drift comparison. `--adopt-live` + `--clear-done` together now refused outright (they can't both be true at once). New tests: F1 regression (Ben's edits plus one unrelated edit still exit 4), adopt-live+clear-done refusal. |
| F2 (MAJOR) | FIXED | Added `verbatimAnswerPresent()` + `gitShow()`/`gitLsTreeFiles()` (read via `git show origin/main:...` after `git ls-tree`, not the working tree) + `textOutsideOptionLines()` so a tick can no longer "pass" via its own option line, and comments require the quoted form `"${text}"`. New regression tests: short-comment-substring-must-not-pass, tick-must-not-pass-via-own-waiting-item. |
| F3 (MAJOR) | FIXED | `checkWaitingItem()` now parses with `parseDocument(text, { now })` and refuses on any read-defect warning (no default, overdue/DUE, pre-ticked option, stray Done/comment) via a new `itemWarnings()`/`hasReadDefect()` pair that filters out the page-level-only "no Done line found" warning. `render()`'s own composed output is now self-checked the same way (`computeExitCode(selfCheck) !== 0 \|\| selfCheck.done !== false` throws `RefusedError`) so a defect is caught before the write, not after. New tests for each defect kind. |
| F4 (MAJOR) | FIXED | `runReaderCli` now returns `{ stdout, stderr }`; `defaultReplaceMdWithCli` parses notion.js's `[backup] <file>` line from stderr and returns `{ backupFile }`. `publish()` logs the backup path, re-reads it, and throws `PublishError(5, ...)` naming the backup file if it doesn't match the step-1 fresh read (catches an edit landing between steps 1 and 5). New tests: backup-mismatch exit 5, backup-match logged/not blocked. |
| F5 (MAJOR) | FIXED | Applied the review's exact patch: branch name sanitized (`.replace(/[:.]/g, '-')` — a raw ISO timestamp's `:`/`.` fail `git check-ref-format`), rebase failure now runs `git rebase --abort` before giving up, and the exit-6 message names the real fallback location instead of always claiming the branch exists. New test asserts the sanitized branch name and the abort call. |
| F6 (MAJOR) | FIXED | Added `checkOnMain()` (fetches `origin main`, refuses unless currently on `main` with `HEAD === origin/main`) run before both the `--adopt-live` write and step 5. Step 8's commit is now pathspec-scoped (`git add -- <files>`, `git commit -- <files>`) instead of the whole index. `pushWithRebase` now pushes `origin HEAD:main` explicitly and retries via `fetch origin main` / `rebase origin/main` / `push origin HEAD:main`. New tests: not-on-main refusal, HEAD!=origin/main refusal (both for publish and --adopt-live). |
| M1 | FIXED | Hex-token regex narrowed with negative lookaround (`(?<![0-9A-Za-z])...( ?!...)`) plus link-target-only stripping and a narrower quote exemption, so a linked/underscore-adjacent/bare-quoted sha still trips the rule while the one documented spec-form quote stays exempt. New tests for each case. |
| M2 | FIXED | `checkProseLines` now strips a leading bullet/checkbox marker before testing for a leading `**`, and also catches an escaped `\*\*`. New tests: bullet-bold refused, escaped-leading-bold refused. |
| M3 | PARTIAL | (a) FIXED — unconfigured/unreachable drift now prints `HANDBACK page-drift` instead of the generic `HANDBACK blocked`. (b) LEFT, with reason — a `git show origin/main:...`-based `defaultReadLastRender` broke 3 real-process CLI tests whose `--repo` fixtures are plain temp dirs, not real git repos with a synthetic `origin/main`; not a safe mechanical one-liner against the existing fixture convention. (c) LEFT, with reason — skipping the drift check when `decisions_url` is unconfigured regressed the pre-existing `page-drift` test, because the test harness's `runWith()` defaults `readDecisionsUrl` to `() => null` for every fixture that doesn't override it, so this "fix" would have silently disabled drift-checking for nearly the whole existing suite. |
| M4 | FIXED | Step 7 (retitle) is now wrapped in try/catch; a `retitleError` is stored and only thrown (as a plain `Error`, after step 8 commit+push complete) so a retitle failure no longer strands an already-published, already-committed page in limbo. New test: retitle failure still completes step 8. |
| M5 | LEFT, with reason | The "This session" heading can read a stale `since:` at render time under `--clear-done` (it's rewritten to `session.md` only at step 8, after step 4's render already ran). Not a mechanical one-liner: fixing it needs a `since`-override threaded through `render()`'s options into `buildSessionSection`, plus new tests for the override path; left for a follow-up round rather than risking a rushed plumbing change this round. |
| M6 | FIXED | Crash-signature comparison direction corrected (`backup !== null && normalize(backup) === normalize(lastRender)`) and `defaultReadLatestBackup()` (newest `.md` under `NOTION_BACKUP_DIR`/`page`) is now actually wired into `publishDeps` in `decisions-render.mjs` — it was defined but never used before. |
| M7 | FIXED | Reworded three specific stale `SKILL.md` lines: the merge/push/publish ordering paragraph, the stale callout quote (now the real `COMMENT_CALLOUT` text, with a caveat that only its position is test-checked), and the "two sections: Waiting on you now / Closed" line (there is no `# Closed` section any more; replaced with an accurate list and a cross-reference to the existing `## Closing` heading). Other `# Closed` references elsewhere in the file left untouched, with reason — they read as `decisions-read.mjs`'s general-purpose parsing rules, still valid for other/legacy projects not using this render pipeline (a detached-copy test confirms multi-project use), so a full sweep is out of scope for a mechanical fix. `skill-text.test.mjs`'s pinned assertions still pass. |
| M8 | FIXED | `defaultReadPickupCapture` now only returns a captured triple when the pickup receipt's status is `PREPARED`, `RECORDED`, or `WAITING_OWNER`; any other status returns `null` (no match), so a stale/wrong-status capture can't be treated as verbatim owner input. |
| M9 | LEFT, with reason | The review's own wording is explicitly conditional ("consider refusing `--adopt-live` unless the crash signature holds") rather than a required behavior change; not attempted this round to avoid over-reaching past what was asked. |
| M10 | FIXED | Step 8 now checks `git diff --cached --quiet` after staging and skips the commit/push entirely when there is nothing new to commit; `git add`/`git commit` failures are now caught and mapped to `PublishError(6, ...)` instead of an unhandled throw. New tests for both. |
| NIT | FIXED | `normalize()`'s trailing-`<empty-block/>` drop now matches the exact string, not `.trim()`-loosened, so an indented occurrence is left alone. Two existing tests updated to match the stricter behavior. |
| Spec gap (Notion `~`/bare `.md` autolinking) | N/A | The review itself states this is not the builder's to fix. |

Test totals this round: `decisions-render.test.mjs` 63/63, `decisions-render-publish.test.mjs`
33/33, `decisions-handback.test.mjs` 89/89; full gate 448/448.
