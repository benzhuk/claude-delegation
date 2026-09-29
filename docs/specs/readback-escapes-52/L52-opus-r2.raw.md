APPROVE 47780b4
VERDICT: APPROVE 47780b4a87a17d6056abaab3b964e6e8b783f1b0

Reviewer: Claude Opus 5.5, agent name lane52-review
Worktree: C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/9c61c35a-82dd-4aef-8eca-c99bb0e72e31/scratchpad/wt-review-52b (detached at 47780b4, left in place; wt-review-52 also left)
Date: 2026-09-28, America/New_York. Delta review after NEEDS_FIXES at ee488fd.

## Scope
- The only production change from ee488fd to 47780b4, after taking out the main merge, is in decisions-render-core.mjs: normalize and its comment, +73/-5. The only test change is in decisions-render.test.mjs, +41.
- The build-census files in the stat came only through merge c315eae of main 7ab59db. `git diff 7ab59db..HEAD` shows none of them.

## Mutants and attacks (measured with scratchpad/fg.mjs and mut.mjs)
| Case | Result |
|---|---|
| Earlier MAJOR: fence body with a backslash-star versus a plain star | diff (fixed) |
| New: inline code span with a backslash-star versus a plain star | diff (fixed, and my earlier MINOR 2 is closed) |
| New: an unterminated backtick run, then an escaped star in prose | EQUAL, correctly: the unmatched run does not open a literal |
| Same unterminated case with a word changed on a later line | diff: nothing later is swallowed |
| A literal backtick in prose that Notion escapes, plus a later real code span | EQUAL, correctly |
| A render backtick paired with a later backtick across blank lines, with an escape between | diff: a false red, the safe direction |
| Pinned live fixture with one bullet dropped | fails verify |
| Pinned live fixture with one tick changed | fails verify |
| Pinned live fixture with its backslash-star changed to x | fails verify |
| Aligned snapshots: base normalize versus candidate | red on base, green on candidate |

## Findings
- **MINOR (known limit, no fix required):** file decisions-render-core.mjs, the helper hasMatchingInlineClose. It pairs backtick runs across blank lines and stops only at a fence. Markdown code spans do not cross paragraph breaks.
  - Cause: the scan does not stop at a blank line.
  - Discriminating check: a render backtick in paragraph 1 pairs with a backtick in paragraph 3, so an escape Notion adds in paragraph 2 is treated as literal and compares unequal.
  - Effect: this is a false red only and cannot hide a content change.
  - Fix location, if wanted: stop the scan at the first blank line with `if (i !== lineIndex && candidate === '') return false;`.
  - Simplification: none needed.
- My earlier MINOR 3 still stands as a documented limit: an escaped leading bracket or quote marker equals a real to-do or quote line. Tick changes still fail.
- My earlier NIT 4, on consecutive backslashes, is unchanged.

Is this removing the cause: yes. The escape equivalence now applies only to prose, which is where the probe observed the escapes.

## Ran
- The focused set, all three files: 153 tests, 153 pass, 0 fail.
- 10 attack and mutant cases, all behaving as the table shows. No Notion calls, no source edits, no commits.
