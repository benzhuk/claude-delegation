DONE b9fc40e34d80320aab6286c2849cca93fe6b9d8f

Round 2 of the J1 live fix, addressing docs/specs/janitor-daily-1/reports/J1-live-fix-review.md
(Opus NEEDS_FIXES at 3ea1493). Only scripts/install-janitor-timer.mjs and
scripts/install-janitor-timer.test.mjs were touched. docs/work/*.record.md was left
alone (it shows as a modified file in `git status`; it is the coordinator's
uncommitted edit and was neither read for content nor staged/committed here).

## Per-finding table

| Finding | Fixed | Commit |
|---|---|---|
| F1 — valueless/empty/repeated value flags reach a write path | yes | b9fc40e |
| F2 — L2 refusal test didn't discriminate; no coverage of the new refusal branch | yes | b9fc40e |
| F3 — allowlist compares path.resolve, not realpath; case-folds on Linux | yes | b9fc40e |
| F4 — bare cache root itself accepted as a plugin root | yes | b9fc40e |
| F5 — Codex-root citation overstated its source; comment fix | yes | b9fc40e |
| I1 — symlinked entrypoint silently no-ops (isMainModule) | info only, left as-is | n/a |

All five were applied essentially verbatim from the reviewer's patches, as instructed.

## F1 — valueless/empty/repeated value flags

scripts/install-janitor-timer.mjs:432-439 (inserted before the pre-existing
`const repoFlag = parseArgFlag(...)` block): for `--repo`/`--host`/`--name`, if the
flag is present in argv but `parseArgFlag` returns null (missing value, empty value,
or the next token looks like another flag), push a `"<flag> needs a value"` refusal.
Separately, any of `--hour`/`--repo`/`--host`/`--name` given more than once pushes a
`"<flag> given more than once"` refusal. Both go through the existing refusal-return
path (exit 1, nothing written), same as the pre-existing valueless `--hour` refusal.

Test added verbatim: `L1 review: a valueless/empty --repo/--host/--name, or a
repeated value flag, refuses and touches nothing`
(scripts/install-janitor-timer.test.mjs, after the three existing L1 tests) — covers
the 9-case matrix plus the destructive `main(["--remove","--name","--enable"])`
scenario, asserting the real `janitor-record.timer` survives untouched and no exec
call is made.

## F2 — L2 test discrimination + coverage

- `isInstalledPluginRoot` exported (scripts/install-janitor-timer.mjs:334, was a
  bare `function`, now `export function`).
- New path-only unit test added verbatim: `L2 review: the allowlist itself rejects
  this host's real worktree layout and accepts only the two caches`
  (scripts/install-janitor-timer.test.mjs, placed where the old, non-discriminating
  L2 refusal test was) — five reject cases (real worktree layout, durable non-cache
  path, `cache-evil` sibling, a `..`-escaping path, the bare `plugins` dir) and three
  accept cases (real cache path, with and without trailing slash, and the Codex
  cache path), all against plain strings with no filesystem/fixture involved. Added
  `isInstalledPluginRoot` to the import list (test.mjs:17-27).
- The old main-level L2 refusal test was tightened per the reviewer's item 3: the
  third maker now uses `mkTmp("janitor-timer-l2-outside-cache-")` instead of a bare
  `os.tmpdir()` join; every root now gets `fixtureDefaultRepoGit(home)` plus a real
  `scripts/janitor.mjs` stub under it, so the pluginRoot check is the only refusal
  that can fire; the assertion is now `refusals.length === 1` with the message
  matched against `/temporary checkout|not an installed plugin location/` instead of
  the old `refusals.length > 0`.

Verified this round: `L2 review: ...` fails to even load against c4b6633 (that
commit predates `isInstalledPluginRoot` entirely — the import throws), which is a
stronger failure than "one test fails" and satisfies "must fail on c4b6633."

## F3 — realpath + platform-scoped case-folding

scripts/install-janitor-timer.mjs:334-347: `isInstalledPluginRoot`'s `norm` now
realpaths (`fs.realpathSync.native`, falling back to the resolved path if the
realpath call throws — e.g. a nonexistent path used by the new path-only unit test)
before comparing, and only lowercases when `process.platform` is `win32` or
`darwin` (not `linux`), using the real OS platform rather than `main`'s injected
`platform` option, per the reviewer's note that case sensitivity belongs to the real
filesystem.

## F4 — bare cache root no longer matches

scripts/install-janitor-timer.mjs, the allowlist's final `.some(...)`: changed from
`t === root || t.startsWith(\`${root}/\`)` to `t.startsWith(\`${root}/\`)` — a bare
`<home>/.claude/plugins/cache` (or the Codex equivalent) with nothing under it no
longer matches; every real `<cache>/<publisher>/<name>/<version>` path still does.

## F5 — doc comment citation fix

scripts/install-janitor-timer.mjs's `isInstalledPluginRoot` doc comment: replaced
the `scripts/mirror-shared-skills.mjs:48` citation (which only shows
`<home>/.codex/agents`, not CODEX_HOME resolution) with
`scripts/codex-hook-trust.mjs:585-591` (the actual `codexHomes()` function, which
pushes `<home>/.codex` and `env.CODEX_HOME`), and noted that only the default
`<home>/.codex` is allowlisted here — a plugin installed under a non-default
`CODEX_HOME` or `CLAUDE_CONFIG_DIR` (e.g. this host's `~/.claude-acct2` through
`~/.claude-acct6`) is refused, fail-safe, not a hole. No behavior change, comment
only, as specified.

## I1 — left as instructed

Not fixed this round (info only, pre-existing, outside the diff): running the
installer through a symlinked entrypoint path is a silent no-op — `isMainModule()`
compares the realpath'd `import.meta.url` against the unresolved `argv[1]`, so a
symlinked invocation (e.g. from inside a realpath'd plugin cache pointing back at a
symlink) prints nothing and exits 0 without installing anything. The reviewer notes
this deserves its own ticket; nothing in this round's fixes changes that behavior,
and it is unrelated to F1-F5's write paths.

## Gate

Territory: `node --test scripts/install-janitor-timer.test.mjs` — 31/31 pass (0
fail): the 29 from round 1 plus the two new/replacement L1-review and L2-review
tests (net +2 test cases; F2's old, non-discriminating L2 test was replaced in
place rather than added alongside).

Full sealed suite, `node scripts/run-tests.mjs`, logged to
docs/specs/janitor-daily-1/reports/J1-live-fix-r2-gate.log:

```
ℹ tests 2047
ℹ suites 0
ℹ pass 2044
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
ℹ duration_ms 18037.531792
```

(2047 = round 1's 2045 + 2 net new tests; 0 fail, same 3 pre-existing skips as
round 1.)

## Rules followed

- Only scripts/install-janitor-timer.mjs and scripts/install-janitor-timer.test.mjs
  were staged and committed; docs/work/wr-2026-09-27-janitor-daily.record.md (the
  coordinator's uncommitted edit) was left untouched and unstaged.
- Every `main()` call in every changed/added test injects a fixture `home` under
  `os.tmpdir()`/`FIXTURE_ROOT`; no run ever used `os.homedir()` or the real HOME.
- No deletion command was run; test cleanup remains the pre-existing `after()`
  hook's in-process `fs.rmSync` on tracked fixture dirs only.
- No push, no `--enable`, no `--apply`, no git identity flags.
