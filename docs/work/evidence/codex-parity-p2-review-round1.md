VERDICT: NEEDS_FIXES (4) 97541f077b7736185601f49846da090c7da3ff88

# P2 (Codex census reader): independent review

Candidate: 97541f077b7736185601f49846da090c7da3ff88 (tip after cc97f0d; the scope moved here from ce59f903 mid-review)
Base: 7f188b0d0aea4dd5539285aa92b3abab03358d94
Checkout: C:/Users/benzh/orca/workspaces/claude-delegation/astra-codex-p2. I only read it. HEAD = 97541f0 and the tree was clean at review time. At ce59f903 it held uncommitted edits, and those later landed as cc97f0d/97541f0.
Method: `git archive <sha>` into scratch copies outside the repo. I ran the focused gate there, and ran synthetic probe scripts (in scratch) against the exported `runCensus`/`formatText`/`formatJson`/`main` and work-record's `isCensusFile`/`extractCensusSummary`/`extractCensusTimestamp`. I read no private transcripts.

## Gate

- `node scripts/run-tests.mjs scripts/build-census.test.mjs` on the ce59f903 copy: 55/55 pass.
- The same command on the 97541f0 copy: 60/60 pass. The builder's claims check out.

## Blocking findings: the 4 in the verdict count

### 1. HIGH: a marker window with no token records still prints `VERDICT: COUNTED 0` and `leadTokens: 0`, and accept --census takes it

- Where: `scripts/build-census.mjs:319,347,355-358,368-369`. `tokensSupported` is set for the whole file (`tokenRecordCount > 0`), but everything the report prints is scoped to the window.
- Evidence (probe W): a verified session_meta, one token_usage_record before the marker, then the marker and later events with no token record. Output: `VERDICT: COUNTED 0 lead requests (leadTurns unsupported)`, `- leadTokens: 0 (counted from deduplicated per-response usage; model unknown)`, `- nativeTurnCount: 0`, `Turns/hour in window: **0.00**` and an empty window token table. `isCensusFile` returns true, so work-record copies all of those lines into the record as measured values. This is the fixed "unsupported schema becomes COUNTED 0" bug appearing again at window level. It also covers the case where a CLI upgrade or a schema change mid-session leaves the build's responses with no token_usage_record.
- Fix (mechanical):
  - Current, line 319:
    ```js
      let tokenRecordCount = 0;
    ```
    Replacement:
    ```js
      let tokenRecordCount = 0;
      let windowTokenRecordCount = 0;
    ```
  - Current, lines 355-358:
    ```js
        if (windowStarted) {
          windowById.set(`response:${record.response_id}`, entry);
          windowNativeTurns.add(record.turn_id);
        }
    ```
    Replacement:
    ```js
        if (windowStarted) {
          windowTokenRecordCount += 1;
          windowById.set(`response:${record.response_id}`, entry);
          windowNativeTurns.add(record.turn_id);
        }
    ```
  - Current, lines 368-369:
    ```js
        tokensSupported: tokenRecordCount > 0,
        tokenUnsupportedReason: tokenRecordCount > 0 ? null : 'no token_usage_record rows with per-response usage',
    ```
    Replacement:
    ```js
        tokensSupported: windowTokenRecordCount > 0,
        tokenUnsupportedReason: tokenRecordCount === 0
          ? 'no token_usage_record rows with per-response usage'
          : windowTokenRecordCount === 0 ? 'no token_usage_record rows with per-response usage inside the marker window' : null,
    ```
  - Add a test: the codex-lead fixture shape with the marker event as the last line. Assert that the header starts with `VERDICT: UNSUPPORTED` and that the reason includes `inside the marker window`.
- Expected result: probe W prints the UNSUPPORTED header and `isCensusFile` returns false. Without a marker, `windowStarted` is true from the first line, so the two counters stay equal and nothing else changes. The existing `CODEX-WINDOW` test has 1 record in the window and stays supported. All 60 tests still pass.

### 2. MEDIUM: a response_id repeated with a different turn or usage is silently last-wins

- Where: `scripts/build-census.mjs:352-358`.
- Evidence (probe F): `r1/t1` with usage 100/10/5 followed by `r1/t2` with usage 1/1. The report says `COUNTED 1 lead requests`, `leadTokens: 2` and `nativeTurnCount: 2`. The first record's 105 tokens vanish with no signal. The two counts contradict each other: one request, two turns. The builder's probe saw no duplicates (2,090 of 2,090 unique), so any duplicate is unexpected, and a conflicting one means corruption or a replay. It should fail visibly rather than be de-duplicated.
- Fix (mechanical): declare `const responseFingerprints = new Map();` next to `totalNativeTurns` (line 315). Then replace line 353,
  ```js
      totalById.set(`response:${record.response_id}`, entry);
  ```
  with
  ```js
      const key = `response:${record.response_id}`;
      const fingerprint = JSON.stringify([record.turn_id, entry.usage]);
      const seen = responseFingerprints.get(key);
      if (seen !== undefined && seen !== fingerprint) {
        throw new Error('Codex token_usage_record repeats a response_id with conflicting turn or usage');
      }
      responseFingerprints.set(key, fingerprint);
      totalById.set(key, entry);
  ```
  In lines 355-358 use `key` as well. An identical duplicate is still allowed.
