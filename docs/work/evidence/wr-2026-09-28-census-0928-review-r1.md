VERDICT: NEEDS_FIXES 8e94a2a

# Lane 50 (census-0928) review, round 1

Reviewed: `git diff f7df941..8e94a2a` in the lane-50 worktree (build/census-0928-1). Line numbers are for `docs/reports/census-0928/four-read.md` at 8e94a2a unless another file is named. Read-only review. No file other than this report was written.

Count: 3 Major, 5 Medium, 6 Minor. The table's numbers are sound: every sampled cell matched its source. What needs fixing is a missed stall on record, one unsupported "beat" call, a next change that would worsen the one measure that failed, and stale or mislabelled text around the table.

## Verified correct (no finding)

- **S1 scope.** I re-derived it from every `docs/work/*.record.md` at f7df941 and got the same 12 records, with no misses: 31, 32, 33, 34, 37, 38, 42, 43, 44, 46, 47, 48.
- **Hours cells, all 12 recomputed** from `Opened:` to the first `accepted` Log line: 31 = 53.0 min, 32 = 441.6, 33 = 34.8, 34 = 37.3, 37 = 204.3, 38 = 47.2, 42 = 34.9, 43 = 38.9, 44 = 39.0, 46 = 44.5, 47 = 115.2, 48 = 34.4. Each matches its four-read `:8` cell to 0.1 h. The claims "median 0.7 h", "seven lanes 0.7 h or less" and "eleven of 12 under 3 h 40" are all correct.
- **Token cells, 9 Claude lanes.** Each matches its source line:
  - four-read `:7` for 32, 33, 34 and 38 (4,844,410; 9,838,870; 10,887,369; 11,940,121);
  - census `:9` for 42, 43, 44 and 46 (8,917,860; 11,623,981; 18,248,547; 14,735,966);
  - repo-env census `:12` for 47 (35,706,699).
  The median is 11,623,981 (lane 43) and the range is 4.8M to 35.7M, both correct.
- **Lead turns.** 32 = 9, 33 = 7, 34 = 8, 38 = 9, 42 = 7, 43 = 9, 44 = 7, 46 = 10 and 47 = 19 all match census `:7`. Codex lane 31 = 1 matches sealed-signal census `:11`.
- **Codex cells for 31, 37 and 48.** The PARTIAL verdict (`census.md:1`), the hours and gaps, the 4 rework commits on lane 37, and the unanswered-ASK ids all match their four-read files.
- **Fable row.**
  - The window sum is 5,474 + 683,680 + 39,357,584 + 224,181 = 40,270,919 (`fable-lead-census.md:40`).
  - By-model totals (`:12`), wakes 15 (`:9`), Stop-blocks 1 (`:10`) and leadTurns 39 (`:7`) all match.
  - The by-role unassigned total of 19,103,822 equals Opus 10,498,370 plus Sonnet 8,605,452.
- **65M prediction arithmetic.** Every step checks out:
  - 40,270,919 / 65M = 62.0%.
  - The remainder is 24,729,081, about 24.0 turns at 1.03M each.
  - The rate is 40.27M / 5.27 h = 7.64M/h.
  - The bound is reached 3.24 h after 00:19Z, which is about 23:33 NY. The report's "around 11:30 PM NY" is correct.
  - Fable against the median lane is 3.46×, and cache reads are 97.7%.
  - The (b) wording matches `docs/decisions/history/2026-09-28.md:34-35`: claude-fable-5-1, lead windowByModel, every Fable lead session.
