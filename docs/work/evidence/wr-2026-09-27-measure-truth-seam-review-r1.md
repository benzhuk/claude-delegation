VERDICT: NEEDS_FIXES 4ff8d94999333cd529372639317f1e4048e0675e

# Seam and integration-merge review: measure-truth-1 (lane fourteen)

Head confirmed with `git rev-parse HEAD` in /home/ben/Code/wt-mt: `4ff8d94999333cd529372639317f1e4048e0675e`, on build/measure-truth-1. The review was read-only. `git status --short` was the same before and after the suite ran. All trial edits were made in a `git archive` copy under the scratchpad (`seam.DYLc/copy`), never in the worktree.

Findings: 1 MAJOR, 2 MINOR. The merge, the R9 parse, the tiers sync and test coupling are verified clean (section "Verified clean").

---

## MAJOR-1: the build loop's own `reviewed` line fails F1's R3, so every strict loop acceptance is refused, this lane's included

The joint is F1's R3 against the existing record writer in `skills/team-build/references/build-loop-workflow.js`. That file is outside all three territories, but it writes the only `reviewed` Log line a loop-accepted record gets. The accept-prep runner writes exactly one `Log: ... reviewed ...` line (skills/team-build/SKILL.md:418-421) and then runs `check-acceptance`. Its note is built at build-loop-workflow.js:355:

```js
const seamLogText = seam && seam.verdict === 'APPROVE' ? `seam r${seam.rounds} APPROVE ${seam.sha}` : 'seam SKIPPED'
```

Neither form names a model. Every earlier loop record shows this: `seam r3 APPROVE 55106db` (one-launch), `seam r1 APPROVE f3ec533…` (merge-on-acceptance), and `seam SKIPPED` (ledger-both-halves, one-launch-fix, withdraw-status). Under R3 a strict record fails both ways:
- **seam APPROVE**: the line is `reviewed` with `APPROVE` and no counted token, so it fails `log-model-missing` on that line (work-record.mjs:675-680).
- **seam SKIPPED**: the line is exempt at work-record.mjs:673, but the `continue` there comes before `hasHighTopApprove` can be set. So the at-least-one rule (work-record.mjs:683-688) fails whenever this is the record's only `reviewed` line, which it always is in the loop. Even `seam SKIPPED; territory reviews APPROVE (Opus reviewer)` fails.

I ran this for real. The scratch copy of this lane's record had Status `reviewed`, plus Artifact, Evidence and an Observed paragraph. The run was the real `check-acceptance` with the real four-read JSON:

```
[seam r1 APPROVE 4ff8d94999333cd529372639317f1e4048e0675e]
work-record: [log-model-missing] Log: 2026-09-27T12:18:00.000Z reviewed line's note names no counted model token (docs/model-tiers.md); add one, e.g. "Opus reviewer"
[seam SKIPPED]
work-record: [log-model-missing] no Log: reviewed line dated on/after STRICT_FROM names both a high- or top-tier model token and the word APPROVE
[seam r1 APPROVE 4ff8d94999333cd529372639317f1e4048e0675e (Opus reviewer)]
work-record: [sha-not-in-git] ...   <- passed every measure-truth rule; failed only on scratch-repo git state
[seam SKIPPED; territory reviews APPROVE (Opus reviewer)]
work-record: [log-model-missing] no Log: reviewed line ... names both a high- or top-tier model token and the word APPROVE
```

What this costs:
- Every build accepted through the plugin once this merges and ships gets a guaranteed `checkAcceptance` FAIL blocker.
- The lead then has to hand-edit the accept-prep line. That is rework after acceptance, the measure this lane exists to drive to zero.
- This lane's own record is hit too. Accept-prep will write `seam r1 APPROVE 4ff8d94…`, and the spec requires running the new accept on this record, which refuses it.
- Other lanes opened after 08:32:15Z (04:32 NY) are already strict.

