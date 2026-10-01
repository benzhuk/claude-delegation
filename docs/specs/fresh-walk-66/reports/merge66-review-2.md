VERDICT: APPROVE fc0c6601d4451c0b17af7acb151ca6f1799bf63d

# merge66 review, round 2 (delta re-review)

Reviewed HEAD: fc0c6601d4451c0b17af7acb151ca6f1799bf63d. I ran `git rev-parse HEAD` in wt-fresh-walk-66-merge66 myself. Range cf47d9649c63be8ecaafc4c84c3156901425f445..HEAD holds one commit, fc0c6601 `docs: native-use closeout recipe lists main's strict record fields (lane 66 review F1)`. Its parent is cf47d964, author Ben Zhuk, and it has no trailers (`git log -1 --format=%B | grep -i -E "co-authored|claude|assistant|generated"` exits 1). `git show --stat`: `docs/native-use.md | 14 +++++++++-----`. No other file is touched.

The round-1 report (merge66-review.md) is left unchanged. This round-2 report is a separate file so the round-1 evidence stays on disk.

## Prior finding F1 (MAJOR drift): fixed, verified by measurement

- The diff applies the round-1 patch verbatim. native-use.md:13 now lists `Lead-session:`, `Base:`, `Spec-session:`, `Spec-from:` and `Scratch:`. native-use.md:67-75 now names Base (unconditional), Spec-session, Spec-from (UTC Z), Scratch (absolute), and a reviewed `Log:` note carrying `APPROVE` plus a high- or top-tier model token.
- I checked each claim in the new text against HEAD's scripts/work-record.mjs:
  - Base is refused on every record, strict or not (work-record.mjs:747-753, the "R2: Base - unconditional" block), so "(refused on every record without it)" is accurate.
  - Spec-session and Spec-from are refused on strict records (:756-772). `SPEC_FROM_STRICT_RE` requires the Z form, which matches "UTC instant ending in Z".
  - Scratch is refused when Spec-from >= SCRATCH_FROM 2026-09-29T00:54:00Z (:118, :143-151), and an absolute path is required (:133-140).
  - The model-token-plus-APPROVE rule is at :774-807. docs/model-tiers.md:11 puts Opus in the high tier, so the doc's example `(Opus reviewer)` counts.
- Discriminating check, run by me: I copied the round-1 scratch repo to `<scratchpad>/fresh-proj-r2`. The worktree was not touched. I wrote a record using exactly the fields the patched text names, then ran HEAD's `work-record.mjs check-acceptance --repo . --record ... --pinned-artifact 248b22bb...`:
  - full patched recipe: `{"ok":true,"work":"wr-2026-10-01-wordcount",...}`
  - drop Base: `[base-invalid]`
  - drop Spec-session: `[spec-session-missing]`
  - drop Spec-from: `[spec-from-missing]`
  - drop Scratch: `[scratch-missing] ... on or after SCRATCH_FROM`
  - drop ` APPROVE (Opus reviewer)`: `[log-model-missing] ... names no counted model token`
  - Opus without APPROVE: `[log-model-missing] no Log: reviewed line ... names both a high- or top-tier model token and the word APPROVE`
  - Sonnet instead of Opus: the same `[log-model-missing]`
  - drop Lead-session: `[lead-session-missing]`

  Every field the fix added is needed, and together they are enough. The recipe now passes because the check runs against the real script, not because the check skips anything. This is the opposite of round 1's "a check that passes because it isn't looking".

## Regression hunt on the merge (re-run, all clean)