- **Rework trailer check.** `git log origin/main --since=2026-09-28T04:00:00Z --until=2026-09-29T04:00:00Z` returns 216 commits. Both `-i --grep=co-authored-by` and a body grep return 0.
- **Lane 37 lines.** Rejections at `:21`, `:23` and `:25`, the merge-gate failure at 22:47:49Z (`:34`) and re-acceptance at 22:58:55Z (`:42`) are all correct.
- **4b correction citations.**
  - `scripts/four-read.mjs:47` is `loadJson`, which swallows a parse failure into `null`.
  - `:146` returns `unavailable (no census)`.
  - `:787` is `const census = loadJson(...)`.
  - `:789` is `leadPath = census && census.leadPath`.
  - `scripts/build-census.mjs:1675` parses `--json`, and `:1709-1711` writes it.
  - `docs/census.md:492-494` prescribes `--census docs/work/evidence/<id>.census.json`.

  The correction is right, and the original 4b cause ("build-census does not emit JSON") is wrong. No `.census.json` is committed for lanes 33, 34, 42, 43, 44, 46 or 47. The lead (f6c8ae21) and subagent transcripts on this host hold 68 `--census $E-census.md` argument forms against 34 `$E.census.json` forms. That supports "handed the markdown".
- **S7 scope.** `git diff --stat f7df941..8e94a2a` shows four files:
  - `docs/census.md`, +2 lines (one text line and one blank);
  - the two files under `docs/reports/census-0928/`;
  - the lane's own record, `docs/work/wr-2026-09-28-census-0928.record.md`.

  The Authority line allows the lane's own record ("no … other record edit"). No script, `GOALS.md` or other record changed. All commits are under the configured identity.
- **DONE ids.**
  - "Led once from Claude": lane 33, lead f6c8ae21, census `COUNTED` (`collect-followups-census.md:1`).
  - "Lead under 20": lane 33 at 7 and lane 47 at 19.
  - "Nothing lost": lane 33 at four-read `:10` and record `:56`.
  - The Codex part: `render-readback.record.md:10-11` carries Lead-session 01a0df4c and Spec-session 9c61c35a.

  All ids and lines check out.

## Major

### MAJ-1. The packet's stall #1 (lane 36's 6:12 PM hang) is on record, but the report says it cannot be found

- **Evidence.** `origin/build/lane-closeout-1:docs/work/wr-2026-09-28-lane-closeout.record.md:36` says the C1 Sonnet builder round 5 "committed 2296478 at 22:12Z then hung setting up the mutation proof (no report, no gate); lead (opus) stopped it" at 00:03Z. 22:12Z is 6:12 PM NY, exactly the packet's time. The lead noticed about 111 minutes later.
- **Timing.** That line was committed in ad30238 at 2026-09-28T20:02 NY (00:02Z). That is before lane 50 opened at 00:14:15Z, and the line was reachable on this host through `origin/`.
- **Where the report goes wrong.**
  - Lines 104-112 say "Not found in this shape on this host" and substitute lane 32's hang.
  - Finding 7 (lines 263-267) sends lane 38's owner a false "could not be corroborated" finding.
  - The stall paragraph in the verdict (lines 290-295) leaves the hang out.

  The check looked only at closed records under `docs/work/` of the worktree. S3 names this stall explicitly, whatever the record's status.
- **Fix, lines 104-112.** Replace the whole numbered item 1 with:

  ```
  1. **"Lane 36's builder hang at 6:12 PM NY."** Confirmed, on lane 36's open record on its build
     branch: `origin/build/lane-closeout-1:docs/work/wr-2026-09-28-lane-closeout.record.md:36`
     (committed ad30238, 20:02 NY): the C1 round-5 Sonnet builder committed 2296478 at 22:12Z
     (6:12 PM NY), then hung with no report and no gate; the lead stopped it at 00:03Z, about 111
     minutes later. Lane 36 is not closed, so it has no row in the table (S1).
  ```

- **Fix, finding 7 (lines 263-267).** Replace it with `7. **Packet stall #1:** read (see item 1 above); nothing missing.`
- **Fix, verdict.** Add this bullet after line 291:

  ```
  - Lane 36's C1 builder hung after committing 2296478 at 6:12 PM and sat about 111 minutes until the lead stopped it at 8:03 PM (`origin/build/lane-closeout-1:docs/work/wr-2026-09-28-lane-closeout.record.md:36`). Lane 36 is still open, so it is not in the table.
  ```