Cause: R3 put the model requirement on `reviewed` lines, but did not change the loop's writer of those lines. It also made `seam SKIPPED` exempt from R3 without letting that line count toward the at-least-one rule.
Discriminating check: `node scripts/work-record.mjs check-acceptance` on a strict record whose only `reviewed` line is the loop's literal note. It gives `log-model-missing` for both loop forms, and passes the measure-truth rules only after the patches below are applied.
Fix location: skills/team-build/references/build-loop-workflow.js:355 (both paths), scripts/work-record.mjs:673 (the SKIPPED path only), plus one test in each of their test files.
Simplification: the loop pins `model: 'opus'` for every territory and seam reviewer (build-loop-workflow.js:603, 643, 726, 769), so a literal `(Opus reviewer)` in the note is true by construction. No model has to be threaded through.

### Patch A, mechanical (APPROVE path, plus the note for the SKIPPED path). skills/team-build/references/build-loop-workflow.js:355

Current:
```js
  const seamLogText = seam && seam.verdict === 'APPROVE' ? `seam r${seam.rounds} APPROVE ${seam.sha}` : 'seam SKIPPED'
```
Replacement:
```js
  // measure-truth-1 R3: this is a loop-accepted record's only `reviewed` Log line, so it must
  // name a counted high-tier model. Every territory and seam reviewer above is pinned to
  // model 'opus'.
  const seamLogText = seam && seam.verdict === 'APPROVE' ? `seam r${seam.rounds} APPROVE ${seam.sha} (Opus reviewer)` : 'seam SKIPPED; territory reviews APPROVE (Opus reviewer)'
```
Existing loop tests stay green. Line 1509 uses `includes("seam SKIPPED")`, line 1510's `!/seam r\d+ APPROVE/` does not match the SKIPPED text, and line 1612 uses `includes(...)`. I measured it in the scratch copy: build-loop-workflow.test.mjs plus accept-prep.test.mjs gave 100/100.

Pin the new text in skills/team-build/references/build-loop-workflow.test.mjs:
- after line 1509 add `  assert.ok(acceptCall.prompt.includes("seam SKIPPED; territory reviews APPROVE (Opus reviewer)"), "R3: the SKIPPED reviewed line still names the territory reviews' model");`
- after line 1612 add `  assert.ok(acceptCall.prompt.includes(\`seam r1 APPROVE ${fullSeamSha} (Opus reviewer)\`), "R3: the seam reviewed line names its model");`

### Patch B, which amends R3 and needs a lead ruling. scripts/work-record.mjs:673

The SKIPPED path cannot pass with Patch A alone. The fix is to let a SKIPPED `reviewed` line that also names a high- or top-tier APPROVE satisfy the at-least-one rule, while it still needs no model of its own.

