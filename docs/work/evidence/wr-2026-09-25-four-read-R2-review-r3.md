VERDICT: APPROVE bb121c06da00c11eb307bfba390345ea747d9c41

# R2 review, round 3 (delta): the record knows its sessions

I ran `git rev-parse HEAD` in C:/Users/benzh/Code/four-read/wt-r2 myself and got `bb121c06da00c11eb307bfba390345ea747d9c41`.
- **Range reviewed:** a355593..HEAD, one commit (bb121c0).
- **Files changed:** docs/GOALS.md, scripts/work-record.mjs, scripts/work-record.test.mjs.
- **Tree state:** clean before and after my checks. Every probe ran on scratch copies outside the tree.

JUDGMENT: every round-2 finding is fixed. I confirmed each fix by measurement, not by reading the builder's report. There are no blockers and no majors. The two minors below are optional hardening and do not block acceptance.

## Gate and measurements (run by me)
- **Territory gate:** `node --test scripts/work-record.test.mjs` gives tests 138, pass 138, fail 0.
- **Full suite:** `node scripts/run-tests.mjs` gives tests 1581, pass 1581, fail 0, exit 0.
- **Line budget** (`git diff --numstat 931588a HEAD`):
  - work-record.mjs: +103/-11, net +92, 1164 lines.
  - build-census.mjs (wt-r1 HEAD 529853d): +43/-19, net +24.
  - **Combined: +116, inside the +150 budget.**
- **four-read.mjs** (wt-r1): **397 lines, under 400.**