- **Predicted outcome.** The "did not beat" call still holds and gets stronger. Lane 38's owner no longer receives a false finding.

### MAJ-2. The "Hours ask to accepted: beat" call rests on an unsupported inference, and the record's own field contradicts it at the median

- **Evidence.** Line 286 says: "Adding the spec time can only lengthen today's figures, so the gain is real at the median." That does not follow. The margin is 50 − 41.7 = 8.3 minutes, and the spec interval can be measured, because every record carries `Spec-from:`. `docs/census.md:372` defines `Spec-from:`–`Opened:` as the spec writer's slice.
- **Recomputed from min(`Spec-from`, `Opened`) to the first accept:**

  | Lane | 31 | 32 | 33 | 34 | 37 | 38 | 42 | 43 | 44 | 46 | 47 | 48 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|
  | Minutes | 57 | 446 | 39 | 48 | 217 | 206 | 129 | 92 | 39 | 45 | 115 | 35 |

  The median is **74.3 min, above the 50-minute package-build**.
- **Caveats on that clock.** Lanes 34, 37, 38, 42 and 43 share `Spec-from: 2026-09-28T19:03:14Z`, the start of the Fable batch rather than a spec written for each lane. Lanes 44, 46 and 47 have `Spec-from` after `Opened`. So neither clock is clean.
- **What follows.** "Beat" holds only on the `Opened` clock. The baseline's own definition (`GOALS.md:16`, "from Ben's go") cannot be compared.
- **Fix.** In line 286, replace "Hours ask to accepted: beat, though on a shorter clock." with "Hours ask to accepted: beat on the reader's clock, cannot compare on the baseline's." Then replace the last two sentences, from "The two clocks start at different points." to "smaller than it looks.", with:

  ```
  The two clocks start at different points: the reader starts at Opened, after the Fable spec; the baseline starts at Ben's go. Measured instead from each record's Spec-from (or Opened, where Opened is earlier), the 12-lane median is 74 minutes, over the 50-minute build; Spec-from is shared by five lanes (19:03:14Z, the Fable batch start) and falls after Opened on three, so neither clock is the baseline's. The gain holds on the Opened clock only.
  ```

  Also carry the new call into the one-change guard (see MAJ-3).

### MAJ-3. The one change next would worsen the measure that failed, and its per-turn cost is an average stated as a fact

- **Conflict with the goals.** `GOALS.md:11`: "A change … is made only if it improves one of these four measures and worsens none." The change (lines 306-310) is: "Let lane results wait in the ledger until the lead's next planned turn."
  - `GOALS.md:18` defines Work lost or stalled to include "loud notes unread over 30 min".
  - Its baseline is "two RESULT notes waited 6 h 54 and 57 min".
  - Batching RESULT notes directly raises how long notes sit unread.
  - That is the one measure the verdict itself calls "did not beat" (line 290). The verdict names only hours as a guard (line 310).
- **Unsupported cost claim.** Line 308, "each of its 39 turns costs about 1.03M whatever it does", is 40,270,919 / 39: an average. `fable-lead-census.md:1` counts 213 lead requests in the window, an average of 189k per request. A wake turn may be one or two requests. The census gives no split between wake-opened and other turns, so the saving is not read.
- **Fix.**
  1. In line 308, replace "so each of its 39 turns costs about 1.03M whatever it does." with:

     ```
     so its 39 turns average about 1.03M each (213 requests, about 189k each); the census does not split tokens between the 15 wake-opened turns and the rest, so the saving is not yet read.
     ```

  2. In line 310, replace "Hours ask to accepted must not rise, because a batched read can delay the next dispatch." with:

     ```
     Two measures must not worsen: hours ask to accepted, because a batched read can delay the next dispatch, and work lost or stalled, because a batched read leaves RESULT notes unread longer; no RESULT or loud note may sit unread over 30 minutes (docs/GOALS.md:18), read from the flush log and ledger. Before building, split the Fable lead's window tokens by wake-opened versus other turns, so the saving is measured rather than assumed.
     ```

