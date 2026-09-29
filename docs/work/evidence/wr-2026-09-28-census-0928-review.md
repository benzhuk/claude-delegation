VERDICT: APPROVE 5603609

# Lane 50 (census-0928) delta review r2

Scope: `git diff 8e94a2a..5603609`, checked against review-r1.md. No pull was needed, because 5603609 was already in the worktree, one commit below HEAD e6cdc49. This was a read-only review; the only file written is this report.

All 14 r1 findings are fixed, and no number was invented. The verdict still agrees with itself. Three non-blocking nits are listed at the end: two were introduced by the fix round, and one is an r1 miss.

## Per-finding verification

- **MAJ-1: fixed.**
  - Stall item 1 now confirms the hang at `origin/build/lane-closeout-1:docs/work/wr-2026-09-28-lane-closeout.record.md:36`, and finding 7 reads "read; nothing missing".
  - The verdict's stall list has the lane 36 bullet. Its times check out: 22:12Z is 6:12 PM NY, 00:03Z is 8:03 PM NY, and the gap between them is 111 minutes.
- **MAJ-2: fixed.** The call now reads "beat on the reader's clock, cannot compare on the baseline's". The 74-minute Spec-from median matches my recomputation (74.3). The caveats about the shared 19:03:14Z Spec-from and the three records whose Spec-from falls after Opened are present.
- **MAJ-3: fixed.** The per-turn cost is now stated as an average (213 requests, about 189k each), and the saving is marked as not yet read. Both guards are named: hours, and work lost or stalled, with notes unread over 30 min and a `GOALS.md:18` citation. There is also a precondition to split tokens by wake turn.
- **MED-1: fixed.** The baseline row quotes `GOALS.md:15`, `:16`, `:17` and `:18` with their numbers. The lead-turns cell is unchanged.
- **MED-2: fixed.** Lanes 32, 33, 34 and 38 are relabelled "top-tier … lead window plus subagents, reviewer included". Finding 2 is restated.
- **MED-3: fixed**, apart from the optional strike. Table cells 42-47 now read "markdown `--census` miss (4b)". Finding 4 carries the right cause and "Missing". Finding 5 points to 4b. A grep finds no remaining "different-path miss" or "markdown-only" text. The original 4b paragraph still stands, directly followed by the correction, which r1 allowed.
- **MED-4: fixed.** The ASK bullet is qualified as dispatch asks, not stalls.
- **MED-5: fixed.**
  - Median without lanes 32 and 33: 11.9M, which checks (11,940,121).
  - Fable share per lane: 4.5M, which checks (40.27M / 9 = 4.47M).
  - "38 percent": checks (4.47 / 11.62 = 38.5%).
- **MIN-1: fixed.** The closing times read "00:08, 06:31 and 00:24 NY on 9/28".
- **MIN-2: fixed.** The accept is at 23:47:24Z, which is 7:47 PM NY.
- **MIN-3: fixed.** Both S5 bullets carry the pointer to "DONE, part by part".
- **MIN-4: fixed.** The 46/47 overlap now covers lead tokens, subagent tokens and lead turns.
- **MIN-5: fixed.** The Fable subagents' 10,498,370 Opus tokens are added, matching `fable-lead-census.md:12`.
- **MIN-6: fixed**, with nit N-1. Both commands are single lines, and the census.md line was moved (see nit N-2).

## Numbers and consistency checks

- **New numbers.** Every new figure traces to a source line or to my r1 recomputation: 74 min, 111 min, 8:03 PM, 7:47 PM, 11.9M, 4.5M, 38 percent, 189k, 213 requests and 10,498,370. Existing table figures are unchanged; only labels changed.
- **DONE lines.** The S5 bullets point to the verdict. The verdict's DONE lines are unchanged and still agree with the four-measure calls: Codex "partly", nothing-lost "partly".
- **Change-next.** It names its measure (top-tier tokens through the Fable share) and two guards, and it no longer conflicts with GOALS.md:11.
- **Scope against f7df941.** `git diff --stat f7df941..5603609` shows four files:
  - `docs/census.md`: +2, one text line plus one blank;
  - `docs/reports/census-0928/fable-lead-census.md`;
  - `docs/reports/census-0928/four-read.md`;
  - the lane's own record, which the Authority line allows.

  No script, GOALS.md or other record changed. `fable-lead-census.md` is untouched in this round.

## Non-blocking nits

These are safe to apply at merge or to leave. None changes a number or a call.

### N-1 (Minor): the shell is asserted, not read

- **Evidence.** `four-read.md` S4 says the command was "run over ssh on ben-desktop, in cmd.exe, the default OpenSSH shell on Windows". The fixer's account (fix-r1.md, MIN-6) says the shell was taken from r1's wording, not from how the lead actually ran it. That is an assertion without a source, in a report that promises none.
- **Why it is harmless.** The one-line form, with a double-quoted path and no continuation, runs the same way in cmd.exe and PowerShell.
- **Patch.** In both places:
  - replace ", in cmd.exe, the default OpenSSH shell on\nWindows," with "; the one-line form runs as is in cmd.exe or PowerShell,";
  - replace "ben-desktop, in cmd.exe, with only" with "ben-desktop (cmd.exe or PowerShell), with only".

### N-2 (Minor, regression): the moved census.md line now splits a colon lead-in from its list

- **Evidence.** `docs/census.md:367` now sits between "Definitions, verbatim from `docs/specs/2026-09-25-four-number-read.md`:" and the numbered definitions that the colon introduces. r1's "after that paragraph" was ambiguous, and this is the result.
- **Patch.** Move the line and its blank line to just after the end of the numbered definitions list, or back to its original spot above "Prints the goal's four measures". Either way, `docs/census.md` stays at +2 against f7df941.

### N-3 (Minor): the verdict's DONE nothing-lost line omits lane 36

- **Evidence.** The line reads "The day as a whole does not: lane 32's 413-minute silence, the readback exit 5s, …", but the stall list above it now includes lane 36. r1 did not ask for this change.
- **Patch.** Replace "lane 32's 413-minute silence, the readback exit 5s," with "lane 32's 413-minute silence, lane 36's 111-minute builder hang, the readback exit 5s,".
