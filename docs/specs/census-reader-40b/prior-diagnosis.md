VERDICT: DIAGNOSED (the "malformed JSON row" findings are a reader limitation, not stored-data corruption; the missing end witness for 01a0eb03 is a separate, different cause; the PARTIAL stays truthful for the census as run)

Actual clock: 2026-09-29 22:52 EDT (America/New_York) = 2026-09-30T02:52Z. Read-only. No log, source, record or evidence-JSON change; no CLI rerun, test, commit, push, peer message, SSH or guard probe. No refusal occurred. No malformed row, message text, tool argument or secret was printed; only counts, line numbers, byte lengths and hash prefixes. Scratch scanners (`diag-*.mjs`) live in the session scratch directory, not the repo, and are diagnostic only (they are not the acceptance census).

## Cause (verified)
`scripts/build-census.mjs:295-296` reads with `readline.createInterface({ input: createReadStream(path, {encoding:'utf8'}), crlfDelay: Infinity })`; `:829` does `try { JSON.parse(line) } catch { damaged = 'malformed JSON row'; break; }`. Node's readline (v24.18.0 here) also splits lines on U+2028 and U+2029. Those are legal, unescaped characters inside a JSON string, so one valid row containing one is cut into two fragments, neither valid JSON. The parser stops at the first fragment, and every later row is never read.

Evidence, per file. "Newline scan" splits on `\n` only (how the writer frames rows); "readline scan" mimics the parser.

| File | Size B | mtime (UTC) | sha256 (first 16) | `\n` rows | Newline scan: bad rows | Readline scan: bad / rows | First readline-bad line (bytes, hash16) | Rows containing U+2028/2029 (first line) |
|---|---|---|---|---|---|---|---|---|
| lead 01a0df4c… | 64,731,630 | 2026-09-30T02:51:39Z (live, still growing) | eafe790a6b90fad6 | 25,113 | **0** | 24 / 25,142 | 22044 (11,457 B, af0a077ee8ec03ed) | 7 (22044) |
| child 01a0ef45… | 12,602,414 | 2026-09-29T22:25:35Z | a32e9801a6336b32 | 3,248 | **0** | 6 / 3,252 | 1363 (15,831 B, 10637722f2967d29) | 2 (1363) |
| child 01a0ef88… | 450,035 | 2026-09-29T23:38:32Z | 23a7f7206dcd429c | 51 | **0** | 6 / 55 | 27 (16,707 B, 8f7cf6a69b319aeb) | 2 (27) |
| child 01a0f017… | 720,578 | 2026-09-30T02:14:00Z | ad71abec75f74a90 | 66 | **0** | 10 / 74 | 25 (6,449 B, c722cc8a058bf0dd) | 2 (25) |
| child 01a0eb03… | 5,258,013 | 2026-09-29T02:34:42Z | 73e68ee01bfa99f0 | 175 | 0 | 0 / 175 | none | none |

(Line numbers differ by the fragment count: the readline first-bad line equals the first `\n` row that carries a separator, in all four files: 22044, 1363, 27, 25.) Every `\n`-delimited row in all five files is valid JSON. No file has a `\r`. Separator counts: lead 13 U+2028 + 4 U+2029; 01a0ef45 4 U+2028; 01a0ef88 4 U+2028; 01a0f017 4 U+2028 + 4 U+2029.

Lead effect on the census: last row read before the stop is line 22043, `token_usage_record` at `2026-09-29T23:37:49.690Z`. This is exactly the census's `leadLastMessageAt` and end of the lead's data window. The lead's stored file continues to line 25,113 (last row `2026-09-30T02:51:39.934Z`), and its last stored `task_complete` is at `2026-09-30T02:42:57.268Z`. The parser therefore missed about 3,070 lead rows, roughly three hours: the whole gap I reported as "undercount" is an artefact of the stop, not missing data.