- **Predicted outcome.** The change still names its measure (top-tier tokens through the Fable share). It now names both guards and the missing read, and it satisfies GOALS.md:11 as written.

## Medium

### MED-1. The baseline row prints "not tracked" where GOALS.md pins numbers, which S3 forbids

- **Evidence.** Line 88 has "not tracked pre-census | not tracked | not tracked | not tracked". But `GOALS.md` pins a number for every measure:
  - `:15`: 12.6M median over 14 records, range 2.8M to 54.7M; hand-run builds have no token record.
  - `:16`: package-build 50 min, rename-build 3 h 40.
  - `:17`: the trailer class recurred across 87 commits.
  - `:18`: RESULT notes waited 6 h 54 and 57 min; 3 of 7 loud notes logged no-inbox.

  S3 requires "plus any other number GOALS.md pins for it, quoted with its line number". The verdict (line 275) notices this, but the table still says otherwise.
- **Patch, line 88.** Replace the first five cells with:

  ```
  | **Baseline (hand-run, 2026-09-25 bearings O9, no source record; measure baselines docs/GOALS.md:15-18)** | hand-run: none ("earlier hand-run builds have no token record", `docs/GOALS.md:15`); plugin baseline same line: median 12.6M, range 2.8M to 54.7M over 14 records closed 9/26 to 9/28 | package-build 50 min; rename-build 3 h 40 (`docs/GOALS.md:16`) | Co-Authored-By trailer class recurred across 87 commits; no per-build count (`docs/GOALS.md:17`) | two RESULT notes waited 6 h 54 and 57 min; 3 of 7 loud notes logged no-inbox (`docs/GOALS.md:18`) |
  ```

  Keep the lead-turns cell as it is.

### MED-2. The token column labels a combined lead-plus-subagents figure as "lead", and finding 2 wrongly calls reviewer tokens unread

- **Evidence.** For lane 33 the "lead" figure is 9,838,870, but the lead-window Opus row is 70 + 107,554 + 5,766,699 + 21,584 = **5,895,907** (`wr-2026-09-28-collect-followups-census.md:34`). The 9,838,870 is by-model combined, lead window plus subagents (`:9`, `:245-249`).

  Lane 32 is the same: its lead window is 2,764,625 (`autolink-guard-census.md:33`), against the 4,844,410 shown.
- **Why it matters.** The Opus reviewer's tokens are **inside** the printed figure, which contradicts finding 2 (lines 213-217). Only the per-agent split is unread. Lanes 42-47 are already labelled "lead plus subagents", so the rows are inconsistent with each other.
- **Fix.** In the rows for lanes 32, 33, 34 and 38, change `lead N (claude-opus-5-5)` to `top-tier N (claude-opus-5-5; lead window plus subagents, reviewer included)`. In finding 2, replace "`unread (per-agent token breakdown not printed —`" with "`reviewer tokens are inside the combined top-tier figure; the per-agent split is unread (per-agent token breakdown not printed —`".

### MED-3. Wrong-cause text is left standing beside the 4b correction

- **Evidence.** The correction (line 251) and the verdict (line 277) say the gap, stall, wake and Stop-block cells for lanes 42-47 blank because the markdown census has no `leadPath` (`four-read.mjs:789`). Passing the `.json` would fill them. Three passages still say otherwise:
  - Finding 4 (lines 224-236) says the gap cells are "genuinely unread" and that "re-pointing four-read at the existing census.md would not fill this cell either way". Its "Missing:" asks for a new per-turn timestamp measure in `build-census.mjs`, which is not needed.
  - Finding 5 (lines 255-256) says "the different-path miss between `four-read.mjs`'s own `--census <json>` flag and `build-census.mjs`'s markdown-only output".
  - Table cells at lines 95-99 say "different-path miss".

  Lane 38's owner will act on these.
