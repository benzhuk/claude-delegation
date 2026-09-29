VERDICT: NEEDS_FIXES (4) 84e643e7c60e753b783b268c9e3d2c4b3513b591

# Lane 54 (four-read-json) code review r1

Artifact 84e643e7c60e753b783b268c9e3d2c4b3513b591, base 7ab59db, diff `git diff 7ab59db 84e643e`.
All runs used scratch copies made with `git archive` under `scratchpad/lane-54/rv/`. The worktree was not touched: `git status --short` is clean and HEAD is 84e643e.

Cause: at the base, `four-read.mjs` passed `--census` through `loadJson` (scripts/four-read.mjs:47). That function swallows a JSON.parse failure into `null`, so a census markdown file became "no census" with exit 0. The token, gap, wake and Stop-block cells then went blank.
Discriminating check: at base 7ab59db, `node scripts/four-read.mjs --record scripts/fixtures/four-read/record.md --census scripts/fixtures/four-read/census-markdown-sample.md --out X --json Y` exits 0 and writes both files. At 84e643e it exits 2, prints only the F1 message, and writes neither file. I reproduced both.
Fix location: scripts/four-read.mjs:893-924 (`CENSUS_JSON_TOP_LEVEL_KEYS`, `isBuildCensusJsonShape`, `validateCensusArg`, and the gate in `main`).
Simplification: require only the top-level keys four-read actually reads and every build-census version has written. Apply the same strict read to `--spec-census`. Do not key the gate to the newest shape.

## Findings

### F-1 MAJOR: the shape gate refuses legitimate older build-census JSON and says it is "the census markdown"

Evidence:
- scripts/four-read.mjs:899 requires `stallNudges`. build-census only started writing that key on 2026-09-28 17:55 (commit 1c41ce7, lane 38).
- The repo holds 40 committed build-census `--json` files. 34 of them have no `stallNudges` key, for example docs/work/evidence/wr-2026-09-27-collect-status.census.json, wr-2026-09-25-four-read.census.json and wr-2026-09-27-codex-census-final-census.json. All 40 share the other 7 keys (I measured this by intersecting the key sets of every tracked JSON file that has a `leadPath` key).
- four-read never reads `stallNudges`, `marker`, `tasksPaths` or `defaultSubagentsDir` (a grep of scripts/four-read.mjs finds none). four-read also has an explicit contract for older censuses at :687-689 ("census predates wake/Stop-block counts"), tested at scripts/four-read.completeness.test.mjs:70-73. That test calls `buildFourRead` directly, which is why the new CLI gate slipped past it.
- Reproduced: `four-read.mjs --record docs/work/wr-2026-09-27-collect-status.record.md --census docs/work/evidence/wr-2026-09-27-collect-status.census.json` gives full numbers with exit 0 at base (1.0h, largest gap 51.7min, 16106944 tokens). At the artifact it gives `four-read: --census must be the build-census --json data file, not the census markdown` with exit 2. That message is false, because the input is the JSON.
- The same happens for the committed Codex census wr-2026-09-28-codex-parity.census.json. This brings in the brief's "rejects a legitimate census" question: any rerun of a pre-lane-38 record, which is the same kind of rerun as F4, now fails.

Patch (scripts/four-read.mjs:899), exact:
```
old: const CENSUS_JSON_TOP_LEVEL_KEYS = ['lead', 'subagents', 'combined', 'stallNudges', 'marker', 'leadPath', 'tasksPaths', 'defaultSubagentsDir'];
new: const CENSUS_JSON_TOP_LEVEL_KEYS = ['lead', 'subagents', 'combined', 'marker', 'leadPath', 'tasksPaths', 'defaultSubagentsDir'];
```
Also update the comment at :898 so it says these are the keys every build-census version has written, and that `stallNudges` is left out on purpose because pre-lane-38 censuses lack it.

