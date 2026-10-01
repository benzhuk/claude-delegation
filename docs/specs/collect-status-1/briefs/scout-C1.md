# Scout — C1 (scripts/collect-status.mjs, scripts/collect-status.test.mjs)

## Files and symbols
- `scripts/collect-status.mjs`: does not exist. New file.
- `scripts/collect-status.test.mjs`: does not exist. New file.
- `scripts/collect-from-origin.mjs` (180 lines, base sha 31a23e2): exports `main`, `parseArgs`,
  `fullRef`, `refExists`, `listOriginBranches`, `changedRecordPaths`, `extractArtifactSha`,
  `computeState`, `hoursSinceLog`, `formatTable`. `ROW_FIELDS` = branch, tipSha, tipDate,
  recordPath, status, artifactSha, merged, hoursSinceLog, state — matches spec's row shape
  exactly. `computeState` state tokens: `accepted-merged`, `accepted-unmerged`, `rejected`,
  `withdrawn`, `owned`, `no-record` — this is the fixed allowlist K2 requires for `--text`.
  `main(argv, opts)` takes `write`/`warn`/`now`/`cwd` injectable opts and always returns 0.

## Helpers to reuse
- Import `collect-from-origin.mjs`'s exported functions directly (spec says "import ... do not
  shell out"); no need to reparse its CLI, just call `main`-adjacent pieces or its own `main`
  with injected `write` to capture the JSON rows in-process.
- `scripts/collect-from-origin.test.mjs`: `initRepoWithOrigin`, `newBranch`, `pushBranch`,
  `backToMain`, `writeRecord`, `commitAll`, `mkTmp` (fixture root under `FIXTURE_ROOT` or
  `os.tmpdir()`) — the bare-remote fixture builder the spec says to reuse, not fork.
  `snapshotGitDir` (line 84) is the exact never-writes helper to copy for collect-status's own
  never-writes assertion (hash every file under `.git` before/after).
- `skills/multi/scripts/note-send.mjs`: CLI contract v4, argv-only (execFile, never a shell
  string). `--to`, `--kind`, `--topic`, `--text`, `--goal`, `--details`, `--needs`, `--no-type`,
  `--recipient-repo`, `--dry-run`, `--json`. Reserved words ` Goal: `, ` Details: `, ` Needs: `
  and chars backtick/`;`/`|`/`&&`/`$(` are rejected inside any field per envelope.md.
- `scripts/test-home.mjs`'s `makeTempHome` is the sealed-home pattern other scripts use for
  git-identity-bearing fixtures, if collect-status needs one (it may not — it never writes git).

## Tests that police this area
- `collect-from-origin.test.mjs:492` "never writes: every file under .git is byte-identical" —
  the model to copy; collect-status must add the same assertion against its own bare-remote
  fixture, per the spec.
- No existing test file constrains `scripts/collect-status.mjs` itself (new file); nothing else
  in the tree references it yet (fresh grep, zero hits outside spec/contracts).

## Open questions for the spec
- Contracts.md K2 already answers "which state tokens" and "how host is sanitized" — no
  ambiguity left there.
- Spec line 35's example note text has a literal `<n> lanes ... m>` template; contracts.md says
  "the example above therefore uses commas ... the builder rewrites it" — confirms the builder,
  not the spec, must produce the actual envelope-safe substance text; no further ruling needed.
