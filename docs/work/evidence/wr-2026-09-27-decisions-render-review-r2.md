VERDICT: NEEDS_FIXES

# Lane 26 (decisions-render): round-2 delta review of e2ceba8967d9cb529ca12efc840a06cea3b91153

Scope: commits 7352f45, e9a850a and e2ceba8 on top of a806bb3. I re-verified the round-1 blocker and
all five majors with my own probes, looked for regressions the fixes introduced, and judged the
four minors the builder left open.

How I checked:
- `node --test skills/decisions/scripts/*.test.mjs`: 422 pass, 0 fail. (The builder's 448 also
  includes hooks.test.mjs.)
- Probes: scratch scripts in my session scratchpad that import the modules with fake notion.js,
  git and pickup. One probe used a scratch copy of the scripts with a stub `decisions-pickup.mjs`.
- No Notion write, no push, and the worktree is clean (`git status --short` is empty).
- Migration re-check: `render --repo .` with the live Done line is still byte-identical to
  `pack/live-page.md` (cmp).

Count: 1 new BLOCKER (a regression introduced by the M8 fix), 3 new MINOR. All six round-1
BLOCKER and MAJOR findings are fixed in the code paths the probes reach.

## New BLOCKER

### R2-1. The M8 fix reads a field that does not exist, so a real `publish --clear-done` now always exits 3 with "no captured pickup round".
- Evidence: `decisions-render-publish.mjs:115-116`:
  ```js
  const acceptableStatuses = new Set(['PREPARED', 'RECORDED', 'WAITING_OWNER']);
  if (!acceptableStatuses.has(st?.receipt?.status)) return null;
  ```
  A pickup receipt stores its lifecycle in `state`, not `status`: `state: 'PREPARED'` at
  `decisions-pickup.mjs:1073`, `state: 'RECORDED'` at `:866` and `:908`, `state: 'WAITING_OWNER'`
  at `:1068`. The status word is on the wrapper: `receiptStatus()` returns
  `{ status: effectiveStatus, receipt, … }` (`:822-828`). So `st.receipt.status` is always
  `undefined`, `defaultReadPickupCapture` always returns `null`, and `publish()` throws
  `PublishError(3, 'clear-done: no captured pickup round for this page')` (`:374`) on every real
  round. That is the same "the pickup round can never be finished" outcome as round-1 F1, just
  one step earlier.
- Probe: a scratch copy with a stub `decisions-pickup.mjs` returning the real shape
  `{status:'RECORDED', receipt:{state:'RECORDED', round:4, captureReadAt:…}}`.
  - Unpatched: `defaultReadPickupCapture` gives `null`.
  - With `st?.status`: it gives `{"round":4,"tickAt":"2026-09-27T21:55:00Z","triples":[["comment","X","hello"]]}`.
- The suite missed it because no test exercises `defaultReadPickupCapture`. Every `--clear-done`
  test injects `readPickupCapture`.
- Cause: the M8 filter tests `st.receipt.status`, but the status word lives on the wrapper as
  `st.status`.
- Patch (`decisions-render-publish.mjs:116`):
  - current: `  if (!acceptableStatuses.has(st?.receipt?.status)) return null;`
  - replacement: `  if (!acceptableStatuses.has(st?.status)) return null;`
- `st.status` is `receiptStatus`'s effective status. It already downgrades a receipt whose
  evidence fails integrity to NEEDS_RECONCILIATION, and ORPHAN_CAPTURE / PENDING_MANUAL_HANDOFF
  come through the same field. So this one field gives exactly the filter M8 asked for.
- Test: make the pickup module injectable, for example
  `defaultReadPickupCapture({ repo, page }, { pickup })` with the default being the real dynamic
  import. Then add two tests with a fake `pickup` returning the real wrapper shape:
  - `status:'RECORDED'` must return the triples.
  - `status:'ACCOUNTED'` must return null.
  - On the current code the first test fails, which proves it catches the bug.
- Predicted outcome: a RECORDED/PREPARED/WAITING_OWNER round feeds `--clear-done`. ACCOUNTED,
  NEEDS_RECONCILIATION and legacy rounds are still refused with exit 3.

## Round-1 findings, re-verified