- **Fix.**
  - In finding 4, replace lines 224-228, from "This part is genuinely unread:" through "would not fill this cell either way.", with:

    ```
    Cause: the one under 4b (the markdown census has no `leadPath`, so four-read never opens the lead transcript, `scripts/four-read.mjs:789`).
    ```

  - Replace lines 234-236, from "Missing (for the gap/hours part only):" to the end of the item, with:

    ```
    Missing: a four-read rerun with the `.census.json`, per 4b's correction.
    ```

  - In finding 5, replace "the different-path miss between `four-read.mjs`'s own `--census\n   <json>` flag and `build-census.mjs`'s markdown-only output." with "four-read was handed the markdown census (see the correction under 4b)."
  - In each of lines 95-99, replace "different-path miss" with "markdown `--census` miss (4b)".
  - Optionally strike 4b's original cause paragraph (lines 242-250) and keep only the correction.

### MED-4. Unanswered ASKs are counted as stall evidence, but they are the lanes' own dispatch asks

- **Evidence.** Line 293: "the reader counts 8 unanswered ASKs … 7 of them are distinct." Those ids are each lane's own Fable dispatch ASK: skills-fable-lane-31-1, -37-1, -43-1, -47-1 and -48-1.
- **Why they are not lost work.** Every one of those lanes was picked up, delivered, accepted and closed, and its record acknowledges the ASK:
  - `wr-2026-09-28-cross-host-nudge.record.md`: 2 mentions of `skills-fable-lane-43-1`, 1 of them an ACK;
  - `wr-2026-09-28-repo-env-everywhere.record.md`: 3 mentions of `-47-1`, 2 of them ACKs;
  - `wr-2026-09-28-render-readback.record.md`: 2 mentions of `-48-1`, 1 an ACK.

  Four-read reads them at accept time, before the RESULT reply exists. Lane 46's count includes lane 47's dispatch. None of this is work lost.
- **Fix.** Replace line 293 with:

  ```
  - The reader also counts 8 "unanswered" ASKs (7 distinct), but at least five are the lanes' own dispatch asks, picked up and closed, read before the RESULT reply; they are not counted as stalls here.
  ```

- **Predicted outcome.** "Did not beat" still stands, on lane 32, lane 36 (MAJ-1) and the readback exit 5s.

### MED-5. The token-baseline comparison partly compares today with itself, and "3.5 times the median lane" compares a session with a build

- **Self-comparison.** `GOALS.md:15` was written in 7b00418 at 15:10 NY on 9/28 as "closed lanes 2026-09-26 to 2026-09-28". Lanes 32 and 33, closed at 06:31 and 00:24 NY, fall inside that sample and are two of today's nine. Without them, the median of the other seven is 11.94M, so the call "level" survives but should say so.
- **Session against build.** Line 308's "3.5 times the median lane" sets a 5.3-hour session total against a per-build figure. Per lane closed in that window, the Fable share is 40.27M / 9 = 4.47M.
- **Fix.**
  - In line 281, after "That is level with the plugin baseline, not a gain.", add:

    ```
    The baseline was written at 3:10 PM NY on 9/28 (7b00418) and its sample can include lanes 32 and 33; without them today's median is 11.9M, still level.
    ```

  - In line 308, replace "and 3.5 times the median lane." with:

    ```
    and, spread over the nine lanes that closed in its window, adds about 4.5M a lane, 38 percent on top of the 11.6M median.
    ```

## Minor

### MIN-1. Line 21: the closing times are wrong

- **Evidence.** Lane 32 closed at 06:31 NY (line 28 of the report; `autolink-guard.record.md:56`), not "24 minutes past midnight".
- **Patch.** Replace "which closed 8, 24 and 24 minutes past\nmidnight NY respectively." with "which closed at 00:08, 06:31 and 00:24 NY on 9/28\nrespectively."

