VERDICT: APPROVE 8f9fa76

(Round 3 was `APPROVE 8500d9a`, round 4 `NEEDS_FIXES (3)`; round 5 at the bottom supersedes both.)

Round 3, delta `6b28563..8500d9a` only.

- **Verbatim**: the delta is one file, one hunk, +5 lines — the test I gave in round 2, character for character (`scripts/work-record.test.mjs:196-199`), placed beside the other A4 test. No other change; `git status` clean.
- **The revert now fails**: on a scratch copy, `work-record.mjs:145` reverted to `let hasInRepoEvidence = false;` gives **32 pass / 1 fail**, failing "validateRecord: accepted with an in-repo evidence path is clean without repoRoot". Baseline 33/33. The MAJOR 1 behaviour is pinned.
- **Gate** `node --test scripts/work-record.test.mjs agents/agents.test.mjs`: **57 pass / 0 fail** (56 + 1).

All round-1 and round-2 findings are closed. Carried forward from round 2, unchanged and not T1's to fix:

- `docs/work/wr-2026-09-21-next-build-t4.record.md:7` and `-t6.record.md:7` separate their two `Evidence:` paths with a **space**; C1 pins `<path>[, <path>]`, so each pair parses as one non-existent path and the validator correctly returns `evidence-missing`. Both files exist under `docs/work/evidence/`. Fix the two records before "the six records read reviewed with in-repo evidence" is claimed.
- For the seam review: `listRecords`' catch yields `{ fields: {}, errors: [] }` for a file that vanished between `readdir` and read, so a caller skipping malformed records by `errors.length > 0` will not skip it (T2's C3 wording, T4's janitor).

# Round 4 — NEEDS_FIXES (3)

Delta `8500d9a..223240f` only (5 files, all T1; `git status` clean; no hunk inside the safety block — builder.md 13-25, reviewer.md 15-27, edits at :23-59 and :25-64).
Gate `node --test scripts/work-record.test.mjs agents/agents.test.mjs`: **58 pass / 0 fail** (57 + the F7 test).
Six real records: `[]` with no opts, `[]` with `repoRoot`, and `["scope-unresolvable:info"]` with `+gitDir/ref` on all six — exactly F7's point, and level `info`, so no record gains a finding. (Round 2's `evidence-missing` on t4/t6 is gone: the orchestrator fixed the space-separated `Evidence:` lines.)

**F7 accepted.** `work-record.mjs:214-222` emits the row only inside the `gitDir && ref` guard, only in the `!out` branch; `FINDING_CODES` (`:13-17`) is untouched and "FINDING_CODES is exactly C2's twelve codes" still passes, so the pinned list is intact. Attacked the test four ways on a scratch copy — **never emitted** (`if (!out)` -> `if (false)`): 33/1, fails "scope-unresolvable"; **always emitted** (`if (true)`): 32/2; **level `info` -> `finding`**: 33/1; **both branches inverted**: 32/2. Both directions are genuinely pinned. Regression mutants R1/R2/R3/R4/R5 (stale direction, A4, scope-drift sha negation, owner-change, missing `ref`) all still die. `childEnv` is used correctly at `:337`.

**F3 accepted in substance.** `agents/reviewer.md:57-59` and `agents/builder.md:49-52` now split file-vs-reply cleanly, `docs/work-record.md:80-86` states it once, and the three agree. See MINOR 2 for the leftover.

## MAJOR 1 — the new helper's comment is false; the older git fixture still inherits the runner env
`scripts/work-record.test.mjs:14-16` asserts "every child this file spawns to build a git fixture goes through `childEnv()`, never a bare `process.env`". It does not: `:312` (named failure case 3, scope-drift) is still `execFileSync("git", args, { cwd: repo, encoding: "utf8" })` with no `env`, so that child inherits the running session's `HOME`, `CLAUDE_CODE_MESSAGING_SOCKET` and `CLAUDE_CODE_MESSAGING_TOKEN` — the exact 2026-09-17 class `test-child-env.mjs:7-17` exists to stop. The N2 class test (`skills/multi/scripts/hooks.test.mjs:414-439`) greps only the literal `...process.env` spread, so an omitted `env` slips through — T1's mirror of the seam's F4. The commit that adds the claim must make it true. Patch (`:312`, unique — `:337` ends `env });`):
old
```
  const run = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
```
new
```
  const env = makeGitFixtureEnv();
  const run = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", env });
```
It also drops this test's last dependence on the machine's ambient git identity (round-1 deviation 3): the fixture HOME carries its own.

