# Lane 36 (lane-closeout): pinned contracts and lead rulings

skills-h's rulings on spec.md (the Lane 36 section of docs/specs/2026-09-28-parallel-bundle.md, read at origin/docs/lane-specs-0925 dc16de3; the full file is spec-full.md). Where this file is more specific, it wins. Base 7b00418621f3b7dc168a2c1aa2f7d3618b1b6d45. Line numbers in spec.md have drifted by a few lines; find symbols by name.

## Territory map
- **C1** (worktree /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1, local branch wt/lane-closeout-1-C1):
  - `scripts/work-record.mjs` and its tests
  - `scripts/janitor.mjs`: a new export only; `main()` and the `--record` path stay unchanged
  - `scripts/janitor.test.mjs` (or a new `scripts/janitor-closeout.test.mjs`)
  - `docs/work-record.md`
  - `skills/janitor/SKILL.md`
- **C2** (worktree /home/ben/Code/claude-delegation-wt/lane-closeout-1-C2, local branch wt/lane-closeout-1-C2):
  - `hooks/delete-guard.mjs` and `hooks/delete-guard.test.mjs`
  - `docs/subagent-contract.md` (one scratch paragraph)
  - `agents/builder.md`, `agents/integrator.md`, `agents/reviewer.md`, `agents/runner.md`
  - `codex/agents/builder.toml`, `integrator.toml`, `reviewer.toml`, `runner.toml`
  - `agents/agents.test.mjs` (the eight-file identity test)
- **Lead only:**
  - `docs/work/**`
  - the two root files `L29-main-merge.raw.exit` and `L29-main-merge.raw.log` (removed by the lead in the merge)
  - the `SCRATCH_FROM` value (set by the lead in the merge commit)
- **Nobody:**
  - `scripts/run-tests.mjs`, `scripts/test-home.mjs`, `scripts/collect-*.mjs`, `scripts/install-janitor-timer.mjs`
  - `docs/GOALS.md`, `.agents/project.json`, `hooks/hooks.json`, `scripts/build-census.mjs`, `scripts/four-read.mjs`, `docs/census.md`

## Seam (C1 and C2): the scratch sentence, pinned
The eight role files each carry this exact sentence on its own line. C2 writes it; C1's docs/work-record.md may quote it.

> Temp files go only under the directory named by the record's `Scratch:` line (`<scratch root>/<lead session id>/<lane>/`); never write temp files into the repo and never delete them yourself: the lead's `work-record.mjs close --closeout` removes that directory.

## C1 rulings

### (a) The `Scratch:` field
- `Scratch:` is a singleton header field: `Scratch: <absolute directory>`.
- `export const SCRATCH_FROM = "2099-01-01T00:00:00Z";` gets a comment saying the lead sets it to this lane's merge time in the merge commit. The checker takes `opts.scratchFrom`, the same way it takes `opts.strictFrom`, so tests can set it.
- `accept` and `check-acceptance` refuse (finding `scratch-missing`) when all of these hold:
  - the record has no `Scratch:` line;
  - `Spec-from` is parseable;
  - `Spec-from` is on or after SCRATCH_FROM.
- Any other record with no `Scratch:` line gets a warning only, never a refusal.
- A `Scratch:` value that is not absolute is refused (`scratch-invalid`) at any date.

### (b) `work-record.mjs close --closeout --by <session-id> [--dry-run]`
`close` without `--closeout` behaves exactly as today.

With `--closeout`:
1. **Close.** Run the existing close, or accept a record whose Status is already `closed`.
2. **Merge proof.**
   - Run `git fetch origin`. If it fails, refuse every cleanup step (`UNVERIFIABLE: fetch failed`).
   - The record's `Artifact:` sha must be an ancestor of `origin/main`. If not, refuse every step.
3. **Worktree and local branch.** Resolve `Worktree:` (a path, or a branch name) through `git worktree list --porcelain`. Hand a janitor state narrowed to exactly that worktree and its local branch to the new janitor export, which calls `applySafe(state, log)`.
   - Never force. A dirty worktree is reported and left in place.
   - Delete the branch with `-d`, never `-D`.
   - Refuse the main worktree, and refuse the worktree that contains `process.cwd()`.
4. **Origin branch.** Delete it with `git push origin --delete <branch>`. The branch is `build/<...>`, taken from `Worktree:` or the `Artifact:` ref. Refuse, each with its own reason and its own unit test:
   - a branch not under `build/` (so `main`, `docs/*` and `feat/*` are refused);
   - a branch that is not this record's own;
   - a tip that is not an ancestor of origin/main;
   - a tip equal to origin/main's current sha;
   - a tip not on the mainline behind a merge commit. Rule: there must be a commit M in `git rev-list --first-parent --merges origin/main` such that the tip is reachable from `M^2` and not from `M^1`;
   - a branch named, in `Worktree:` or `Artifact:`, by another record under `docs/work/` whose Status is neither `closed` nor `withdrawn`;
   - a branch that `isRemoteBranchMergedIntoOrigin` does not report as merged.
   Print the deleted name, its tip sha and a restore command: `git push origin <sha>:refs/heads/<name>`.
