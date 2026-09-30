VERDICT: VERIFIED

# Independent census diagnosis review

Reviewed: 2026-09-29 22:56:02 America/New_York

The surprising claim in `census-diagnosis.md` is correct on the project's current Node v24.18.0 runtime: `node:readline` splits decoded input at literal U+2028 and U+2029 characters. Those characters are legal inside a JSON string. The split occurs before `JSON.parse`, so the census receives fragments rather than the writer's LF-framed JSON row.

## Synthetic result

The synthetic fixture contains five LF-delimited JSON objects. Its third object has one literal U+2028 and one literal U+2029 inside a string. Every LF-delimited row parses successfully with `JSON.parse`.

Exact successful output:

```json
{"node":"v24.18.0","fileBytes":793,"literalU2028Count":1,"literalU2029Count":1,"newline":{"frameCount":5,"validCount":5,"invalidCount":0,"byteLengths":[132,96,143,304,113]},"readline":{"frameCount":7,"validCount":4,"invalidCount":3,"byteLengths":[132,96,123,6,8,304,113]},"framesIdentical":false,"parser":{"threw":false,"damaged":"malformed JSON row","tokenRecordCount":0,"windowTokenRecordCount":0,"sessionId":"synthetic-session","finalRowCompletesTurn":false,"finalEvent":null,"coverageSupported":false}}
```

The two Unicode separators turn one valid 143-byte JSON row into three `readline` frames of 123, 6 and 8 bytes. All three fragments are invalid JSON. The following 304-byte token record remains a valid frame, but the production parser never reaches it because it breaks on the first malformed fragment.

Fixture and raw result:

- `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/census-readline-review/literal-separators.jsonl`
- `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/census-readline-review/synthetic-output.json`
- `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/census-readline-review/synthetic.mjs`

No real transcript row or content was printed or copied.

## Source cause

- `scripts/build-census.mjs:63` imports `node:readline`.
- `scripts/build-census.mjs:294-296` passes a UTF-8 `createReadStream` directly to `readline.createInterface`. There is no intervening row preprocessing.
- `scripts/build-census.mjs:826-829` parses each `readline` frame and sets `damaged = 'malformed JSON row'`, then breaks on the first parse failure.
- The exported public API `censusCodexLeadFile` was run against the synthetic fixture. It returned the same damaged reason, counted zero token records after the separator row, and reported unsupported coverage.

The cause is therefore the `readline` framing behavior, not UTF-8 decoding, stored JSON corruption, application preprocessing, or a diagnostic-scanner mistake.

The three diagnostic scanners are internally consistent with this result:

- `diag-scan.mjs` frames bytes only on LF (`0x0a`) and tests the stored writer framing.
- `diag-sep.mjs` splits only on `\n`, confirms those rows parse, and counts literal U+2028/U+2029 characters.
- `diag-rl.mjs` uses the same `readline.createInterface` shape as production and observes the additional invalid fragments.

## Pre-window child witness

The separate `01a0eb03` finding also follows directly from the current source:

- `scripts/build-census.mjs:831` resets `finalRowCompletesTurn` for every parsed row; `:891-895` sets it only when that row is `task_complete`.
- `scripts/build-census.mjs:1446-1459` retains the child's first timestamp, whether any row is after `--to`, the latest row and whether that latest row completes the last started turn.
- `scripts/build-census.mjs:1547` skips only a child whose first row is after `--to` and has zero in-window responses.
- `scripts/build-census.mjs:1552` otherwise requires a row after `--to` or requires the final row itself to be the matching `task_complete`.

A child wholly before `--from`, with zero window responses and a benign row after its matching `task_complete`, fails that condition: it is not skipped by `:1547`, has no row after `--to`, and its final row is no longer a terminal witness. The diagnosis correctly identifies this as a distinct rule limitation. The source does not ask whether the child ended before `--from`.

This review does not establish that a reader fix alone makes a fresh census COUNTED. It verifies the reader cause and the pre-window witness logic only. No census fix, rerun, source edit, full suite, live-log mutation, lock, SSH operation or guard/configuration read was performed.