## Prior findings, verified
- **M-A: FIXED.** I copied scripts/, docs/ and skills/multi/scripts to scratch, swapped in each version of GOALS.md, and ran the STALE doesNotMatch test.
  - HEAD text: pass.
  - c5ca7be text (B2's false 32 attribution): FAIL, caught by `/7-turn hand count…script counts? 32/`.
  - The spec's own sentence appended ("lead turns for the loop-gates build is 32 by the script"): FAIL, caught by `/loop-gates build… 32/`.
  - "The script counts 32 lead turns for the loop-gates build." appended: FAIL, caught by `/\b32\b…loop-gates/`.
  - "Loop-gates' script count is 32 lead turns." appended: FAIL.
  - Base 931588a text: FAIL, caught by the 0.20.7 pattern.
  - The mutation probe at work-record.test.mjs:2125-2130 pins both strings.
- **M-B: FIXED** (work-record.mjs:73-77). I extracted `isSessionId` and ran it on scratch.
  - These values refuse: `undefined`, `(none)`, `[none]`, `missing`, `not-set`, `<lead-session-id>`, `null`, `none`, `unavailable`, `TBD`, `------`, `${LEAD}`, `$LEAD_SESSION`, `'undefined'`, ` undefined `, `N/A-1`.
  - These values pass: Claude and Codex UUIDs, and `fixture-lead-session-1`.
  - The new test at work-record.test.mjs:1852-1862 pins four of the refused values.
  - Only contrived values such as `000000` and `undefined1` still pass. Nothing realistically produces them.
- **m-A: FIXED** (work-record.mjs:449, 455).
  - `FOUR_READ_KEYS` matches wt-r1 four-read.mjs:300-303 in order.
  - All four real R1 `*.four-read.json` files still give exactly four `Four numbers:` lines, and the `unavailable (...)` values are copied unchanged.
  - The three census and inventory JSONs refuse with `four-read-invalid`.
  - Duplicate-key rows and blank-label rows refuse, and the record stays byte-identical (test :2011-2031).
- **m-B: FIXED** (work-record.mjs:969).
  - The ISO regex accepts `…Z`, `….717Z` and `…-04:00`.
  - `0`, `1`, `Sep 25`, the bare date `2026-09-21` and `2026-09-21T08:00:00` (no zone) all WARN.
  - The new test is at :1914-1922.
- **m-C: FIXED** (GOALS.md:101). The sentence now has a verb and names the right clause.
  - The builder changed my wording from "is not met" to "does not hold". This was needed: STALE pattern 1 (`\b(?:MET|true|holds)\b`) matches "met" even inside "not met".
  - I confirmed the rewording keeps the test green. The phrase "does not hold" now appears twice in the sentence. That is redundant but not wrong.

## Verified absences (first-class findings)
- **No override on `lead-session-missing`.** It is unconditional at work-record.mjs:805-810, on both the live and pinned paths. No flag or env var bypasses it.
- **No record is written on refusal.** `fourReadLines` throws at :1099 before the write, and a test pins this.
- **No regression elsewhere.** The full suite is green, and the diff touches only the owned files.

## MINORS (optional, non-blocking)

### m-D. Two rewordings of the loop-gates 32 claim still pass the STALE test
- **What slips:** measured on scratch, each appended to GOALS.md and still passing:
  - "For loop-gates, the script measured 32 lead turns."
  - "Loop-gates: 32 lead turns (script)."
- **Why:** each STALE pattern needs a specific connecting word ("script count", "build is"), and neither sentence uses one.
- **Fix:** add one pattern that looks for loop-gates and 32 in the same sentence, skipping the citation path. In work-record.test.mjs, after
  ```js
    /7-turn hand count[^\n]{0,160}script counts? 32/i,
  ```
  add
  ```js
    /loop-gates(?!\.record)[^.\n]{0,80}\b32\b/i,
  ```
- **Predicted outcome:**
  - It does not fire on GOALS.md:56 today. In "Loop-gates' 7 lead turns…", the match window stops at the `.` in `loop-gates.record.md`, and the lookahead excludes that path.
  - It fires on both slipping sentences.
- **Budget:** 0, since the change is in the test file only.

### m-E. The DONE-status STALE pattern does not catch "census clause: MET"
- **What slips:** appending "Status of DONE's census clause: MET." still passes. The positive assert at :2100 still finds the older "not computable" sentence, and `/census beats the hand-run build…MET/` needs different wording.
- **Fix:** add `/census clause[^.\n]{0,20}\b(?:MET|yes|true)\b/i` to STALE.
- **Predicted outcome:** today's "census clause: not computable until…" contains none of MET, yes or true, so the test stays green. The appended "census clause: MET." fails.

### Nit (no action needed)
- The error message at work-record.mjs:458 still says "{ label, value }" and does not mention the `key` that is now required.
- The Spec-from regex does not range-check its digits: `2026-13-45T99:99Z` passes. It is only a WARN, so this does not matter today.

## For the lead (not an R2 defect; R1 territory)
- **A possible twin of the failure class in R1's own evidence.** wt-r1/docs/work/evidence/wr-2026-09-24-loop-gates.four-read.json says:
  - Hours: "gap unavailable (fewer than 2 lead messages in window)".
  - Work lost or stalled: "0 gaps over 30min".
- **Why it matters:** with fewer than 2 lead messages, the gap count is unknown, not 0. Number 4 should read "gaps unavailable (...)", the same way the t1 and codex-parity rows do.
- **Where to look:** R1's number-four branch in four-read.mjs.
- **One more oddity:** "0.0h" for ask-to-accepted in the same file is worth a look.
- **Carried from earlier rounds:** there is still no `open` subcommand, and docs/work-record.md's field table does not list the three new fields.

## C4 fields
Cause: in round 2, STALE pattern 4 stopped at the `.` inside `loop-gates.record.md` and never reached the 32 claim, and the placeholder deny-list missed `undefined`. Both are now fixed: the new patterns catch the claim, and a required digit plus a wider deny-list rejects the placeholder.
Discriminating check: on a scratch copy, `git show c5ca7be:docs/GOALS.md` fails the STALE test at HEAD (pattern `/7-turn hand count…script counts? 32/`), and `isSessionId("undefined")` returns false.
Fix location: scripts/work-record.test.mjs:2079-2081 and :2125-2130; scripts/work-record.mjs:73-77, :449-455 and :969; docs/GOALS.md:101.
Simplification: requiring a digit replaces the growing deny-list, and pinning R1's four keys replaces shape heuristics with the actual contract.