5. **Scratch directory.** Remove the `Scratch:` directory with `fs.rmSync(..., {recursive: true})`. This is the plugin's one file-delete path. All checks run inside the script, and each refusal has a unit test:
   - `--by` must equal `Lead-session:`.
   - The path resolves, with `path.resolve`, under a scratch root. Scratch roots are:
     - `realpath(os.tmpdir())`;
     - `/tmp` on POSIX;
     - each entry of the `DELEGATION_SCRATCH_ROOTS` env var (`path.delimiter`-separated).
   - The `--by` session id is a whole path segment strictly between the root and the target, so the session directory itself is refused and only something below it can be removed.
   - `lstat` says not a symlink or junction, and `realpath` equals the resolved path (no symlinked ancestor).
   - It is not a drive root, the home directory, the repo root, any path in `git worktree list`, or a directory containing a `.git` entry.
   - On win32, compare case-insensitively.
   - A directory that is absent is reported as `absent`, which is not an error.
   - Print every removed path.
6. **Result.** Each step prints one line: `removed`, `refused <reason>`, `absent` or `dirty`.
   - Exit 0 only when every step is `removed` or `absent`. Otherwise exit 2.
   - `--dry-run` prints the same lines as `would ...` and changes nothing.
   - `Log:` gets one line: `closeout skills-... <step summary>`. It is written only by the script, and only when the run is not a dry run.

### (c) `work-record.mjs sweep-origin --repo <dir> [--exclude <name,...>] [--apply]`
- Dry run by default.
- Lists every `origin/build/*` branch with its tip sha and a verdict: `delete` or `keep <reason>`.
- It applies the rules from (b) step 4, with two changes:
  - "not the record's own" is dropped;
  - branches named in `--exclude` are added to the keep list.
- `--apply` deletes only the branches marked `delete`. It prints each name and sha, plus the restore command.
- Tests use a bare fixture origin, never the real remote.

### Tests
- Fixture repos only, with a local bare repo as origin. Never the real `origin`, never the real `~`.
- Fixture dirs are cleaned through node `fs`, inside the test process.

## C2 rulings

### The delete guard's quoted-text exemption
Quoted text is exempt only as an argument to a command that does not execute it.

**Exempt** (these no longer refuse):
- a recursive-delete pattern in a heredoc body that goes to `cat`, `tee` (writing to a file), `note-send` or a `git commit` message;
- a pattern in a single- or double-quoted argument to a non-executor such as `grep`, `rg`, `echo`, `printf`, `git commit -m`, `note-send --text`;
- `ssh host "grep -n 'rm -rf' file"`: the remote string is re-parsed, and the pattern sits inside a grep argument there.

**Stay refused** (each gets a test):
- the current real shapes in the existing test;
- `bash -c "rm -rf x"`, `sh -c '...'`, `zsh -c`, `eval "..."`;
- `ssh host "rm -rf x"`, `ssh host 'rm -rf x'`, `ssh host <<EOF` with the delete in the body;
- `bash <<EOF` / `sh -s <<EOF` with the delete in the body;
- `node -e` / `python -c` strings that call a recursive delete, if the guard matches those today;
- `pwsh -Command "Remove-Item -Recurse ..."`;
- `xargs rm -rf`, `find ... -exec rm -rf {} \;`, `find ... -delete`, if matched today.

**Rules:**
- Unknown or unparseable quoting fails closed, and still refuses.
- The three false-positive shapes named in the spec each get a test: a heredoc report body, a quoted grep pattern, and a quoted ssh remote grep.

### Docs
- **docs/subagent-contract.md:** one paragraph. It says:
  - temp files go under the record's Scratch directory, `<scratch root>/<lead session id>/<lane>/`;
  - the lead creates that directory and names it in the brief;
  - `close --closeout` removes it;
  - agents never delete.
- **The eight role files:** add the pinned sentence above, verbatim.
- **agents/agents.test.mjs:** the test asserts that all eight files contain that exact line.

## Rules for every agent
- Never run `rm`, `rm -rf`, `rmdir`, `git clean`, `git worktree remove`, `git branch -d/-D`, `git push --delete` or any other deletion in the shell.
  - Tests delete their own fixtures through node fs.
  - Use fresh directory names for scratch.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim. Never do the same thing through another tool or shell.
- Never touch the real origin's branches, the real `~/.agents` or real worktrees outside your own.
- Never set a git identity (no `-c user.*`, `--author`, `GIT_*` env, `--no-verify`), and add no trailers. Never force, `reset --hard` or stash.
- `git add`, `git commit` and `git push` run as separate commands, with conventional commits. Do not push: your branch is local; the lead merges it.
- Never touch `docs/work/`. Never send a note. Never write outside your worktree and the lane scratch dir `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/<your territory>/`.
