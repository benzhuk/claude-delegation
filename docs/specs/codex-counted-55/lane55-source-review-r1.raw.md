NEEDS_FIXES 60ece10

Reviewer: Claude Opus 5.5 (claude-opus-5-5), agent lane55-review. Worktree: C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/9c61c35a-82dd-4aef-8eca-c99bb0e72e31/scratchpad/wt-review-55 (detached 60ece109bc24eb03bc17c242472e9c105b063ca4). Written 2026-09-29 03:28 America/New_York.

## Findings

### MAJOR 1: a verified relevant child that cannot be read is silently excluded, and the census still prints COUNTED
scripts/build-census.mjs:1465-1468 (catch in the runCodexCensus child loop) and :1503-1543 (temporalReasons).
discovery.scope.complete is computed inside discoverCodexChildren before any child is read. When a verified child then throws in censusCodexLeadFile, the catch pushes it to discovery.unreadableFiles and excluded. Examples are a corrupt usage row (negative or string input/output) or a usage row with the wrong session_id. Nothing feeds temporalReasons, and the old gate (coverageSupported = unavailable.length === 0) is gone. So line 1 is COUNTED, coverageSupported is true, and combined silently drops that child's tokens. This is the brief's "corrupt one usage row" mutant, and it fails by silent skip. It also breaks final-spec: an unreadable relevant candidate must prevent complete descendant coverage.
Reproduction (synthetic home, --lead-session root-session, one depth-1 child):
- child output_tokens -4: `VERDICT: COUNTED 1 Codex responses (leadTurns 1); UNSUPPORTED stallNudges, stalls, 0 subagent files`, coverageSupported true
- child input_tokens "x": same COUNTED, coverageSupported true
- child usage session_id "other": same COUNTED, coverageSupported true
Patch. Verified in a scratch copy: all three mutants become PARTIAL, the focused gate stays 498/498, and lane 52 real data is unaffected because it has no unusable child.
```diff
--- a/scripts/build-census.mjs
+++ b/scripts/build-census.mjs
@@ -1423,1 +1423,2 @@
   const childTemporal = new Map();
+  const unusableChildren = [];
@@ -1466,1 +1467,2 @@
       discovery.unreadableFiles.push(candidate.file);
+      unusableChildren.push(candidate.file);
@@ -1543,1 +1545,2 @@
+  if (unusableChildren.length) temporalReasons.push(`verified child could not be read: ${unusableChildren.join(", ")}`);
   const temporalComplete = temporalReasons.length === 0;
```
Add a red test: a depth-1 child with output_tokens -1 must give PARTIAL and coverageSupported false.

### MINOR 2: a verified child with zero usage rows no longer gates anything
scripts/build-census.mjs:1470 still pushes "unusable child coverage ... no token_usage_record rows" to unavailable, but unavailable no longer gates COUNTED or coverageSupported. A child with task_started and task_complete and no usage rows yields COUNTED, coverageSupported true, and contributes 0 tokens. The spec says missing evidence is never a default zero. Suggested fix: push that case, and child invalidResponseTimestamps when no window is given, into temporalReasons, or mark the token fields UNSUPPORTED.

### MINOR 3: the lead end-bound witness uses insertion order, not chronology, after segment union
scripts/build-census.mjs:1508 takes lead.startedTurns.at(-1). After union, the array holds the explicit lead first and other segments after. When --lead names a later segment, "last started" can come from an earlier segment. I only saw it fail safe (PARTIAL), but it is order-dependent. Suggested fix: record lastStartedTurn per segment and take it from the same segment that supplies finalEvent.

### MINOR 4: segment union also changes the legacy Codex --lead path
The build-census.test.mjs "timeline trust" edit flips same-id files from conflicting (coverage false) to unioned segments in no-id mode too. This is Codex-only, which root authorized, and not a Claude change. docs/census.md should state that it applies without --lead-session as well.

### NIT 5: explicit --lead with a wrong --lead-session refuses with a generic message
The error is "Codex session_meta is malformed or does not identify exactly one session". It refuses correctly. A message naming the expected and found ids would be clearer.

### NIT 6: a replayed response with a different timestamp across segments makes the whole census PARTIAL
This is the designed conflict rule. It is fine if real resumed Codex rollouts keep original timestamps. I could not check this on real data because lead 01a0df4c has only one segment on this machine.

### skills-a disclosures
- **Overwritten failed focused log:** acceptable. It is disclosed, the reconstructed summary is labelled as reconstructed, and base red and final green raw receipts remain. Process NIT: write receipts to unique paths.
- **Rejected fs-import rename for the EOL-sensitive test:** correct call. The diff contains no fs import rename, and the containment assertion passes unedited.