| Finding | Verdict | How I checked |
| --- | --- | --- |
| F1 (BLOCKER) | FIXED, but blocked in production by R2-1 until the one-line patch lands | Probe on the real `last-render.md` plus a `\*\*` comment and a ticked Done (injected capture, quoted answer in origin/main history). `--clear-done --dry-run` gives exit 0 with a cleared Done. The same page plus one plain line Ben typed gives exit 4. `revertOwnerInput` (`:175-205`) deletes and flips only the lines `parseDocument` attributed. `--adopt-live` with `--clear-done` gives exit 2 (`:340-342`). |
| F2 (MAJOR) | FIXED | `** no` with no quoted answer gives exit 3. An unquoted answer (`Your note: why is…`) gives exit 3. Files are read via `git show origin/main:` (`:384-387`), never the working tree. A tick no longer passes on its own option line (`textOutsideOptionLines`), and the waiting item must carry the triple's title. |
| F3 (MAJOR) | FIXED | All four round-1 cases now refuse with exit 2 before any write: no default, overdue default, pre-ticked option, and stray Done (the stray Done via the page self-check, see R2-3). The escaped `\*\*` and `- **bold**` cases are refused too. |
| F4 (MAJOR) | FIXED | The backup path is parsed from the `[backup]` stderr line and logged as `backup: <file>`. A backup that differs from the step-1 read gives exit 5 naming the file and the `replace-md … --force` restore command. The backup content is the same `/pages/<id>/markdown` body that `read` prints (notion.js:292-295 and 392-397), so `normalize` compares like with like. The newest-by-name `.md` is the pre-write file, because `<ts>.after.md` sorts before `<ts>.md` (notion.js:515-521). |
| F5 (MAJOR) | FIXED | Push failing twice gives exit 6 with `render/last-2026-09-27T22-00-00-000Z`, which is a valid ref. `rebase --abort` runs first, and the message is honest if branch creation fails. |
| F6 (MAJOR) | FIXED | Being on `build/x` gives exit 2 before `replace-md`, and HEAD must equal origin/main. The commit is pathspec-scoped (`commit -m … -- last-render.md session.md`). The push is `origin HEAD:main`, and the retry runs `fetch origin main` then `rebase origin/main`. The same guard covers `--adopt-live` (`:438`). |

Also re-checked and fixed: M1 (a sha in link text, in a bare quote, and next to an underscore
all trip now), M2, M4, M6, M7, M10 and the NIT.

## The four minors left open

- **M3(b), handback reads the working-tree `last-render.md`: acceptable to defer.** A worktree
  branched before the latest publish can show a false DRIFT, but that fails safe (it blocks, it
  never hides anything), and changing it is a fixture rework. Keep it as a named follow-up.
- **M3(c), skip the check when no `decisions_url` is bound: acceptable to defer.** Every repo
  that binds a decisions page today is a claude-delegation checkout (checked across ~/Code), so
  the BLIND-without-`last-render.md` case has no live victim yet.
- **M5, stale `since:` heading on the clear-done publish: acceptable to defer.** It is cosmetic.
  No line is lost, and the next publish shows the new tick time.
- **M9, `--adopt-live` without a crash signature: acceptable to defer.** F1 made it
  non-routine again, the clear-done combination is refused, and the exit 4 message plus the M6
  hint now say when to use it.

## New MINOR

- **R2-2. The handback docs name the old token.** `decisions-handback.mjs` now ends with
  `HANDBACK page-drift` when drift is among the objections (`:567-570`), but SKILL.md:354 still
  says it "blocks (`HANDBACK blocked`, …)". Change that line to "prints a `DRIFT` line and ends
  with `HANDBACK page-drift` (exit 1; rescued by the kill switch like any other content
  objection)".
- **R2-3. A Done line inside a waiting item is blamed on the renderer.** `checkWaitingItem` lets
  a standalone item's single Done line through, because it is the item's own last line and
  raises no warning. The page self-check then refuses it with "render produced a page … — this
  is a renderer defect, never a source-file refusal" (probe `done-in-item`) and never names the
  file. That is still a safe refusal, but the message points the wrong way. Fix: in
  `checkWaitingItem`, also refuse `doc.doneLabel !== null` with
  `${label}: carries a Done line (only the renderer writes Done)`.
- **R2-4. M10's no-change check looks at the whole index.** `git diff --cached --quiet`
  (`decisions-render-publish.mjs:536`) sees any unrelated staged file. When `last-render.md` is
  unchanged but something else is staged, the pathspec commit fails and publish exits 6 after a
  good write. F6's precondition makes this rare (HEAD must equal origin/main, though the index
  can still hold staged edits). Patch:
  - current: `    execGit(['diff', '--cached', '--quiet'], repo);`
  - replacement: `    execGit(['diff', '--cached', '--quiet', '--', ...toAdd], repo);`

## Verified clean
- `revertOwnerInput` loosens nothing. It touches only the line numbers `decisions-read`
  returned, and flips only the last matching column-0 Done line. An indented Done is not
  flipped, so it drifts and exits 4, which is safe. Nothing else is normalised away.
- Step 2 without `--clear-done` is unchanged: any owner input exits 3 before the drift check.
- The self-check cannot block a legitimate publish. `publish` never passes a ticked Done, and
  the live migration render passes it.
- The retitle failure (M4) now surfaces after step 8 has committed and pushed, so a failed
  retitle no longer strands the page in drift.
- Territory is unchanged. pane-setup is not touched this round, and Releasing is intact.