Children with the malformed-row finding (each stopped at its first separator row; each file now ends with a complete `task_complete`, the valid metadata continues past the stop):
- 01a0ef45: stopped after line 1362 (`2026-09-29T23:46:20.139Z`); stored last row line 3248, `task_complete` at `2026-09-30T02:48:53.638Z`.
- 01a0ef88: stopped after line 26 (`2026-09-29T23:39:00.300Z`); stored last row line 51, `task_complete` at `2026-09-29T23:40:03.575Z`.
- 01a0f017: stopped after line 24 (`2026-09-30T02:14:32.916Z`); stored last row line 66, `task_complete` at `2026-09-30T02:16:44.028Z`.

## Child 01a0eb03 (missing witness only, different cause)
File is complete and clean (175 rows, 0 bad, last `task_complete` line 174 at `2026-09-29T02:40:57.286Z`, final row line 175 `item_completed` at `2026-09-29T02:42:08.845Z`). Its data lies wholly before the window start (`2026-09-29T19:17:00Z`): census shows turns 0, 18 rows excluded by window, byModel empty. The census rule at `:1552` (non-`continue` branch at `:1550`) only skips a child whose `firstAt` is after `--to`. A child that ended before `--from` has neither a row after `--to` nor a terminal `task_complete` as its final row (its final row is `item_completed`, not the `task_complete` at 174), so it gets a witness finding although it cannot contribute any window tokens. That is a rule limitation on pre-window children, independent of the U+2028 defect and not corruption. Stored data does not have a gap that matters to the window; the parser does not ask "did this child end before `--from`".

## Causal limits
- Verified: files as they are now parse cleanly on the `\n` framing; the readline reader is what cuts them. The census-time snapshot is not preserved, but the same first-bad line numbers appear in the current files, so the identical cause applies to the census as run. Files that were still growing (lead; child 01a0ef45, whose last row `02:48:53Z` is later than the census run) may have differed slightly at the tail then; the stop points are all far earlier than any tail.
- Not verified: that fixing the reader alone yields COUNTED. Once the readline stop is removed, the lead's `--to` (`02:45:58Z`) end witness needs a row after `--to` or a terminal `task_complete` matching `lastStartedTurn`; the lead's last stored `task_complete` is at `02:42:57Z`, before `--to`, and the lead has since appended rows after `--to` (the file grew to `02:51:39Z`), so a row-after-`--to` witness may now exist, but I did not compute it and it cannot be claimed here. Child witnesses were not recomputed. Other rules (`token_usage_record` attribution, duplicate response checks, monotonic timestamps) in the unread 3,070-row tail are untested.
- The PARTIAL verdict, as run, is truthful for that run: the reader did stop early and the numbers are undercounts. This diagnosis does not turn it into COUNTED and offers no waiver.

## Token semantics correction
Recorded as a clarification in `census-execution-report.md` (original verdict and counts preserved). Parser definitions: `input_tokens` = uncached input; `cache_read_input_tokens` = cached input; `native_input_tokens` = input including cached; `derived_total_tokens = native_input_tokens + output_tokens`; `reasoning_output_tokens` is a subset of output. `gpt-6-astra` observed: 5,196,328 uncached + 303,122,816 cached = 308,319,144 native input; + 1,038,956 output = 309,358,100 derived total. `observedLeadTokens` = 46,327,454 is a different measure from `derived_total_tokens` = 309,358,100; I have not reconciled them, and neither is a complete build total (both come from the truncated read).

## Next input and owner
- Owner and decision: root (skills-fable / lane owner), because it needs a source change to `scripts/build-census.mjs`.
- Precise next input: a reviewed reader fix so rows are framed on `\n` only (e.g. `\n`-splitting on the stream, not readline's U+2028/2029 splitting), with a regression test containing an unescaped U+2028 and U+2029 inside a valid JSON string, plus a rule decision for children that end before `--from`. Then a fresh, root-approved census run on a new `--to` from the same CLI on the same files, with the four-read rerun on its output.
- Explicitly not proposed: relabelling PARTIAL as COUNTED, skipping corrupt rows, or waiving the census. The stored files contain no corruption; the change is to the reader, and it must prove itself on the tests before any run counts.