- Expected result: probe F throws. The fixture's ids are unique, so its tests don't change.

### 3. MEDIUM: the unsupported path still prints confident zeros in the body and the JSON

- Where: `scripts/build-census.mjs:779,800,801,804,809`, and the `runCensus` return at about lines 700-720.
- Evidence (probe A, verified meta with only an `event_msg token_count`): the header and `leadTokens` correctly say unsupported. But the flat summary line `- nativeTurnCount: 0 (native turn ids; not leadTurns)` is a numeric zero, and `nativeTurnCount` comes only from token records, so it is really unknown. The body also prints `Total assistant turns, deduped (whole file): **0**`, `Window assistant turns, deduped: **0**`, `Native turn ids ...: **0**` and `Turns/hour in window: **0.00**`. `--json` emits `"totalTurns":0, "windowTurns":0, "turnsPerHour":0, "nativeTurnCount":0, "combined":{}` next to `tokensSupported:false`. The UNSUPPORTED header keeps the .md out of work-record, but the report still shows unknown values as numbers.
- Fix:
  - In `runCensus`, when `lead.tokensSupported === false`, emit `windowTurns`, `nativeTurnCountWindow` and `turnsPerHour` as `null`. When the whole file has zero token records (reason is the first one), also emit `totalTurns` and `nativeTurnCount` as `null`. That needs `tokenRecordCount` returned from `censusCodexLeadFile`.
  - In `formatText`, render null as `unsupported`: at 779, 800, 801 and 804 use `${x ?? 'unsupported'}`. Line 809 already prints `n/a` for null.
  - Extend the test at `build-census.test.mjs:142` to assert `!/\*\*0\*\*|: 0 \(|0\.00/.test(text)` and `JSON.parse(formatJson(report)).lead.windowTurns === null`.
- Expected result: probe A shows no numeric zero anywhere. The supported and Claude paths don't change.

### 4. MEDIUM (needs a judgment call): responses with no token_usage_record drop out of "measured" totals unseen

