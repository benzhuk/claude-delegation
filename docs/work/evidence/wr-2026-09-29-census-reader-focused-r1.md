VERDICT: FAIL — focused candidate gate has 1 assertion-message mismatch; encoding mutant is killed 4/4

# Lane 40b focused integration verification

- Candidate tested: `b2a1e6a77133c3c9d4b60fecdf34452c5f4d95c7`
- Resolved HEAD at report time: `dc1b05506acc80f257b75f78fecbd25ed746b6f7`
- Equivalence: `git diff --name-only b2a1e6a77133c3c9d4b60fecdf34452c5f4d95c7..dc1b05506acc80f257b75f78fecbd25ed746b6f7 -- scripts` returned no paths. The later commit changes only three `docs/work/*.record.md` files, so source and tests are byte-for-byte equivalent to the tested candidate.
- Worktree status: clean
- Run completed: 2026-09-29 23:24:22 America/New_York
- Integration edits by this verifier: none

## Focused candidate gate

The nonblocking Windows mutex `Global\claude-verify` was acquired. No full suite ran.

Exact command:

```powershell
node --test scripts/build-census.codex.contract.test.mjs scripts/build-census.completeness.test.mjs scripts/build-census.test.mjs scripts/build-census.wake-split.test.mjs scripts/jsonl-lines.test.mjs scripts/token-census.test.mjs scripts/four-read.completeness.test.mjs scripts/four-read.test.mjs
```

Exact totals:

```text
ℹ tests 306
ℹ suites 0
ℹ pass 305
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2869.1781
```

Named failure:

```text
lfLines rejects byte chunks instead of silently decoding a split UTF-8 sequence
```

Observed failure:

```text
AssertionError [ERR_ASSERTION]: The validation function is expected to return "true". Received false
Caught error:
TypeError: lfLines expects UTF-8-decoded string chunks
```

The implementation satisfies the required error type. The test validator uses `/utf8-decoded string chunks/i`, which does not match the implementation’s hyphenated `UTF-8-decoded` text. This is a test assertion-message mismatch, not a framing or decoding failure. Every other focused census and four-read test passed, including all Unicode production-reader, temporal-completion, segment-retention, corruption/conflict, and existing Lane55 contracts.

The `fatal: ambiguous argument 'not-a-real-ref..0123456'` line emitted during `four-read.test.mjs` is expected stderr from its unresolvable-ref fixture; that test passed.

## Encoding mutant proof

Scratch copy:

```text
C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/census-reader-40b/encoding-mutant-b2a1e6a
```

It is a plain-file copy of `scripts/` and its required `skills/` import tree. The integration worktree, Git identity, HOME, and logs were untouched.

The same command was used for control and mutant:

```powershell
node --test --test-name-pattern "Codex public census API|censusLeadFile parses|censusSubFile counts|runCensus counts a literal" scripts/build-census.codex.contract.test.mjs scripts/build-census.test.mjs scripts/token-census.test.mjs
```

Control result before mutation:

```text
✔ Codex public census API preserves literal U+2028/U+2029 JSON and counts the following usage row
✔ censusLeadFile parses a literal U+2028/U+2029 assistant row as one LF-framed JSON record
✔ censusSubFile counts exact usage from an assistant row containing literal U+2028/U+2029
✔ runCensus counts a literal U+2028/U+2029 assistant row through the production token reader
ℹ tests 4
ℹ pass 4
ℹ fail 0
ℹ duration_ms 117.1252
```

Mutations in the scratch copy only:

```diff
- fsImpl.createReadStream(filePath, { encoding: 'utf8' })
+ fsImpl.createReadStream(filePath)

- fsImpl.createReadStream(full, { encoding: 'utf8' })
+ fsImpl.createReadStream(full)
```

Mutant result:

```text
✖ Codex public census API preserves literal U+2028/U+2029 JSON and counts the following usage row
✖ censusLeadFile parses a literal U+2028/U+2029 assistant row as one LF-framed JSON record
✖ censusSubFile counts exact usage from an assistant row containing literal U+2028/U+2029
✖ runCensus counts a literal U+2028/U+2029 assistant row through the production token reader
ℹ tests 4
ℹ pass 0
ℹ fail 4
ℹ duration_ms 97.0931
```

The first three fail with `TypeError: lfLines expects UTF-8-decoded string chunks`. The token-census production test fails its exact-turn assertion with actual `0`, expected `1`. The independent tests therefore kill removal of UTF-8 decoding from both production `openLines` seams.

Cause: the sole candidate failure is spelling punctuation in an error-message validator: `utf8` versus `UTF-8`. The production contract and error type agree.

Discriminating check: the clean candidate’s four production-path Unicode tests pass 4/4; removing `encoding: 'utf8'` makes the identical four tests fail 4/4.

Fix location: `scripts/jsonl-lines.test.mjs` line 60 message validator, or normalize the implementation message. No fix was made in this verification lane.

Simplification: align one expected error string while retaining the `TypeError` class check; no production change is indicated by this failure.