Add a regression test to scripts/four-read.test.mjs:
```
test('validateCensusArg: a pre-lane-38 build-census JSON (no stallNudges) still passes', async () => {
  const dir = mkTmp('four-read-old-census-');
  const censusPath = await buildCensusFile(dir);
  const c = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  delete c.stallNudges;
  fs.writeFileSync(censusPath, JSON.stringify(c));
  assert.deepEqual(validateCensusArg(fs, censusPath), { ok: true });
});
```
Simulated on a scratch copy with this patch: four-read suites 117/117 pass, the collect-status rerun exits 0, and `validateCensusArg` accepts all 40 committed census JSONs, with no rejections. At the artifact the new test is red, because stallNudges is required.

### F-2 MAJOR: the twin, `--spec-census` markdown, is still read silently as a census that was never run

Evidence: `buildFourRead` still loads `opts.specCensus` with the silent `loadJson` (scripts/four-read.mjs:787). With the lane 42 rerun census as `--census` and the markdown fixture as `--spec-census`, the artifact exits 0 and prints `partial (no spec slice): spec-census not run`. That is false, because a spec census was passed. It is the same "passes because it isn't looking" class, in the same file and inside this lane's territory. docs/census.md:508 also says "pass its output file as `--spec-census`" without saying which file. build-census writes both `--out` markdown and `--json`.

Patch (scripts/four-read.mjs:923), exact:
```
old:   if (!censusCheck.ok) { writeErr(`${censusCheck.message}\n`); return 2; }
new:   if (!censusCheck.ok) { writeErr(`${censusCheck.message}\n`); return 2; }
  if (opts.specCensus) {
    const specCheck = validateCensusArg(fsImpl, opts.specCensus);
    if (!specCheck.ok) { writeErr(`${specCheck.message.replace('--census', '--spec-census')}\n`); return 2; }
  }
```
Make a one-line caller correction at docs/census.md:508: `pass its output file as \`--spec-census\`` → `pass its \`--json\` output file as \`--spec-census\``.
Add a test that mirrors the existing `main: --census pointed at the census markdown` test, with a valid `--census` from `buildCensusFile` and `--spec-census CENSUS_MARKDOWN`. It should expect exit 2, a stderr line `four-read: --spec-census must be the build-census --json data file, not the census markdown`, and no output files.
Simulated with F-1 applied: suites 117/117 pass, and the markdown `--spec-census` exits 2 with that message.
If the lead rules this out of scope for lane 54, it has to become a named follow-up, not be dropped.

### F-3 MINOR: the appendix's "Work lost or stalled" cells drop two unknowns, so partial reads look complete

Evidence: docs/reports/census-0928/four-read.md:323-327. I reran all five lanes (details below). four-read's actual cell for each lane contains `ASKs unavailable (no --lead-slug)` and `stall nudges unavailable (no --lead-slug)`. The appendix rows remove both parts. For example, lane 42's row reads `0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0`, which looks like a full clean read. The note at :329 discloses the omission, but the table cell a reader scans does not. This is the brief's past bug class: an unknown shown as a confident result.

Patch: in each of the 5 rows, replace the last cell with the verbatim four-read value. Exact new last cells:
- 42: `0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); ASKs unavailable (no --lead-slug); wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug)`
- 43: `0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); ASKs unavailable (no --lead-slug); wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug)`
- 44: `0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); ASKs unavailable (no --lead-slug); wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug)`
- 46: `0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); ASKs unavailable (no --lead-slug); wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug)`
- 47: `0 gap(s) over 30min stalled; 1 waiting-on-agents (40.9 min); ASKs unavailable (no --lead-slug); wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges unavailable (no --lead-slug)`

The alternative is to rerun with `--ledger docs/ledger --lead-slug skills-n` and publish those cells. The verbatim fix above is the mechanical one.

### F-4 MINOR: test gap, the `lead` object check is unguarded

Evidence: a mutation of scripts/four-read.mjs:903 to `return true;`, which accepts `lead: null` or an array, leaves all 111 four-read.test.mjs tests green. By hand, `{"lead":null, ...all 8 keys}` is correctly refused at the artifact, but no test pins that.