Current (work-record.mjs:673-674):
```js
      if (isReviewed && SKIPPED_WORD_RE.test(note)) continue; // the loop's "seam SKIPPED"
      const tiers = countedModelTiers(note);
```
Replacement:
```js
      const tiers = countedModelTiers(note);
      if (isReviewed && SKIPPED_WORD_RE.test(note)) {
        // The loop's "seam SKIPPED" needs no model of its own, but when the same line also
        // names the territory reviews' high/top-tier APPROVE it still satisfies the
        // at-least-one rule below (seam review: the loop's only reviewed line).
        if (approves && (tiers.has("high") || tiers.has("top"))) hasHighTopApprove = true;
        continue;
      }
```
Add to scripts/work-record.test.mjs, after the R3 SKIPPED test at line 2917:
```js
// Seam (measure-truth-1): the build loop's own accept-prep reviewed line is a loop-accepted
// record's ONLY `reviewed` line; a strict record must pass R3 on that line alone.
for (const note of [
  `seam r1 APPROVE ${"d".repeat(40)} (Opus reviewer)`,
  "seam SKIPPED; territory reviews APPROVE (Opus reviewer)",
]) {
  test(`R3 seam: the loop's own reviewed line satisfies R3 on a strict record: ${note.slice(0, 24)}`, () => {
    const text = mkRecordText(
      { Opened: STRICT_FROM, Base: "a".repeat(40), "Spec-session": "real-spec-session-1", "Spec-from": STRICT_FROM },
      [`Log: ${STRICT_FROM} reviewed lead ${note}`],
    );
    const record = parseRecord(text);
    assert.equal(checkMeasureTruthRules(text, record, {}).strict, true);
  });
}
```
Result in the scratch copy: work-record.test.mjs passed 221/221 with Patch B plus this test and the MINOR-2 test. With Patch B reverted, the SKIPPED case fails, so the test does discriminate. After Patch B:
- a bare `seam SKIPPED` still refuses on a record with no other high-tier APPROVE `reviewed` line, as R3 intends;
- the "SKIPPED needs no model" test at line 2917 still passes.

Add one sentence to docs/work-record.md's "Model tokens" paragraph, after "(the loop's `seam SKIPPED`) needs no model.": "Such a line still satisfies the at-least-one rule below when it also names a high- or top-tier token and `APPROVE`; the build loop writes `seam SKIPPED; territory reviews APPROVE (Opus reviewer)`."

If the lead rules against Patch B, the alternative is to change only the loop. The SKIPPED-path note would then drop the word `SKIPPED`, for example `seam not run; territory reviews APPROVE (Opus reviewer)`, and the tests at lines 1509-1510 would be rewritten. I think Patch B is the smaller change.

---

## MINOR-1: this lane's record repeats lane sixteen's defect in substance. The F3 APPROVE names no reviewer model

docs/work/wr-2026-09-27-measure-truth.record.md:14 reads `F3 APPROVE 6131258 (r1), F1 APPROVE b28254e (r2, Opus reviewer); ...`. R3 checks each line, not each APPROVE, so the line passes only because F1's `Opus` is on the same line. F3's reviewer model is written nowhere: `grep -il "opus|sonnet|haiku|fable"` finds no model in reports/F3-review-round1.md or F3-state.md. Lane sixteen needed exactly this kind of docs fix after acceptance.

Fix: the record's Log is append-only by convention, so leave line 14 alone and append one line before accept. For example:
```
Log: <ISO now> owned skills-n F3 APPROVE 6131258 (r1, Opus reviewer: the loop pins delegation:reviewer to model opus); F2 APPROVE 9b697ff (r4, Opus reviewer); seam APPROVE 4ff8d94 pending (Opus reviewer)
```
Adjust the seam part to match the final seam verdict.

Optional follow-up, not required for this lane: R3 could check each `APPROVE` occurrence instead of each line. That would be a new ruling and is out of scope here.

Other checks on this record:
- It is strict: Opened `2026-09-27T08:32:15.000Z` equals `STRICT_FROM`, and its first add-commit 278f349 has author time 2026-09-27T04:35:31-04:00 (08:35:31Z), which is later.
- Spec-session is real.
- Spec-from `2026-09-27T08:19:00Z` is in Z form.
- Base is one 40-hex sha.
- Its APPROVE-bearing lines at 10:53:51Z and 12:08:33Z each carry `Opus`.
- It has no `reviewed` line yet. Accept-prep supplies it, which is why MAJOR-1 matters here.

---

## MINOR-2: nothing tests the R9 contract against F2's real R6 line shape, and the refusal text says "zero or missing" when the value is `unavailable`

F1's R4 tests use hand-written values in the old shape: `0 gaps over 30min` and `1 gap(s) over 30min stalled; relaunched` (work-record.test.mjs:2191, 2215, 3046, 3062). None has a zero N next to a non-zero M or X, and none uses the `unavailable` wording. The behavior is correct (see below), but only by inspection.

There is also a wording seam. When there are fewer than 2 lead messages, F2 prints `gaps unavailable (fewer than 2 lead messages in window); agent <id> silent …`, which counts an agent stall but has no leading integer. F1 then refuses the record, which is fail-closed and correct, but its error says `is zero or missing` (work-record.mjs:726). Meanwhile docs/census.md:310 says every agent stall "adds one to the leading count", which is not true on that line, because no count prints.

Patch 1. scripts/work-record.mjs:726, current:
```js
          `Log: ${stallLines[0].at} ${stallLines[0].status} names a hung/stall/relaunch word, but Four numbers: Work lost or stalled: is zero or missing and no Stall:/Gap: body paragraph explains it`,
