# Lane 59: janitor acts (daily reclaim, one allowlisted deleter, its allow line)

Ask: skills-fable-janitor-59-1, from Ben's three ticks on the decisions page (read at 5:11 PM NY 9/29, verified by skills-n on a fresh read at 5:15 PM):
- "Yes, reclaim the safe class daily on every host (recommended)";
- "Yes, build the deleter and add the allow line on all four machines (recommended)".

Scout: /var/tmp/lane-59/scout.md, copied to scout.md in this folder.

Measure: work lost or stalled. The target is rm permission prompts and denials that stall sessions (the packet counts 236 guard plus rm denials on 9/29), plus disk and inode exhaustion (the Netcup /tmp outage of 9/29, 7:30 AM to 3:20 PM NY).

Simplest design: reuse what exists. janitor.mjs already classifies SAFE and removes worktrees and branches through git. work-record.mjs already has the path-safety checks for one directory delete. This lane adds one CLI and one shared helper, and flips the timer to act.

## Pinned contracts

### C1. scripts/path-safety.mjs (new, T1)
- `export function checkRemovablePath(target, { roots, repoRoots, home, platform }) -> { ok: true, real } | { ok: false, reason }`
- The checks are exactly those of work-record.mjs's removeScratchDirectory (scout C, :1986-2097), factored out:
  - absolute on this OS;
  - under one of `roots`;
  - lstat is not a symlink;
  - realpath equals the resolved path, so no symlinked ancestor;
  - not a filesystem or drive root;
  - not HOME;
  - neither equal to, containing, nor inside any repo root or `git worktree list` path.
- The per-root predicate is supplied by the caller. work-record keeps its own root rule, the session id as a whole segment.
- work-record.mjs calls the helper. Its behavior and tests stay byte-identical. No test in work-record.test.mjs changes except imports.

### C2. scripts/reclaim.mjs (new, T1)
Usage: `node scripts/reclaim.mjs [--dry-run] [--json] <path>... | --branch <name> --repo <dir>`

It validates every argument first. If any argument is refused, it removes nothing, prints one `refused <arg>: <reason>` line per refusal, and exits 3. Usage errors exit 2. Success exits 0.

Classes, and nothing else:
- **S, session scratch.** A path strictly inside `<tmpdir>/claude-<uid>/<project>/<session>/scratchpad/`.
  - `<tmpdir>` is os.tmpdir() or /tmp.
  - `<uid>` is the current uid on POSIX. On Windows, the segment is matched as `claude-*` under os.tmpdir().
  - The scratchpad directory itself is never removed, only its contents.
- **T, plugin temp.** A directory whose basename starts with `delegation-` and sits directly under os.tmpdir() or /var/tmp (POSIX), or anything inside such a directory.
  - On POSIX the top directory must be owned by the current uid.
  - This is the new naming convention for agent scratch: `mktemp -d /var/tmp/delegation-<name>-XXXX`.
- **W, finished worktree.** A path that `git worktree list` in its repo names, and that janitor.mjs's classify() marks SAFE (merged into origin/main after a fresh fetch, tree fully clean).
  - Removal uses janitor's existing `git worktree remove` path, exported from janitor.mjs. It is never removed by fs.
  - If the fetch fails, the path is UNVERIFIABLE and refused.
- **B, merged local branch.** `--branch <name> --repo <dir>`, SAFE per classify(), removed through janitor's existing `git branch -D` with its ancestry re-check.
  - Origin branches are out of scope (close --closeout and sweep-origin own them).

Removal:
- S and T paths are removed with fs.rmSync (recursive, force false) after C1 passes against the class root.
- Each removal prints `removed <S|T|W|B> <path-or-branch> <tip-sha or entry-count>`.
- `--dry-run` prints `would-remove` lines and removes nothing.
- A path argument is never followed outside its class root: realpath and lstat run on the argument and on every ancestor up to the root.

Shims:
- `reclaim` is installed on PATH next to note-send, by the same mirror script: ~/.local/bin/reclaim on POSIX, and the Windows equivalent note-send uses.
- It runs the reclaim.mjs of the installed plugin version.