Patch (scripts/four-read.test.mjs:1584), exact:
```
old:   assert.equal(isBuildCensusJsonShape('VERDICT: COUNTED'), false);
new:   assert.equal(isBuildCensusJsonShape('VERDICT: COUNTED'), false);
  const allKeys = { subagents: {}, combined: null, marker: null, leadPath: 'x', tasksPaths: [], defaultSubagentsDir: null };
  assert.equal(isBuildCensusJsonShape({ ...allKeys, lead: null }), false);
  assert.equal(isBuildCensusJsonShape({ ...allKeys, lead: [] }), false);
```
(`allKeys` omits `stallNudges` so the test still holds once F-1 is applied.)

## Answers to the brief's attack items

1. F1 completeness, probed at the artifact CLI:
   - Refused with exit 2 and no output: markdown, empty file, a BOM-prefixed census, an array, four-read's own JSON, and JSON where `lead` is null.
   - Refused with exit 2 as "not found or unreadable": a directory (EISDIR) and a missing path. At base a missing path was silent, so exiting 2 is what the spec asks for.
   - Accepted: CRLF JSON, and a fresh Codex census generated from scripts/build-census.fixtures/codex-native-sanitized/lead.jsonl (`lead.host` codex, `wakeSplit` null). The committed current-shape Codex census wr-2026-09-28-codex-followups.census.json also passes.
   - Exit 2 happens before `buildFourRead` and before any write (scripts/four-read.mjs:922-924). Verified: no files were created.
   - The key list matches what build-census writes today (scripts/build-census.mjs:1359-1390 for Codex, :1558-1609 for Claude). It is stricter than it needs to be, though (F-1).
   - The remaining silent path is `--spec-census` (F-2).
   - BOM: refused loudly. build-census never writes a BOM, so this is acceptable. Noted only.
2. F2 callers: I grepped scripts/, skills/ (including team-build/references/accept-prep.mjs and build-loop-workflow.js), docs/census.md, docs/work-record.md and SKILL.md.
   - No script shells out to four-read.mjs.
   - accept-prep writes `-census.md` for `work-record.mjs accept --census`, a different flag that expects the markdown.
   - docs/census.md:364 and :499-501 already show `.census.json`.
   - The builder's list is correct for `--census`. The only miss is the ambiguous `--spec-census` sentence at docs/census.md:508 (F-2).
3. F4 appendix: I reran all 5 lanes, not just two, from a scratch archive of 84e643e.
   - Command pattern: `build-census --lead ~/.claude/projects/-home-ben-Code-claude-delegation/f6c8ae21-...jsonl --from <Opened> --to <accepted>`, then four-read. Every run exited 0.
   - The Hours cells and the tokens (8917860 / 11623981 / 18248547 / 14735966 / 35706699) match the appendix exactly.
   - The gap, stall, wake and Stop-block values match, apart from the dropped unknowns (F-3).
   - The lane-to-record map matches each record's Scope line (lane 42 stale-session-guard, 43 cross-host-nudge, 44 transport-identity, 46 test-temp-hygiene, 47 repo-env-everywhere).
   - `--from` equals each `Opened:`. `--to` equals each record's single `accepted` Log line: 21:12:39, 20:34:53, 21:57:01, 22:47:28 and 2026-09-29T00:12:11.
   - These records, and four-read.mjs and build-census.mjs, are byte-identical between main and 84e643e.
   - No cell is invented. None is blank, apart from F-3's omissions.
   - The lane 45 explanation fits: no record exists, and the census-0928 lane tables at :33-37 and :62-66 skip 45 too.
4. Tests:
   - Four-read suites at the artifact: 117/117 pass.
   - Discriminating behavior confirmed at base: exit 0 with files written.
   - Mutations on a scratch copy of four-read.test.mjs (111 tests). Each of these fails exactly 1 test: removing the gate in `main`, removing the shape check, and turning a missing file into ok. So the new tests do discriminate.
   - The `lead` check mutation survives (F-4). Dropping `stallNudges` survives too, which is the change F-1 wants.
   - The scratch copy was restored after each mutation.
5. Scope: the diff touches only scripts/four-read.mjs, its test file, one new fixture, the report appendix (append-only, no removed lines) and the lane's own record and build report. build-census.mjs, GOALS.md and other records are untouched.

Verified absence of defects: exit ordering (no output file before the refusal), CRLF handling, directory and missing-path handling, Codex and wakeSplit-null acceptance, the F4 lane map and time windows, and every numeric cell in the appendix.
