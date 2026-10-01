# Scout: merge66 (merge origin/main f976ca0a into build/fresh-walk-66 @ 77dac671)

Read-only survey. Merge-base of 77dac671 and origin/main = fbd7cf62 (1482 commits on main since). Dry run
`git merge-tree --write-tree --name-only 77dac671 origin/main` gives tree 31828cf3 with exactly ONE textual
conflict: docs/native-use.md. Everything else auto-merges.

## 1. Files and symbols
- docs/native-use.md: CONFLICT (premise "README.md, janitor/SKILL.md also conflict" does NOT hold; they auto-merge).
  Branch side adds 3 things: a team-build sentence (one mid-tier builder + one reviewer), a bold "read work-record.md
  for the exact field schema" sentence, a `multi` sentence about nested `claude -p` env -u, and the whole new section
  "### Script paths, the goal card, and closing a build in a fresh project". Main side retired `continue`: removed the
  "Use `continue` at a pause..." sentence and the "Use the native binding/accounting commands below..." sentence, the
  continuation-contract section ("## Use the bounded continuation contract") and its native-continuation-testing sentence,
  and changed "nine skills" -> "eight skills", dropped `delegation:continue`, dropped the Interrupt/Stop-bypass sentence,
  and "inbox and continuation behavior" -> "inbox behavior". Rule: keep main's side for every continue removal; keep the
  branch's additions (they are not continue-related) unless they cite a removed thing.
- README.md: auto-merges; branch paragraph (line ~35, link to native-use.md#script-paths-the-goal-card-and-closing-a-build-in-a-fresh-project) survives. The anchor must still match the heading in native-use.md after resolution.
- skills/janitor/SKILL.md: auto-merges; branch's main_branch sentence survives in "## Adapters" (~line 292).
- skills/multi/SKILL.md: auto-merges; branch's "A nested `claude -p` ... is not you" paragraph survives (~line 80).
- scripts/goal-card.mjs: auto-merges and KEEPS dee95ab: `const SELF_PATH = fileURLToPath(import.meta.url)` at ~445 and
  `rejectionNotice` at 448-450 uses `node "${SELF_PATH}" check`. Main alone has the old `node scripts/goal-card.mjs check` (line 448 on main). On the branch the fix is at 334-339 (spec cites :448, that is the post-merge line).
- scripts/goal-card.test.mjs: auto-merges; the two new asserts survive (~389-390).
- Scripts named in the new native-use section all exist on main: scripts/build-census.mjs (--lead), work-record.mjs
  (check-acceptance, accept, --census, --no-census, --pinned-artifact/--delivery-ref, `invalid Work:`), goal-card.mjs,
  skills/bearings/scripts/bearings-state.mjs, templates/goal-card.md; goal_card config key exists (goal-card.mjs:32).

## 2. Helpers to reuse
- `git merge origin/main` in the territory worktree, resolve only docs/native-use.md by hand. No new code.
- `git diff 31828cf3` against the resolved tree is a quick check the non-conflicted files were not hand-edited.

## 3. Tests that police this area
- scripts/goal-card.test.mjs: MAJOR 4 test asserts the notice names the script's real path and not `node scripts/goal-card.mjs`.
- scripts/janitor.test.mjs (~2435): pins janitor SKILL.md heading list exactly; the merge must not add/remove a heading.
- hooks/delegation-reminder.test.mjs and hooks/lib/goal-context.test.mjs import goal-card.mjs (rejection notice wording "goal card not injected").
- No test reads docs/native-use.md, README.md, or skills/multi/SKILL.md. Windows has no full suite; run node --test only on the files above.

## 4. Open questions for the spec
- After resolution, is the branch's new section still accurate on main (e.g. "Lead-session" required on 0.20.10+, five-line card shape)? Tree says the scripts exist; wording not verified against main's work-record.md field table.
- Both sides edited the paragraph starting "Use `continue` at a pause..." (main dropped the `continue` sentence; branch appended the nested `claude -p` env -u clause to the `multi` sentence). Resolution should be main's paragraph plus the branch's `multi` clause; confirm no leftover `continue` skill reference (grep -n continue docs/native-use.md).