### MIN-2. Line 128: lane 48's accept time is wrong

- **Evidence.** 23:44:00Z is the `reviewed` line (`render-readback.record.md:21`). The accept is 23:47:24Z (`:28`).
- **Patch.** Replace "2026-09-28T23:44:00Z / 23:57:13Z = **7:44 PM / 7:57 PM\n   NY**" with "2026-09-28T23:47:24Z / 23:57:13Z = **7:47 PM / 7:57 PM\n   NY**". The conclusion, inside the window, is unchanged.

### MIN-3. The S5 lines and the verdict's DONE lines disagree without a pointer

- **Evidence.** Line 187 says "not yet" and line 300 says "partly". Line 197 says "proven" and line 302 says "partly". The verdict explains its own reading, but a reader who stops at S5 gets the other answer.
- **Fix.** Append ` (the Opus verdict below reads this part as partly met; see "DONE, part by part")` to the lead-in of lines 187 and 197.

### MIN-4. The lanes 46/47 overlap double-counts more than subagent tokens

- **Evidence.** Both census windows cover the same lead session from 22:17:33Z to 22:47:25Z (`test-temp-hygiene-census.md:20`, `repo-env-everywhere-census.md:26`). Lead-window tokens and lead turns in that half hour count twice too.
- **Patch, line 284.** Replace "That half hour's subagent tokens are counted in both lanes." with "That half hour's lead and subagent tokens, and its lead turns, are counted in both lanes."

### MIN-5. The Fable session's own Opus subagents are left out of the Fable share

- **Evidence.** `fable-lead-census.md:12` shows claude-opus-5-5 = 10,498,370 in the same window, under subagents of 9c61c35a. That is top-tier and sits outside every lane's figure. Line 282 names only the 40.3M of claude-fable-5-1.
- **Patch.** After "none of those tokens is in any lane's figure." add " Its own subagents spent another 10,498,370 claude-opus-5-5 tokens in the window (`fable-lead-census.md:12`), also in no lane."

### MIN-6. The "exact reader command" may not run verbatim on the target host

- **Evidence.** Lines 164-165 and 172-173 use a bash `\` continuation with a Windows path, for a run "over ssh on ben-desktop". In cmd or PowerShell, the default OpenSSH shells on Windows, the trailing `\` is not a continuation.
- **Why it matters.** S4 asks for a command the 9/29 check can reuse unchanged.
- **Fix.** Put each command on one line, and state the shell it was run in. Separately, `docs/census.md:363`, the new pointer line, sits between the usage block and its description paragraph. Moving it after that paragraph would read better; it does not affect compliance.

## C4 fields (review of a measurement correction)

- **Cause:** The report misses findings on record outside the worktree's closed records (lane 36's hang lives on `origin/build/lane-closeout-1`). It draws a "beat" from an unmeasured spec interval that the records actually carry as `Spec-from:`. And it appended the 4b correction without retiring the wrong-cause text it supersedes.
- **Discriminating check:**
  - `git show origin/build/lane-closeout-1:docs/work/wr-2026-09-28-lane-closeout.record.md | sed -n 36p` shows "committed 2296478 at 22:12Z then hung".
  - Recomputing hours from min(`Spec-from`, `Opened`) gives a median of 74.3 min, above 50.
  - `grep -n "different-path miss\|markdown-only" docs/reports/census-0928/four-read.md` still matches after the correction.
- **Fix location:** `docs/reports/census-0928/four-read.md`. Two ranges belong to the table and S3-S5 sections:
  - lines 21, 88, 95-99, 104-112 and 128;
  - lines 187, 197, 213-217, 224-236, 252-256 and 263-267.

  One range belongs to the verdict: lines 281-310. No other file changes.
- **Simplification:** Keep one cause per finding. Where the Opus verdict corrects a Sonnet finding, rewrite the finding in place rather than appending a contradicting paragraph, so lane 38's owner reads a single cause.