```
Replacement:
```js
          `Log: ${stallLines[0].at} ${stallLines[0].status} names a hung/stall/relaunch word, but Four numbers: Work lost or stalled: has no non-zero leading integer (zero, unavailable, or missing) and no Stall:/Gap: body paragraph explains it`,
```
Existing tests assert on the code `stall-word-unexplained` and the timestamp, not on this text. I checked lines 3041-3140 and they stay green.

Patch 2. docs/census.md:310, current: `real stall prints \`agent <id> silent <N> min from <ISO>\` and adds one to the leading count;`. Replacement: `real stall prints \`agent <id> silent <N> min from <ISO>\` and adds one to the leading count (when the lead's gaps are available; the gaps-unavailable line prints no count, and accept then needs a \`Stall:\`/\`Gap:\` paragraph);`.

Patch 3. Add to scripts/work-record.test.mjs after line 3068 (verified in the scratch copy, it passes):
```js
// Seam (R9): F2's real R6 line shape - only the leading N is read, never M or X.
test("R4 seam: R6's '0 gap(s) ... stalled; M waiting-on-agents (X min)' reads N=0 and refuses; unavailable wording refuses; N>0 passes", () => {
  const text = mkRecordText(
    { Opened: "2020-01-01T00:00:00Z", Base: "a".repeat(40) },
    ["Log: 2020-01-02T00:00:00Z owned lead the builder hung on a prompt"],
  );
  const record = parseRecord(text);
  const now = new Date("2020-01-03T00:00:00Z");
  const run = (v) => checkMeasureTruthRules(text, record, { now, fourNumbers: [`Work lost or stalled: ${v}`] });
  for (const v of [
    "0 gap(s) over 30min stalled; 3 waiting-on-agents (95.0 min); 0 unanswered ASKs to lead",
    "gaps unavailable (fewer than 2 lead messages in window); agent a1 silent 64.9 min from 2020-01-02T00:00:00.000Z; 0 unanswered ASKs to lead",
    "unavailable (no accepted Log: entry)",
  ]) {
    assert.throws(() => run(v), (e) => e.code === "stall-word-unexplained", v);
  }
  assert.equal(run("1 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); agent a1 silent 64.9 min from 2020-01-02T00:00:00.000Z; 0 unanswered ASKs to lead").strict, false);
});
```

---

## Verified clean

### 1. R9 contract: the real pipeline
I ran `four-read.mjs --json` on each committed fixture record, then fed the resulting JSON to `work-record.mjs check-acceptance --four-read`. Merged-tree outputs, verbatim:
```
lane10: 1 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); agent a314563636ff6b931 silent 216.8 min from 2026-09-26T22:44:29.665Z; ASKs unavailable (no --lead-slug)
lane16: 0 gap(s) over 30min stalled; 1 waiting-on-agents (41.8 min); ASKs unavailable (no --lead-slug)
```
- **Lane ten**: F1 reads N=1 and passes R4.
- **Lane sixteen**: F1 reads N=0 and refuses a stall-worded record with `stall-word-unexplained`. It does not read M=1 or X=41.8.
- **Anchoring**: F1's regex `/^Work lost or stalled:\s*(\d+)/i` (work-record.mjs:722) is anchored to the start of the line, so M and X are never read.
- **Unavailable wording**: I probed seven hand-built values: zero N with non-zero M, `gaps unavailable (fewer than 2 …); agent … silent …`, `gaps unavailable (no lead transcript)`, `unavailable (no accepted Log: entry)`, `agent x unreadable timestamps`, `subagents unavailable (…)`, and `10 gap(s)…`. F1 never reads an `unavailable` value as a passing number. Every one refuses, except `10 gap(s)`, which passes. The labels match: F2's `label: 'Work lost or stalled'` (four-read.mjs:666) is the prefix F1 looks for.

