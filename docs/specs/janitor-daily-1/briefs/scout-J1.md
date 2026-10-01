# Scout — J1 (install-janitor-timer)

## Files and symbols
- `scripts/install-janitor-timer.mjs`, `scripts/install-janitor-timer.test.mjs` do not
  exist yet — pure greenfield, no drift to report.
- `scripts/janitor.mjs`: `--record [dir]` exists and works (janitor.mjs:125, writer at
  1301 `writeRecord({ root, dir, state, mainBranch, now, hostName = os.hostname() })`);
  default dir `docs/work/evidence/janitor/`. No `--host` flag exists today — grep for
  `--host` and `janitor-repo` returns nothing outside the spec/contracts prose. You are
  adding both from scratch: a `--host <name>` CLI flag that just overrides the
  `hostName` param already threaded into `writeRecord`, no deeper change needed.
- `~/.agents/janitor-repo` (the repo-path-override file J1's spec/contracts describe) is
  not read anywhere in the tree today — this is a brand-new convention, not a reuse.
- `skills/janitor/SKILL.md` exists (108+ lines seen), has zero scheduling mentions today
  (confirmed by research.md's grep) — the "how to install the timer" section is new
  prose, not an edit to existing scheduling text.

## Helpers to reuse
- Temporary-checkout refusal pattern: `isDurablePath(target, { tmpDir, home })` in
  `scripts/mirror-shared-skills.mjs:691-701` — flags `os.tmpdir()`, `AppData/Local/Temp`,
  `/tmp`, `/var/folders`, and any path segment matching
  `(tmp|temp|scratchpad|worktrees?|wt-[^/]*)` as non-durable. The refusal call site sits
  at `mirror-shared-skills.mjs:710-730` (`installCodexHookScript`) — same shape J1 should
  mirror for "refuse to install from a temp/worktree checkout unless `--force-root`
  (tests only)." Note this regex would flag THIS TERRITORY'S OWN worktree path
  (`wt-janitor-daily-1-J1`) as non-durable — that is correct/expected behavior for the
  refusal check, not a bug to route around.
- Atomic write pattern: `writeFileAtomic`-shaped temp-then-rename at
  `mirror-shared-skills.mjs:669-683` (temp file `${file}.${pid}.tmp`, rename, cleanup on
  throw) — reuse for `installed.json` and any generated unit/task file so a killed
  install never leaves a half-written file.
- Fixture-home pattern for tests: `fs.mkdtempSync(path.join(os.tmpdir(), '<prefix>-'))`
  used throughout `scripts/mirror-shared-skills.test.mjs` (e.g. lines 149, 187) and
  `scripts/janitor.test.mjs` (`mkTmp("janitor-repo-")` at line 54) — same pattern for a
  fixture `$XDG_CONFIG_HOME`/scratch home in the new test file.
- `process.execPath` is Node's own absolute-path-to-self; no existing helper wraps it,
  it's a one-liner.

## Tests that police this area
- `scripts/janitor.test.mjs` already covers `--record` output shape and `writeRecord`;
  if J1 adds `--host`, existing tests that assert the record's host field (search for
  `hostName` / `sanitizeHost`) must keep passing unchanged when `--host` is absent —
  do not change the default behavior.
- No test file anywhere currently exercises scheduler-unit generation, so J1's new test
  file is the only gate on byte-stability, `--dry-run` no-op, `--remove` scoping, and the
  "`--apply` never appears in any generated command" assertion — nothing else in the
  suite will catch a regression here.

## Open questions for the spec
- The contracts pin `installed.json`'s exact shape but not where the generated
  unit/plist TEXT itself is asserted byte-stable against — is a golden-file fixture
  expected, or is "generate twice, diff outputs" sufficient? Spec says "byte-stable for
  the same inputs," which a self-diff satisfies; flagging in case the reviewer expects a
  committed golden file.
- `~/.agents/janitor-repo` per contracts is "a file that exists" gating the repo path —
  the spec doesn't say whether its content is the bare path string or something
  structured; scout found no prior convention in-repo to copy.
