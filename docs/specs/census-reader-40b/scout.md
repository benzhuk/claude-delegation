VERDICT: SCOUTED
Base 59ad1b4 (main 960c7df + lane-open doc). Read-only; no suites run, no transcripts/config/inbox read. Knowledge topics node-js/codex not opened beyond testing.md grep (no applicable constraint found).

## Premise 1 (readline splits U+2028/2029): HOLDS on current main
- scripts/build-census.mjs:63 import readline; :294-297 `openLines(fsImpl, filePath)` = `readline.createInterface({input: fsImpl.createReadStream(path,{encoding:'utf8'}), crlfDelay: Infinity})`. Only readline use in the file.
- openLines callers, all `for await (const line of rl)`: :354 censusLeadFile (Claude lead), :748 detectLeadHost, :789 censusCodexLeadFile (parse+`damaged='malformed JSON row'` at :826-829), :985 censusSubFile. All reached via runCensus(:1641)/runCodexCensus(:1386)/main(:2173).
- scripts/four-read.mjs does NOT import build-census or readline and reads no JSONL through a stream: it consumes census JSON, and its log-ish reads (scanTimestamps :186-192, :226-228, :400-404) are readFileSync + `split(/\r?\n/)` (LF-correct, whole-file, pre-existing). No change needed; do not touch.
- Other readline JSONL reader: scripts/token-census.mjs:24 import, :273-276 `openLines` (identical shape), for-await at :293 and :383. One-line swap IF the shared splitter has the same (fsImpl, path) -> async iterable shape. scripts/test-home.test.mjs:7,73 readline is child stdout, not JSONL log: ignore. No readline under skills/ found (search covered scripts/ only for U+2028; skills/ not grepped for readline: verify in build).
- No existing LF-only splitter/shared line utility exists (grep for u2028, createInterface: none besides above).

## Suggested contract (lead to pin)
New file scripts/jsonl-lines.mjs: `export async function* lfLines(stream)` — StringDecoder-safe: accept a utf8-encoded Readable (chunks already strings), buffer remainder, split on '\n' only, strip ONE trailing '\r', yield blank rows unchanged (consumer keeps its existing `if(!line.trim()) continue`), yield final unterminated row, propagate stream errors (for-await rethrows). Then openLines in both files becomes `return lfLines(fsImpl.createReadStream(p,{encoding:'utf8'}))` (keeps fsImpl seam used by tests build-census.test.mjs:538-577). Callers only use for-await so an async generator is drop-in; verify no `rl.close()`/event use (none seen in grep of :354/:748/:789/:985 heads).

## Premise 2 (pre-window child witness): HOLDS
- Completion only recognized as `event_msg.payload.type==='task_complete'` with usable turn_id (:891-895), setting finalEvent and `finalRowCompletesTurn=true`; :831 resets it every parsed row, so any later row erases the witness.
- Child rule :1544-1552 (windowed) and :1557-1560 (open): child skipped only if firstAt > --to and windowResponses===0 (:1547); else needs hasRowAfterTo or (finalRowCompletesTurn && finalEvent.turnId===lastStartedTurn). No "ended before --from" branch. lastStartedTurn is set at :888 (latest task_started by timestamp, >= compare); child state merged :1446-1458.
- Unrelated per-child gate :1549-1551 (damaged, timestampConflict, tokenRecordCount===0) — a pre-window child with tokenRecordCount 0 still adds a reason; spec says pre-window completed child must be excluded, so the builder must place the exclusion before these three (ambiguity: dispatch names only the witness finding).

## Terminal payload shapes (exact, from source/fixtures)
- `{type:'event_msg', timestamp, payload:{type:'task_complete', turn_id}}` — used in build-census.test.mjs:120, codex.contract.test.mjs:222,386,393,413,442-446,473,587,605 (helper `line('event_msg',{...},ts)`).
- Also accepted bare `{type:'task_complete', turn_id}` (:889 `obj.type==='event_msg'?obj.payload:obj`).
- item_completed shapes existing in repo: only UserMessage `{item:{type,content:[{type:'text',text}]}, turn_id}` and HookPrompt `{item:{type,fragments}}` (fixtures codex-lead.jsonl:8,16,23; completeness.test.mjs:222,245). NONE carries a task completion. Schema evidence (docs/work/evidence/codex-parity-usage-schema.md:10; codex-counted-55/scout-completeness.md:8) lists item_completed only as a count. AMBIGUOUS: no source/fixture pins an "item_completed carrying task completion" shape; lead must pin from the author's stated shape or restrict to task_complete + task's turn_id; builder must not invent one. Fixture 01a0eb03 (prior-diagnosis) is a plain task_complete at row 174 then trailing benign item_completed — that is the real case: witness not final row.

## Territories
- Source (mid tier): scripts/build-census.mjs (openLines :294, temporal rule :1544-1560, parse loop :826-895), scripts/jsonl-lines.mjs (new), optional one-line scripts/token-census.mjs:273.
- Tests (independent): new scripts/jsonl-lines.test.mjs; scripts/build-census.codex.contract.test.mjs (Codex temporal cases; reuse helpers meta/taskStarted/context/usage/line/writeRollout, DAY/ROOT consts); scripts/build-census.test.mjs (fsImpl seam :538-577; Claude lead path); optional token-census.test.mjs. Synthetic fixtures: build under tmp via writeRollout (no committed private copies); existing scripts/build-census.fixtures/** may be reused read-only.
- four-read.test.mjs/four-read.completeness.test.mjs: no edit expected.

## Test command / mutex
Node built-in runner: `node --test scripts/<file>.test.mjs` (focused). Full suite one per host, sealed, with established nonblocking lock (per spec); knowledge testing.md warns NODE_TEST_CONTEXT leak makes nested `node --test` silently exit 0 — scrub it in any spawned runner. Exact lock path not found in scripts/ (no *lock* file); use the lane's established mechanism.

## Risks
- Chunk-boundary CR: a '\r' at end of chunk before '\n' in next chunk must still be stripped (strip after joining, not per chunk).
- Encoding: pass `{encoding:'utf8'}` so the stream's internal decoder handles multibyte splits; test with a 3-byte char (U+2028 is E2 80 A8) split across highWaterMark boundaries.
- Unterminated final line with trailing '\r' only: strip one CR (spec) — confirm consistent with readline's old behavior for blank-row semantics.