## MINOR 2 — "verdict on line 1" survives in three places, the same under-specification F3 came from
`agents/builder.md:23`, `agents/reviewer.md:25` and `docs/mandate-template.md:64` still say "verdict on line 1" / "verdict on line 1, then stop" with no `VERDICT: ` prefix. Not a contradiction — `VERDICT: PASS` does put the verdict on line 1 — but it is the earlier bullet in each agent file, so it is what a builder reads first, and it is how F3 happened. Three one-line patches:
- builder.md:23 and reviewer.md:25, old (identical in both) `- Report to the path your brief names, verdict on line 1. Your final message is a short notification, not the report.` -> new `` - Report to the path your brief names, its first line `VERDICT: <word>`. Your final message is a short notification, not the report. ``
- mandate-template.md:64, old `Termination: report to the path above, verdict on line 1, then stop. A bare "Done"` -> new ``Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done"``

## MINOR 3 — the catch branch's documented behaviour is untested
`docs/work-record.md:112-115` promises that a `git` invocation failing outright yields neither a finding nor the info row, and `work-record.mjs:230-233` implements it — but nothing exercises the catch with `gitDir` and `ref` both present, so moving the `findings.push` into that catch leaves the suite **34/34 green** (verified). Append (verified: baseline 35/35, mutant 34/1):
```
test("validateRecord: a git invocation that fails outright yields neither scope-drift nor scope-unresolvable", () => {
  const execImpl = () => { throw new Error("fatal: not a git repository"); };
  const r = parseRecord(mkRecordText({ Scope: "docs/mandate-template.md@0000000" }));
  const findings = validateRecord(r, { gitDir: "/tmp/not-a-repo", ref: "HEAD", execImpl });
  assert.ok(!codes(findings).includes("scope-drift"));
  assert.ok(!codes(findings).includes("scope-unresolvable"));
});
```

## Notes (no action)
- `scope-unresolvable` is emitted but absent from `FINDING_CODES`, which is correct per C2 and documented at `work-record.md:110-116`. Nothing in the repo filters findings by `FINDING_CODES` (only `work-record.test.mjs:150` reads it), and the seam's consumer audit found T2 and T4 keying on `level`/`fields`, so the extra code reaches no gate as a finding.
- All six real records now carry an `info` row under `+gitDir/ref` because `Scope: next-build/spec.md@95d5453` is a scratchpad path. That is F7 working, but it means every record in this build reports "scope could not be checked" — worth one line in the merge ask so nobody reads the six clean `scope-drift` results as verification that the scope is current.

# Round 5 — APPROVE 8f9fa76

Delta `223240f..8f9fa76` only: two files, three hunks, +14/-3. `git status` clean. No `agents/*.md` hunk at all this round, so the safety block is untouched by construction, and `agents.test.mjs:77` ("safety blocks are byte-identical across all four agent files") passes inside the gate.
Gate `node --test scripts/work-record.test.mjs agents/agents.test.mjs`: **59 pass / 0 fail** (58 + the catch-branch test). `node --test skills/multi/scripts/hooks.test.mjs`: **26 pass / 0 fail**, N2 class test included. Six real records unchanged from round 4: `[]`, `[]`, `["scope-unresolvable:info"]`.

**MAJOR 1 — fixed, and proven behaviourally.** `scripts/work-record.test.mjs:312-313` now takes `const env = makeGitFixtureEnv();` and passes `env`; both `execFileSync` sites in the file (`:313`, `:338`) are sealed, so the `:14-16` comment is finally true. Not taken on the builder's word: I ran the suite with `HOME`/`USERPROFILE` pointed at a fresh empty mkdtemp, `GIT_CONFIG_NOSYSTEM=1`, no `GIT_CONFIG_GLOBAL`, and sentinel values in `CLAUDE_CODE_MESSAGING_TOKEN`/`_SOCKET` — **35 pass / 0 fail**. The same run against `git show 223240f:scripts/work-record.test.mjs` fails "fresh worker on an obsolete fact -> scope-drift on a fixture repo" (33/1). So the leak was real, the fixture identity now comes from the fixture home, and round-1 deviation 3 (the ambient-identity commit) is closed too.

**MINOR 3 — fixed as specified.** The test landed verbatim at `:358-367`. Moving the `findings.push` into the git `catch` now fails it (34/1) where it left the suite green at 223240f.

**MINOR 2 — correctly partial, and my round-4 patch was wrong on two of its three lines.** `docs/mandate-template.md:64` is done. `agents/builder.md:23` sits inside the markers at `:13`/`:25` and `agents/reviewer.md:25` inside `:15`/`:27` — both are safety-block lines, which T1's brief forbids and `agents.test.mjs:77` would break across the two agent files outside T1. The lead's ruling is right and I should have caught it when I wrote the patch; the follow-up record is the correct home for it. Suggest the record also carry a one-line rule: a reviewer patch touching `agents/*.md` states which side of the markers it lands on.

**No regressions.** Re-ran the full battery against the round-5 suite: stale direction, A4 revert, scope-drift sha negation, owner-change definition, missing `ref`, info-row-never, info-row-always, info-row-in-catch, accepted-without-evidence, bugfix-gate negation — **all ten killed** (33-34 pass / 1-2 fail each), baseline 35/35. Nothing survives.

Every round-1 through round-4 finding is closed. T1 is done from my side.
