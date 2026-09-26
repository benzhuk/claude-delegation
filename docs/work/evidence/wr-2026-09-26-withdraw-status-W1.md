VERDICT: APPROVE 481b6d736e2ab8f45277a382a883796aea2616a3

# W1 review, round 3 (delta): withdraw hardening follow-up

Reviewed: worktree `/home/ben/Code/wt-withdraw-status-1-W1`, HEAD
`481b6d736e2ab8f45277a382a883796aea2616a3` (from my own `git rev-parse HEAD`), range
`bbe4381..HEAD`, which is one commit (`481b6d7`, "fix(work-record): lock withdraw self-reference
test and fix docs placeholder"). I read the builder report (`W1-report-r3.md`) first, then the diff.
The commit touches two files, `scripts/work-record.test.mjs` (+4 lines) and
`skills/team-build/SKILL.md` (1 line). Author and committer are both `Ben Zhuk <benzhuk@gmail.com>`,
which is the configured `user.email`. There are no trailers.

Gate: I ran it on a `git archive HEAD` scratch copy with TMPDIR in my scratch folder. Result:
268/268 + 1/1 pass, 0 fail. That matches the builder's claim. The reviewed tree is clean:
`git diff --quiet HEAD` passes, and the only untracked files are in `docs/specs/withdraw-status-1/reports/`.
The builder says it ran its mutation check in-tree and restored the file afterwards. The tree
matches HEAD byte-for-byte, so nothing was left behind.

Counts: 0 BLOCKER, 0 MAJOR, 0 MINOR.

---

## Prior findings: each one verified

| # | Round-2 finding | Status | Evidence |
|---|---|---|---|
| MINOR A | The self-reference guard was not locked by any test | **Fixed** | `scripts/work-record.test.mjs:2391-2394` now creates `docs/work/wr-2026-09-26-self.record.md` (with `Work: wr-2026-09-26-self`). This is my patch text, applied verbatim. Mutation on scratch: I replaced `if (supersededBy === record.fields.work) {` (`scripts/work-record.mjs:1209`, 1 occurrence) with `if (false) {`. With that change, the withdraw tests went to 16 pass / 1 fail, and the failure was exactly the test "refuses a --superseded-by that is not a work id (path, subdirectory, or self-reference)". I then restored the file and confirmed with `cmp` against `git show HEAD:scripts/work-record.mjs`. The other two loop values (`../../other/…` and `archive/…`) are still refused by the shape regex, so adding the file does not mask either of them. |
| MINOR B | The SKILL.md placeholder contradicted the grammar | **Fixed** | `skills/team-build/SKILL.md:223` now reads `[--superseded-by <work-id>] --by <session-id> --at <iso> --repo <repo-root>`. This matches the enforced `/^wr-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/` and `docs/work-record.md:47`. |

Round-1 findings MAJOR 1-2 and MINOR 3-6 were verified fixed in round 2. `work-record.mjs` is
unchanged in this range (`git show --stat HEAD` lists no production file), so none of them can
have regressed.

## Regression hunt: nothing found

- **Production code:** no production file changed in this range. The behaviour is identical to
  round 2, which I verified.
- **The test's new fixture file.** It is created inside the same per-test `f.repo` temp fixture,
  so no other test is affected. All 268 tests still pass. The `before`/after byte check still
  covers the record being withdrawn (`example.record.md`), which is a different file from the new
  one.
- **Stale placeholder grep:** I grepped every `*.md` for `record-name` outside `reports/`. Two hits
  remain, and neither is W1's:
  - `docs/specs/withdraw-status-1/spec.md:12` still says `[--superseded-by <record-name>]`. That
    file is lead-owned input, outside W1's edit list, and `contracts.md` wins over it anyway. The
    lead may want to align it when accepting, but it does not affect the code or the verdict.
  - `docs/specs/2026-09-25-four-number-read.md:31` uses `<record-name>` for an evidence filename.
    That is a different concept and is unrelated.

## Non-blocking note (pre-existing since round 1, not counted)

The withdraw clause in `skills/team-build/SKILL.md:220-225` sits between "Ben's own quoted word" and
"— copy the deciding report to `docs/work/evidence/<work-id>-<lane>.md` at that moment, since
`accepted` requires …". Before W1, that copy instruction followed the `accepted` clause directly
(base `a8bffb6`, lines 219-221). Now "at that moment" can be read as the withdraw moment. The
"since `accepted` requires" clause disambiguates it, and neither round-1 nor round-2 review
counted it, so I am not counting it here either. If the lead wants the paragraph tighter, an
optional wording fix is to end the withdraw clause with a period and begin the next sentence
"On `accepted`, copy the deciding report …". Code impact: none.

## C4 fields

Cause: the round-2 self-reference test fixture never created the withdrawn record's own file under its work id. The "does not exist on disk" check therefore refused `wr-2026-09-26-self` first, and the self-reference guard at `scripts/work-record.mjs:1209` went untested. Separately, the SKILL.md placeholder `<record-name>` contradicted the work-id grammar that the code enforces.
Discriminating check: on a scratch `git archive` of `481b6d7`, replacing the guard at `:1209` with `if (false) {` makes exactly one withdraw test fail (16/17). Restoring the guard gives 268/268 + 1/1 green.
Fix location: `scripts/work-record.test.mjs:2391-2394` (fixture file) and `skills/team-build/SKILL.md:223` (placeholder).
Simplification: a four-line fixture addition and a one-word docs change. There is no production code change and no new grammar.