## Scope (brief item 1)
- git diff c0818c9..60ece10 --stat shows 92 files. Production code: scripts/build-census.mjs only. Tests: build-census.codex.contract.test.mjs and build-census.test.mjs, with Codex-only edits; Claude assertions and the parseArgs test are untouched. Docs: census.md, codex-rows.md, codex-evidence/, one pointer line in four-read.md, the specs folder and one work record.
- scripts/work-record.mjs, four-read.mjs, review-run.mjs and hooks/ have an empty diff.
- The five existing census files are unchanged.
- Claude --lead path: only the parseArgs missing-argument message text changed, and runCensus adds a guard that fires only when lead is absent. No Claude behaviour change.

## What I ran (raw)
- Focused gate at 60ece10: tests 498, pass 498, fail 0, skipped 0, todo 0, exit 0.
- Focused gate with the MAJOR-1 patch in a scratch copy: 498/498.
- Acceptance gate (item 2):
  - open lead, no --to: `VERDICT: PARTIAL Codex census (open or unbounded lead has no end-bound witness)`
  - open lead, --to after its end: PARTIAL (lead has no end-bound witness for the requested window)
  - truncated usage row mid-lead: PARTIAL (lead malformed JSON row)
  - complete lead lacking cache_write_input_tokens, no token_count proof: `VERDICT: COUNTED 1 Codex responses (leadTurns 1); UNSUPPORTED cacheWriteTokens, stallNudges, stalls, ...`. Unedited work-record isCensusFile returns true on it.
- Segment mutants (synthetic):
  - three same-id segments, r1 replayed at identical timestamp: COUNTED 3 responses, 3 identity paths, r1 counted once
  - one segment dropped: count changes to 2
  - overlapping r1 with conflicting usage: throws "Codex response_id conflict across segments for r1"
  - window 12:05-12:15: 1 response, output 7
- Identity (item 4):
  - Real home C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f22a4cc4-fb5a-4af5-aeec-4951188a536a/home holds 186 logs, not 183. ~/.codex/sessions holds 37.
  - For 01a0df4c: 1 file matches by payload.id, 1 by filename.
  - Wrong id without --lead: "--lead-session identity was not found: not-this". No horizon fallback.
  - Synthetic codex exec root: excluded as "unrelated", counts unaffected. Real data: 1 exec-sourced root exists; the census excluded 134 unrelated files plus 1 duplicate lead/path.
  - A real same-id second segment could not be checked because this lead has one segment. Synthetic only.
- Corrupted usage row mutant: a corrupt lead row throws, which is acceptable. A corrupt child row is silently skipped (MAJOR 1).
- Renamed payload.id mutant: no match, clear error.
- Lane 52 rerun at 60ece10 into scratch: exit 0, line 1 `VERDICT: COUNTED 99 Codex responses (leadTurns 1); UNSUPPORTED stalls, 51 subagent files`. combined, windowTurns and fileCount are identical to the committed L52/build-census.raw.json.
- four-read (item 5) on that JSON: exit 0. The top-tier tokens cell is 11306438 (gpt-6-astra). Companions show cache-read 11033984, cache-write 0, input 230860, output 41594, matching the committed L52/four-read.raw.md. Marker text "wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0" prints in the lane-38 shape. The remaining differences come only from my omitted --lead-slug and the worktree git range.

## Hand recount, lane 52
Independent script over the raw logs, window 2026-09-29T01:39:00Z..02:19:01Z. Graph by parent_thread_id from 01a0df4c, depth up to 3: 52 files (lead plus 51 children). Dedup by session id and response id: 0 duplicates.

| model | responses | input (native, incl. cache) | cached input | output | reasoning | cache write | derived = input+output | census |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| gpt-6-astra (lead) | 99 | 11,264,844 | 11,033,984 | 41,594 | 11,027 | 0 | 11,306,438 | exact match |
| gpt-5.6-terra (children) | 219 | 21,510,743 | 20,846,848 | 112,631 | 28,669 | 0 | 21,623,374 | exact match |

Lead native turns in window: 1 (census 1). Derived equals native total_tokens, so reasoning is not re-added. Cache write is 0 because the native field is present with value 0 on every row, so COUNTED is justified.

## Limitations
- Only lane 52 was recounted by hand; the other four lanes were not rerun.
- No real multi-segment lead exists on this machine for the reviewed ids.
- Scratch copy p55/ and probe scripts remain in the scratchpad; worktree left for the lead to remove.