- Stray edits: `git merge-tree --write-tree --name-only 77dac671 f976ca0a` gives tree afe532da0db7d35d277aba7d964bffb4a359b9a6. `git diff afe532da HEAD --stat` gives `docs/native-use.md | 20 ++++++++++----------`, one file. That diff is the round-1 5-to-1 conflict resolution plus the fix commit's lines. Every other file still matches git's merge-tree byte for byte.
- Conflict markers: `git grep -n -E '^(<<<<<<<|>>>>>>>)( |$)' HEAD` exits 1. `git grep -n -E '^=======$' HEAD -- '*.md' '*.mjs' '*.js' '*.json'` exits 1.
- Resurrection: `grep -n -i continu docs/native-use.md` has two hits, :9 ("Continue useful work") and :17 ("Continue useful authorized work"). Both are ordinary English. `grep -n -E "native-continuation|skills/continue|delegation:continue"` over native-use.md, README.md, skills/janitor/SKILL.md and skills/multi/SKILL.md exits 1.
- Lost fix: `git merge-base --is-ancestor dee95ab HEAD` prints ANCESTOR_OK. goal-card.mjs:445 has `const SELF_PATH = fileURLToPath(import.meta.url);`. :450 has `` `node "${SELF_PATH}" check` ``.
- Anchor: the heading `### Script paths, the goal card, and closing a build in a fresh project` is at native-use.md:21, unchanged. README.md:35 links `#script-paths-the-goal-card-and-closing-a-build-in-a-fresh-project`, and it still resolves.
- No test reads native-use.md: `git grep -l "native-use.md" -- '*.test.*'` exits 1.
- CRLF: `git show HEAD -- docs/native-use.md | grep -c $'\r'` gives 0.

## Gate (re-run by me from the territory worktree)

- `node --test scripts/goal-card.test.mjs hooks/lib/goal-context.test.mjs hooks/delegation-reminder.test.mjs`: tests 91, pass 91, fail 0, exit 0.
- `node --test --test-name-pattern="J1 round 2 MINOR 5" scripts/janitor.test.mjs`: tests 1, pass 1, fail 0, exit 0.
- `git status --short` in the worktree after my review: 0 lines.

These match the builder's merge66-gate2.log counts (91/91, 1/1).

## Observation (MINOR, non-blocking, not counted; outside this territory's merge-only mandate)

- O1. The merge leaves a stale line citation in a code comment. scripts/install-janitor-timer.mjs:486 cites `docs/native-use.md:65-67` for the `codex plugin add` route. On main (f976ca0a) those lines are the codex block, so the citation was correct there. The branch section added at :21-83 pushes the block down: `grep -n "codex plugin add" docs/native-use.md` now finds it at :133. The merge caused this, but the fix would mean hand-editing an auto-merged file, which merge66.md forbids. Round 1 did not raise it, and fc0c6601 did not introduce it. Fix for a follow-up (or for the lead to rule in): in scripts/install-janitor-timer.mjs:486 replace `(docs/native-use.md:65-67)` with `(docs/native-use.md:131-135)`. A sturdier option names the section instead of a line number: `(docs/native-use.md, "Current fresh-project route")`. Predicted outcome: comment only, no test effect.
- I also found pre-existing drift on main, which the merge did not cause. README.md:117 is cited by the same comment (:485) and is already stale on main: `git show f976ca0a:README.md | sed -n 117p` shows the subagent-contract bullet.

## Bug-fix fields (for F1's fix)

Cause: the branch's closeout recipe (approved 9/26) predates main's strict cutoff (d92ae537, STRICT_FROM 2026-09-27T08:32:15Z) and SCRATCH_FROM (2026-09-29T00:54:00Z). It omitted Base, Spec-session, Spec-from, Scratch and the model-token APPROVE note.
Discriminating check: a scratch record built from the patched text gives check-acceptance `{"ok":true}`. Removing any one added field gives that field's named refusal (the matrix above).
Fix location: docs/native-use.md:13 and :67-75 (commit fc0c6601).
Simplification: still open. The section restates the record schema and could instead point to work-record.md's "Fields", "Model tokens", "Strict cutoff" and "Scratch" sections by name, so the next strict rule cannot leave it stale. This is a design choice, not a blocker.

## Disclosures

- My only write is this report. My scratch copy `fresh-proj-r2/` (a `cp -r` of the round-1 scratch repo, with no commits made in it) is under the session scratchpad C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-Code-zhuk-infra-claude-delegation\a7e8fc6b-cbf3-476b-aaea-23ad30508174\scratchpad. I did not delete it. The brief named no `Scratch:` directory.
- I made no git commits anywhere this round, passed no `-c` flags and changed no identity.