### C3. Daily act (T2: scripts/install-janitor-timer.mjs, scripts/janitor.mjs's kill switch)
- scheduledCommandArgv() gains `--apply` for the janitor job by default. The installer's new `--record-only` flag restores today's argv.
- The existing refusal of a literal `--apply` inside user-supplied values (:684-701) STAYS. Only the installer's own argv adds the flag.
- The comment at :148-151 is rewritten to say why, citing Ben's tick of 9/29.
- New kill switch: while `~/.agents/ws-off-janitor-act` exists, janitor.mjs treats `--apply` as record-only. It still writes its record and drift line, and says "act switched off" on the record's first line.
  - The existing `ws-off` and `ws-off-janitor` switches keep their meaning: no run.
- Every act run records each removal with name and tip (it already does for apply; verify it), and the drift line still prints every run.
- The installed.json and argv tests are updated for the new default, and a test is added for `--record-only`.

### C4. The allow line (T2: scripts/mirror-shared-skills.mjs)
- On every run, the mirror script prints `ALLOW claude: Bash(reclaim:*)` and `ALLOW codex: none (no allow-line mechanism in Codex found)`.
- With `--write-allow`, it adds `Bash(reclaim:*)` to `permissions.allow` in `~/.claude/settings.json`, only when ALL of these hold:
  - the file exists and parses as JSON;
  - the line is absent;
  - the file is not chezmoi-managed: when `chezmoi` is on PATH, `chezmoi managed --include=files` does not list `.claude/settings.json`. If chezmoi is on PATH and the check errors, it refuses.
- The write:
  - preserves every other key and its order;
  - is atomic (temp file in the same directory, then rename);
  - leaves a copy at `settings.json.bak-<UTC stamp>`;
  - prints `WROTE <path> +Bash(reclaim:*)`.
  Otherwise it prints `SKIP <path>: <reason>`.
- It never touches settings.local.json or any project settings.

### C5. Docs (T2)
- skills/janitor/SKILL.md gets a "Reclaim" section: the classes, `reclaim` usage, the kill switch, and the allow line. It keeps the existing wording elsewhere.
- docs/subagent-contract.md gets one line: agent scratch goes in `mktemp -d /var/tmp/delegation-<name>-XXXX`, and removal is `reclaim <path>`, never rm.

## Territories
- **T1 (Sonnet builder):**
  - scripts/path-safety.mjs and path-safety.test.mjs (new);
  - scripts/reclaim.mjs and reclaim.test.mjs (new);
  - scripts/work-record.mjs, only the refactor onto C1;
  - scripts/janitor.mjs, only exporting the existing removal functions and classify for single-target use, with no behavior change;
  - scripts/janitor.test.mjs, only if exports need a test.
- **T2 (Sonnet builder):**
  - scripts/install-janitor-timer.mjs and its test;
  - scripts/janitor.mjs, only the ws-off-janitor-act check in main();
  - scripts/mirror-shared-skills.mjs and its test (the shim, and the allow line);
  - skills/janitor/SKILL.md;
  - docs/subagent-contract.md.
- The janitor.mjs split: T1 owns the export block, T2 owns main()'s kill-switch lines. Coordinate by keeping edits to those regions only.

## Tests (each red before, green after)
- **reclaim:**
  - each class accepted;
  - refused: a symlink escape, a `..` escape, HOME, `/`, a repo root, a live worktree with a dirty tree, an unmerged branch, the scratchpad dir itself, a T dir not prefixed `delegation-`, and a T dir owned by another uid (skipped when not root-testable);
  - one refusal among many removes nothing;
  - `--dry-run` removes nothing.
- **work-record:** its existing scratch tests stay green unchanged.
- **timer:** the default argv has `--apply`; `--record-only` does not; the user-value `--apply` refusal still fires.
- **janitor:** with ws-off-janitor-act present, `--apply` removes nothing and the record says so.
- **mirror:** the allow line printed; a write when the file exists and the line is absent; a skip when the line is present, the file is absent, the JSON is invalid, or the file is chezmoi-managed (fake chezmoi on PATH); the other keys preserved byte-for-byte in order; a backup written.

## Gates
Builders run their territory tests. The integrator runs `TMPDIR=/var/tmp node scripts/run-tests.mjs` once on Linux and once on Windows (the second host).

## NOT
- No change to the secret guard.
- No origin-branch deletion in the daily run.
- No new census script. The efficacy read is a one-off count after a day.
- No edit to any machine's settings during the build: `--write-allow` runs only at install time, after release.
