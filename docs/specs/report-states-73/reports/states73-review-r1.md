VERDICT: NEEDS_FIXES (1) 658efde1634b5e9dc77f718afa3076f3eb37a9c8

# states73 review, round 1 (lane 73, wr-2026-10-01-report-states)

Worktree wt-report-states-73-states73, branch build/report-states-73-states73. I ran `git rev-parse HEAD` there myself: 658efde1634b5e9dc77f718afa3076f3eb37a9c8. Base 7233aa7f7c287b7edc81989f5eaedbed80aef5b4. `git status --short` printed nothing before and after the review. I edited nothing in the worktree. All probes ran from the lane-73 scratch dir.

Counts: 0 BLOCKER, 1 MAJOR, 9 MINOR. The (1) in the verdict line counts BLOCKER plus MAJOR.

## Gate (run by me)
Command: the territory Gate command, redirected to scratch `lane-73/review-gate.log`. Exit 0. Tail: tests 1132, pass 1132, fail 0, 0 `not ok` lines. This matches the builder's 1132.
Extra consumer run (`lane-73/review-consumers.log`): collect-status, collect-from-origin, four-read, skills/team-build/references/*.test.mjs (build-loop-workflow, accept-prep), skills/delegate/references/*.test.mjs and bugfix-fields. Exit 0, 380 of 380.
I did not run the full suite (Windows; the lead runs it).

## MAJOR

### M1. The contract and the first-line rule put "a runner" with the progress reports, but every runner's report is Evidence that accept requires to open with `VERDICT:`. Builder reports are in neither group.
Evidence:
- docs/subagent-contract.md:19-21: "A **reviewer, integrator or seam** report keeps `VERDICT: <word>` ... A **progress** report (a runner, a lead, anything long-running) opens with its state: `DONE`, ...". The same split appears at skills/team-build/SKILL.md:149, skills/delegate/SKILL.md:67 and docs/mandate-template.md:66-69. The setup agent copies the mandate template into every territory brief (build-loop-workflow.js:410), so this text reaches every builder brief.
- Runners in this codebase write Evidence. The suite runners and second-host runners are told "first line of your report is VERDICT: PASS, FAIL, or BLOCKED" (skills/team-build/references/build-loop-workflow.js:202, :214, :1254). Their logs become `Evidence:` entries, for example docs/work/evidence/wr-2026-10-01-reliability-b-suites.md, line 1 `VERDICT: PASS a4d67680...`.
- validateRecord fires `evidence-no-verdict` on any Evidence file whose first line does not start with `VERDICT:` (scripts/work-record.mjs:479-480).
- Builder reports open `VERDICT: PASS|FAIL|BLOCKED` (build-loop-workflow.js:198, :204). The new text names neither group for them. A builder that reads "anything long-running" in its own brief has two contradictory rules.
- Consequence: a lead following the one-place rule in team-build briefs a census or suite runner to open `DONE (...)`. That report becomes Evidence, and accept or close then refuses it. That is rework after acceptance, one of the four measures.
- Note: the territory brief's pinned wording said "progress reports (runner, lead, long-running thing)", and the builder followed it. The scout's question 1 assumed "reviewer/integrator/builder VERDICT lines unchanged". The fix below takes the scout's reading. If the lead meant a different set of runners, the lead decides that, and the text must still keep every Evidence-producing report on `VERDICT:`.
Fix (wording is a judgment, so this is an instruction, not a verbatim patch). Make the same change in all four places: contract:19-21, team-build/SKILL.md:149, delegate/SKILL.md:67 and mandate-template.md:66-69.
- The VERDICT group becomes: "A reviewer, integrator, seam, builder or suite/census runner report (every build-loop worker, and anything that can be listed as `Evidence:`)".
- The progress group becomes: "a status report on a long-running thing (a lead's or a goal's progress, never an `Evidence:` file)".
- Update the anchor regex in scripts/report-check.test.mjs:111 to the new sentence. Keep the "exactly once" count.
Predicted outcome: the gate stays green, since only that one test asserts the sentence. No reader changes.

## MINOR

### m1. report-check does not name which field line 2 is missing.
The reviewer brief requires "the message names what is missing". A line 2 without `Est:` (or without `Now:` or `To finish:`) gets the generic "line 2 must be exactly `Now: ...` with all three non-empty". Probes bad-no-est, bad-no-now and bad-no-tofinish all printed that message (scripts/report-check.mjs:114-116).
Patch, scripts/report-check.mjs:114-116. Current:
```
    } else if (!parseProgressLine(second)) {
      errors.push("line 2 must be exactly `Now: <one line> | To finish: <one line> | Est: <duration>` with all three non-empty");
    }
```
Replacement:
```
    } else if (!parseProgressLine(second)) {
      const absent = ["Now:", "To finish:", "Est:"].filter((label) => !second.includes(label));
      errors.push(absent.length > 0
        ? `line 2 lacks ${absent.join(", ")}: expected \`Now: <one line> | To finish: <one line> | Est: <duration>\``
        : "line 2 must be exactly `Now: <one line> | To finish: <one line> | Est: <duration>` with all three non-empty");
    }
```
Predicted: bad-no-est prints "line 2 lacks Est:", and an empty field keeps the old message. Existing tests that match on "line 2" still pass. Check their regexes for the word "exactly" before applying.

### m2. The three-field parser accepts a pipe inside Now or To finish, and an unbalanced step parenthesis.
`FAILED: x (1 of 3 steps done)` followed by `Now: a | b | To finish: c | Est: d` exits 0, because Now is parsed as "a | b". `FAILED: x (1 of 3 steps done` with the closing parenthesis missing also exits 0 (probes edge-pipe-now and edge-unbal). The parser rejects a pipe only in Est (report-check.mjs:42; decisions-render-core.mjs isProgressLine).
Patch, scripts/report-check.mjs:42. Current:
```
  if (!now || !toFinish || !est || /\|/.test(est)) return null;
```
Replacement:
```
  if (!now || !toFinish || !est || /\|/.test(now) || /\|/.test(toFinish) || /\|/.test(est)) return null;
```
Apply the same change in skills/decisions/scripts/decisions-render-core.mjs isProgressLine: add `&& !m[1].includes('|') && !m[2].includes('|')`. Predicted: every fixture and the live session.md bullets still pass (none has a pipe inside a field), and the edge-pipe-now probe exits 1.

### m3. A record with `Status: NEEDS ben` passes as a peer slug named "ben", while report-check refuses the same text.
`isLaneStatusWord("NEEDS ben")` returns true (scripts/work-record.mjs:32-35). report-check refuses `NEEDS ben` with "write the owner as exactly NEEDS BEN" (report-check.mjs:84).
Patch, scripts/work-record.mjs:35. Current:
```
    && (["open", "FAILED", "NEEDS BEN", "accepted", "closed"].includes(status) || LANE_PEER_RE.test(status));
```
Replacement:
```
    && (["open", "FAILED", "NEEDS BEN", "accepted", "closed"].includes(status) || (LANE_PEER_RE.test(status) && status !== "NEEDS ben"));
```
Predicted: "NEEDS ben" becomes bad-status in validateRecord and status-word-refused at accept and merge-check. Add it to the bad list in work-record-states73.test.mjs:52. The on-disk records check is unaffected (no record uses it).

### m4. The renderer checks only the first item in a waiting file.
checkWaitingProgressLine finds the first `<summary>` only (decisions-render-core.mjs:494). checkWaitingItem accepts a file with more than one decision item. Probe: a file with two items, where only the first has the line, passes checkWaitingItem and checkWaitingProgressLine, so the second item is emitted without the three fields. Every live waiting file has 1 item, and none in the last 60 commits had more, so this is latent.
Patch, decisions-render-core.mjs:494-506. Loop over every index where `/<summary>/.test(l)` and run the same three checks on `lines[idx + 1]`, each naming `${label}:${idx + 2}`. Predicted: the existing progress tests pass unchanged, and a two-item fixture is refused at the second item's line.

### m5. "In-progress item" is detected only by a bullet that starts with "In progress". Open question for the lead.
checkSessionProgress returns early unless the bullet matches `/^In progress\b/i` (decisions-render-core.mjs:512). These bullets all pass without the fields: `**In progress**, lane x`, `Running: lane 62, 73, 74` and `Ongoing: lane x`. The live docs/decisions/session.md has a "Running: 62 recovery (held on the guard), 73, then 74." bullet, which is an in-progress item with no three-field line. The builder recorded this as reading 5, and it is the narrow reading. Whether "every in-progress item" (spec item 3) should also cover such bullets is the lead's call. No fix requested.

### m6. Consumers: the new words are counted as malformed or shown as "owned". Not proven to break, but mishandled.
- hooks/backlog-notice.js:226: `!statuses.includes(status)`, with statuses = parser.STATUSES. Probe: `classify` on records with Status open, NEEDS BEN, NEEDS skills-o and FAILED returns `malformed: 1` for each. The hook prints `backlog-notice: skipped N malformed record(s)` to stderr on every run once a record adopts docs/work-record.md's first-listed word `open`. The printed counts are unaffected, since none of these words is runnable, delivered or rejected.
- scripts/collect-from-origin.mjs:140: `computeState` maps open, NEEDS BEN, NEEDS <peer> and FAILED to `owned`. collect-status.mjs:426 then names the state "owned" in its stall-nudge note to the owner, even for a record waiting on Ben. The old word `blocked` already maps the same way.
- No status word that contains a space reaches a note `--text`. NOTE_STATE_TOKENS and the STATUSES lookup at collect-status.mjs:54/:426 keep it out (verified by reading the code).
- work-census and four-read read `owned` and `delivered` from Log lines. See m9.
Fix (optional, the lead's call): in backlog-notice.js:226, accept `parser.isKnownStatus(status)` when exported, instead of `statuses.includes(status)`. Predicted: no stderr note for the new words, and backlog-notice.test.mjs still passes. Mapping NEEDS and FAILED in computeState is a lifecycle decision for the lead.

### m7. withdraw cannot leave the new words. Open question.
WITHDRAWABLE_STATUSES is still rejected, blocked, runnable, owned (scripts/work-record.mjs:71). A record in `open`, `NEEDS BEN`, `NEEDS <peer>` or `FAILED` cannot be withdrawn. FAILED is the obvious withdraw candidate. The Readings section does not mention withdraw. The spec's word set omits `withdrawn` entirely, so this is the lead's decision (scout question 3).

### m8. The delegate skill now cites a repo-local script that is not there once mirrored.
skills/delegate/SKILL.md:70 says `(node scripts/report-check.mjs <report>)`. mirror-shared-skills.mjs:121 says `scripts/` is never published into `~/.agents/skills/`, so in any other repo the path does not exist. Before this change, delegate/SKILL.md cited no `scripts/` path (grep: 0 lines before, 1 after).
Fix: qualify the path as "(in the claude-delegation checkout: `node scripts/report-check.mjs <report>`)" or drop the command from the delegate line. Predicted: the item 5 test still passes, since it matches the "First-line rule:" sentence and "`PARTIAL` is refused.".

### m9. Merge-day hazards for the lead (disclosed or latent, not code defects).
- At HEAD the renderer refuses the live page: `decisions-render.mjs render --repo <worktree>` exits 2 with `waiting/decision-classes.md:3 lacks the line directly under the title`. The builder disclosed this. The next publish after merge is blocked until all six docs/decisions/waiting files gain the line.
- PROGRESS_LINE_FROM = 2026-10-02T04:00:00Z (work-record.mjs:46) comes before the 10/2 3:00 PM due time. Any record opened on main in that window without a `Now:` line gains a `missing-field` finding at merge, and accept refuses it.
- The cutoff uses the declared `Opened:`, not effectiveOpenedMs (work-record.mjs:781), so a back-dated Opened skips the rule. This matches ACCEPTED_WITHOUT_CHECK_CUTOFF, as the brief asked.
- `Log:` lines take one `\S` token for the status (work-record.mjs:306-310). `Log: <at> NEEDS BEN lead ...` parses as status "NEEDS", owner "BEN". Nothing writes such a Log line today. Open question if leads start logging the new words.

## Required checks, verified absences included

(1) Report states. I ran 36 scratch fixtures through `node scripts/report-check.mjs`. All results were as required.
- Exit 0: DONE, DONE without parentheses, NEEDS BEN, NEEDS seam-reviewer, FAILED, and CRLF.
- Exit 1: PARTIAL, `Partial:`, lowercase `done`, lowercase `needs ben`, `NEEDS:` with no peer, a missing steps phrase, 5 of 3 steps ("n cannot exceed m"), a non-DONE report with no line 2 (including line 2 blank with the Now line on line 3), line 2 without Now, To finish or Est, an empty To finish, an empty Est, a state word inside a fenced block (both DONE and NEEDS), a leading blank line (LF and CRLF), `VERDICT: PASS`, DONE 2 of 3, `# DONE`, `**DONE**`, `NEEDS Ben`, an empty file, no argument, and a missing file.
- Exceptions are in m1 and m2. Also lenient but harmless: `DONE (0 of 0 steps done)` passes, and a BOM is stripped. `Est: soon` passes: the spec's `<duration>` is unvalidated, and live usage ("tonight for the diff") would fail strict parsing, so this is not a finding.

(2) Records.
- I ran parseRecord and validateRecord (now = 2026-10-01T23:00Z, repoRoot = the worktree) over all 140 docs/work/*.record.md at HEAD, once with HEAD's work-record.mjs and once with base 7233aa7f's (extracted by `git archive` into scratch). Findings: 58 at HEAD, 58 at base. Parse errors: 0 and 0. Per-file differences: none.
- Status distribution: accepted 80, closed 47, reviewed 7, withdrawn 4, blocked 1, owned 1.
- `git diff --stat 7233aa7f..HEAD -- docs/work docs/decisions docs/specs agents` prints nothing, so no closed record changed.
- accept: a word outside the set gets `status-word-refused`, and a post-cutoff reviewed record without Now gets `progress-line-missing` (work-record.mjs:1091-1101). merge-check: a word outside the set gets `status-word-refused` and every allowed word except accepted gets `not-accepted-for-merge` (:1965-1970). Both are covered by work-record-states73.test.mjs, which is in the gate.
- accept and close rewrite Status in place (:1670, :1930), so a `Now:` line survives both.
- Exception: m3.

(3) Renderer.
- The fixtures with and without the line behave as specified (decisions-render-progress.test.mjs, 7 tests).
- The real sources at HEAD do not render; the builder said why (m9).
- I copied docs/ to scratch, added one line under each of the six `<summary>` lines and rendered with HEAD's renderer (git ls-tree read from the worktree). It rendered 154 lines. The diff against base's 147-line render is exactly six added `\t\tNow: ...` lines.
- page-lint `--kind decisions` gives exactly 12 `em-dash-arrow` hits on both the base render and the fixed render. They are the same pre-existing lines, shifted by 6. The Now line adds no new lint hit.
- Session limits: the 200-character and 8-bullet checks run before the new check and count the fields (decisions-render-core.mjs:578-581).
- Exceptions: m4 and m5.

(4) Consumers: see m6. None throws, and no spaced word reaches a regex or token lookup unsafely. Verified by probe and by reading the code.

(5) Rule placement.
- "First-line rule:" appears exactly once in skills/team-build/SKILL.md and once in skills/delegate/SKILL.md (grep -c: 1 and 1).
- The contract keeps `VERDICT:` for reviewer, integrator and seam reports (subagent-contract.md:19).
- agents/*.md and build-loop-workflow.js are untouched (no diff).
- The grouping of builder and runner reports is wrong: M1.

(6) Scope.
- All 31 changed files are in the territory list, including the new scripts/fixtures/report-states-73/ (10 files) and skills/decisions/scripts/fixtures/progress-73/ (5 files).
- There are no changes under docs/work, docs/decisions or docs/specs, and no consumer file was edited.
- Readings taken:
  - 1: acceptable as worded in the brief, but the contract text it produced is M1.
  - 2: sound.
  - 3: sound under the brief's pin that accept keeps `reviewed`. The gate set adds only an error-code distinction, since accept and merge-check already refused every word but one.
  - 4: sound (no bad-status cutoff; Now line date-gated like ACCEPTED_WITHOUT_CHECK_CUTOFF).
  - 5: the narrow reading, and its gap is m5.
  - 6: sound (docs/components.md header, tested at report-check.test.mjs:97).
  - 7: sound (parentheses optional, DONE needs n = m).
- Unaddressed lifecycle points: m7 (withdraw) and m9 (Log grammar).

## Open questions for the lead (not decided here)
1. Which reports are "progress reports": which runners, and whether builders are included (M1).
2. Should in-progress session bullets other than those starting "In progress" carry the line (m5)?
3. Withdraw from open, NEEDS or FAILED (m7). Mapping NEEDS and FAILED in collect-from-origin computeState and the stall nudge (m6).
4. A Log-line grammar for spaced status words (m9).