### 2. Self-application: R4 on this lane's own record
I ran four-read on the real lead session f6c8ae21…, with `--accept-at 2026-09-27T12:18:05.000Z` (08:18 NY):
```
2 gap(s) over 30min stalled: 2026-09-27T11:28:53.143Z (36.1min); 2 waiting-on-agents (119.9 min); agent a4a474e84f8e25782 silent 64.9 min from 2026-09-27T09:48:32.147Z; ASKs unavailable (no --lead-slug)
```
- **The builder hang counts**: F2 counts the F2 r3 builder's hang, 64.9 min from 09:48Z (05:48 NY), as an agent stall. It is bounded by the lead's TaskStop at 10:53:23Z.
- **The lead stall is real**: the lead-stall piece from 11:28:53Z (07:28 NY) is genuine. The relaunch run wf_3afecf1c's last agent activity was 11:16:15Z, and the lead's next span tool_use is 12:05:34Z.
- **R4 passes**: N=2, and a later accept instant can only keep or raise N, because the 09:48Z stall stays inside [Opened, accept]. So R4 passes on the `hung`/`relaunched` lines.
- **What still blocks accept**: R3, as described in MAJOR-1.

### 3. Merge integrity
- `git diff --name-only bc82273 4ff8d94` lists exactly 16 files: the union of F1's 9, F2's 5 and F3's 2 against 278f349. The three sets do not overlap.
- For each territory file, `git diff --quiet <territory-sha> 4ff8d94 -- <file>` shows no difference. The two files from bc82273 (the record and lead-stall-note.md) are also unchanged at 4ff8d94.
- The merges made no conflict resolutions and no extra edits.

### 4. docs/model-tiers.md sync
- No commit in 278f349..4ff8d94 touches docs/model-tiers.md.
- The table rows (top Fable / GPT-6-Astra; high Opus / GPT-5.6-Sol "(see note)"; mid Sonnet / GPT-5.6-Terra; fast Haiku / GPT-5.6-Luna, GPT-5.3-Codex-Spark) match `MODEL_TIER_TOKENS` (work-record.mjs:515-520).
- The sync test (work-record.test.mjs:2839) strips the parenthetical and passes at this head.

### 5. Cross-territory tests
- four-read.test.mjs neither imports nor names work-record.
- work-record.test.mjs pins no F2 output. Its Four-numbers values are self-authored, and it imports nothing from four-read.mjs.
- So no brittle cross-territory assertion exists. The only gap is the missing contract test in MINOR-2.
- The docs do not contradict each other: F2's census.md paragraphs and F3's SKILL sentences touch different files and different subjects.

### Gates at 4ff8d94
- `node --test scripts/work-record.test.mjs`: 218/218.
- `node --test scripts/four-read.test.mjs`: 94/94.
- `node scripts/run-tests.mjs`: 2089 tests, 2086 pass, 0 fail, 3 skipped, exit 0 on Linux (Netcup).

## Observation, out of scope
One full sealed-suite run raised used /tmp inodes from 521,611 to 534,074, and /tmp holds thousands of leftover `hook-core-`, `backlog-home-`, `multi-hook-` and `note-inbox-` dirs. That is the leak behind this lane's 12:08Z ENOSPC block. It predates this lane and is not in its territories, but it will stall the next lane the same way.