- Where: `scripts/build-census.mjs:346`. Every row that is not a token_usage_record is skipped without any check.
- Evidence (probe M, a resumed or upgraded session): an `event_msg token_count` from an older segment with 50,000 input tokens, then one `token_usage_record`. The report says `COUNTED 1 lead requests`, `leadTokens: 105` and is recognised by work-record. The older segment's usage disappears, and the report claims completeness it cannot back up. Nothing checks that every native turn or response in the stream has a token record.
- Fix (judgment; I'm not drafting code):
  - (a) Mark the census unsupported ("stream mixes cumulative token_count events with per-response records") if any `event_msg` with `payload.type === 'token_count'` appears in the counted window before the first token_usage_record, or at all if the builder's metadata probe shows the current CLI never writes token_count next to token_usage_record.
  - (b) Collect turn ids from turn-level events (for example `turn_context`/task-start events that carry `turn_id`). If any of those turn ids never appears in a token record, report it as `incomplete`, never as a count.
  - Record the discriminating probe result (turn ids seen vs turn ids with token records, counts only) in the builder report or `docs/census.md` so the guard rests on evidence.
- Expected result: probe M reports unsupported or incomplete. The fixture only has token_usage_record rows with no token_count, so it stays supported.

## Non-blocking (LOW)

### 5. LOW: the marker also matches session_meta, where Codex stores the instruction payload

- Where: `scripts/build-census.mjs:333`.
- Evidence (probe H): with the marker text inside `session_meta.payload.instructions`, the window starts at line 1 and a pre-marker response is counted as part of this build (`COUNTED 2`, where the build's own window would be 1). Claude has the same weakness, but in Codex a session-wide prelude record carries the instructions.
- Fix: current
  ```js
      if (marker && !windowStarted && containsMarkerDeep(obj, marker)) {
  ```
  replacement
  ```js
      if (marker && !windowStarted && obj.type !== 'session_meta' && obj.type !== 'turn_context' && containsMarkerDeep(obj, marker)) {
  ```
  The fixture's marker is on an `event_msg`, so its tests don't change.

### 6. LOW: a truncated Codex file made only of `turn_context`/`compacted` rows falls through to Claude and prints COUNTED 0

- Where: `scripts/build-census.mjs:306`.
- Evidence (probe B3): `VERDICT: COUNTED 0 lead requests (leadTurns 0)`.
- Fix: add `|| obj.type === 'turn_context' || obj.type === 'compacted'` to the condition at line 306. The Codex reader then throws `Codex session_meta was not found`.

### 7. LOW: two doc and text inconsistencies

- (a) `VERDICT: UNSUPPORTED ...` is deliberately refused by work-record's `^VERDICT: COUNTED\b` (probe: `isCensusFile` returns false). So the `leadHost`/`leadTokens: unsupported` flat lines never reach the record, and the operator has to fall back to `--no-census "<reason>"`. This fails closed and fits contracts.md ("Use explicit --no-census ... if ... unsupported"). But `docs/census.md` doesn't say it. Add one sentence: an UNSUPPORTED report is refused by `accept --census`; pass its reason line to `--no-census`.
- (b) Line 780's `codexSubagents` text says "combined and role totals exclude them unless explicitly supplied", but `runCensus:588` now rejects `--tasks` for Codex. Change it to "Codex leads reject --tasks; no child, role or combined totals are emitted."

## Verified with no defects found

- Cumulative counters: only `payload.usage` is read (line 352). `turn_token_usage`/`thread_token_usage` are never summed. The fixture test fails if they were (135 vs 1000s).
- Session attribution: every counted row must match `session_id === session_meta.id` and have string `response_id` and `turn_id` (line 349). A second session_meta throws (line 339). A session_meta with `id` but no `session_id` throws in detection (probe C). A token record before the metadata throws (probe B).
- Counter validation: negative and `null` counters are rejected and a missing usage object gets a clean error (probes E, E2, D). This was fixed in cc97f0d.
- Truncated Codex detection: an `event_msg`/`response_item`/`token_usage_record` first line now routes to the Codex reader, which fails visibly (tests and probe B). Malformed JSON in a Codex stream throws (probe T). The Claude reader still skips malformed lines (probe K), so Claude behaviour is unchanged.
- Child usage: a Codex lead rejects `--tasks` and skips the default subagents glob (lines 588, 595). No role or combined table is printed; the report says so instead. Before the fix, a Codex rollout passed as a task was silently counted as `turns 0`. That is fixed.
- nativeTurnCount vs leadTurns: `leadTurns` is `null` and renders `unsupported` in the header, the summary and the body. `nativeTurnCount` has its own label, "not leadTurns", everywhere. Nothing downstream parses `leadTurns` as a number (grep of scripts/ and hooks/).
- Header and census-stale compatibility: a supported Codex report starts `VERDICT: COUNTED `, and `extractCensusSummary` copies `leadHost`, `leadTokens`, `leadTurnsLimit`, `nativeTurnCount`, `codexSubagents`, `by-model` and `by-role` plus both lead tables (probe). `extractCensusTimestamp` finds the Window timestamps, so census-stale keeps working.
- Missing build id: no build id is invented. The window is the existing `--marker` substring, and `main` still throws on a marker that isn't found. The limits are findings 1 and 5.
- Claude path: text output is unchanged. JSON gains only additive keys (`host`, `nativeTurnCount*`, `tokensSupported:true`, `tokenUnsupportedReason:null`), and nothing in the repo consumes build-census JSON. Output stays deterministic: `sortKeysDeep`, code-unit sorts, and no locale or time dependence in the new code.
- Model: `unknown` is used and labelled honestly, never guessed.

## Conflicts with the upstream skills-o census fixes (identification only)

- The P2 delta touches `buildDirSpecs` (new `includeDefaultSubagents` option, around lines 441-443) and the top of `runCensus` (lines 587-595: `--tasks` rejection and the call to `buildDirSpecs`). A directory-access fix in `buildDirSpecs`/`collectTaskFiles` will overlap textually there. Keep both: P2's Codex short-circuit has to run before any directory stat, so a Codex lead never hits the upstream directory-error path.
- A freshness fix that changes which timestamp the census prints, or how work-record reads it, has to keep the Codex `Window:` line. It is the only timestamp source on the Codex path.

## Limits

- I did not check that Codex 0.155.1 `input_tokens` includes `cached_input_tokens` and `cache_write_input_tokens`, which the split at lines 280-286 assumes. It also isn't known whether `output_tokens` includes reasoning tokens. If `usage.total_tokens` exists, checking `input + output === total_tokens` per record would settle the first point cheaply. Recording that probe's result is recommended.
- I read no private transcripts. All conclusions come from code, synthetic probes and the committed fixture. I did not run the full suite.

Cause: The Codex reader decides "supported" for the whole file, and silently accepts any row set it can see. So a window, a response or a segment with missing or conflicting token records still comes out as a counted number.
Discriminating check: Probes W (marker after the last record: COUNTED 0), F (conflicting duplicate response_id: silent last-wins), M (mixed token_count/token_usage_record: partial total shown as complete) and A (unsupported path: body/JSON zeros), run against 97541f0 exports in scratch.
Fix location: scripts/build-census.mjs `censusCodexLeadFile` (lines 311-371), `runCensus` return (about lines 700-720), `formatText` (lines 779-809), plus the test file.
Simplification: One per-window `windowTokenRecordCount` and one response fingerprint map replace ad hoc support checks. A null-to-`unsupported` rendering rule covers every unknown count in both the text and the JSON.
