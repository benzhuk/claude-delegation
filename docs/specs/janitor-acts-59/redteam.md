VERDICT: NEEDS_FIXES (17)

# Lane 59 spec red-team: janitor acts (spec at 814059e, code at dff1e00)

Reviewed: docs/specs/janitor-acts-59/spec.md, scout.md, the packet's Part 2 (skills-fable-janitor-59-1.md:15-24), and scripts/janitor.mjs, install-janitor-timer.mjs, work-record.mjs :1954-2100, mirror-shared-skills.mjs. Probes ran in /var/tmp/l59rt-rJ8G with TMPDIR=/var/tmp. Nothing outside that folder was written or deleted. Finished 5:30 PM NY, 9/29.

Summary: the contracts are mostly the right shape, and the reuse of janitor's SAFE class is sound. Five gaps can lose or stall work:
- the daily act removes a worktree while a live session is sitting in it;
- nothing records what was removed or at which tip;
- rmSync crosses mount points and deletes linked worktrees inside scratch;
- class S is wrong on Windows and does not work on macOS;
- class S accepts any session's scratch.

The allow-line contract also has three measurable defects: a Codex line does exist, a fresh temp file widens the file mode, and JSON.parse errors echo the file's text.

## Denials and hook events during this review (reported verbatim, not worked around)
- **Denied, step stopped.** A probe that wrote an ignored `.env` file into the scratch worktree was blocked before it ran: `PreToolUse:Bash hook error: [/home/ben/.claude/hooks/secret-guard.sh pretooluse]: SECRET-GUARD: blocked — command references a secret file.` I did not retry that step under any name or through any tool. The ignored-file property was measured with `node_modules/` instead (F-verified-2).
- **Hook alert, needs Ben's attention.** secret-guard's PostToolUse reported "SECRET DETECTED IN OUTPUT" on my JSON.parse probe. The flagged string was a placeholder I made up inside the command text (`sk-FAKE-not-a-secret-123`). It was not read from any file or environment variable and is not a credential, so there is nothing to rotate. I am reporting it because the hook asks for Ben to be told.

---

## F1. HIGH: the daily act removes a worktree while a live session is in it (Orca workspaces included)
Evidence:
- The only cwd protection in classify() is `samePath(w.path, root)` (janitor.mjs:652), meaning the checkout janitor itself runs from. The age floor measures the worktree's birthtime (janitor.mjs:491-499), not how long it has been idle. An old worktree whose branch was just merged and pushed is SAFE on the next daily run.
- Probe: `git worktree remove` exited 0 on a worktree while another process had its cwd inside it. That process then got `fatal: Unable to read current working directory: No such file or directory`.
- On Windows the removal half-succeeds: contents are deleted and an empty shell stays behind (janitor.mjs:1095-1106, measured there in round 2).
- Orca workspaces are git worktrees where panes, including leads, live persistently:
  - Worktree: `C:/Users/benzh/orca/workspaces/claude-delegation/codex-census-1` (docs/work/wr-2026-09-27-codex-census.record.md:7);
  - the lead scratch slug `C--Users-benzh-orca-workspaces-claude-delegation-gudgeon`.
  A lead that merges its own branch and leaves a clean tree loses its cwd the next morning. That is the "stalled" half of the lane's own measure.

Fix: add this to C3 as a new bullet after "New kill switch":
> - **Idle floor for worktrees (act only).** The act run, and reclaim's W class, remove a SAFE worktree only when it has been idle at least 24 h. Idle age is now minus the newest mtime among:
>   - the worktree directory itself;
>   - its admin dir's `HEAD`, `index` and `logs/HEAD` (`git -C <wt> rev-parse --git-dir`);
>   - the newest entry in `~/.claude/projects/<slug>/`, where `<slug>` is the worktree's absolute path with every character outside `[A-Za-z0-9]` replaced by `-` (measured forms: `-home-ben-Code-claude-delegation`, `C--Users-benzh-orca-workspaces-claude-delegation-gudgeon`).
>
>   A worktree below the floor stays SAFE-listed in the report with `skipped: active in last 24h` and is not removed. The report path and classify() are unchanged. This is one pure function, `idleHours(wtPath, {home, now})`, in janitor.mjs, called from applySafe only when `state.act === true`.
>   Test: a SAFE fixture worktree with a fresh `~/.claude/projects/<slug>/x.jsonl` under a test HOME is not removed. The same fixture with the file's mtime set 25 h back is removed.

Predicted outcome: a live pane's worktree survives. Idle merged worktrees are still reclaimed a day later, and the efficacy read moves by one day at most.

## F2. HIGH: no removal is recorded with name and tip. The record is written before apply and the run log is truncated daily
Evidence:
- C3 says "(it already does for apply; verify it)". Verified: it does not.
- applySafe logs `{action, ref, ok}` with no sha (janitor.mjs:1090, :1172).
- writeRecord stores counts only (janitor.mjs:1484-1497), and main() calls it BEFORE applySafe (:1640-1650 vs :1656-1667).
- The timer's stdout, the only place the APPLIED table appears, goes to `~/.agents/janitor/last-run.log` with "truncated every run" (install-janitor-timer.mjs:37, :199-213, :326-331).
- Result: a removal is unrecoverable by name after 24 h. The packet's "listed with name and tip so any one can be restored" (packet :17) is unmet.
- Efficacy item 4, "drift line shows the safe class at zero", cannot be observed. The drift line has no SAFE count (:1503), and the JSON's safeCounts are pre-apply numbers.

Fix: replace the C3 bullet "Every act run records each removal ... (it already does for apply; verify it), and the drift line still prints every run." with:
> - applySafe's log rows gain `sha`:
>   - for a worktree, the tip of its branch as read by `refSha(root, "refs/heads/<branch>")` just before removal;
>   - for a branch, the `b.sha` it already re-checks (janitor.mjs:1147).
> - main() calls writeRecord AFTER applySafe, including when apply throws: the record is written in the catch path before returning 1. The record JSON gains:
>   - `"act": "applied" | "switched-off" | "not-requested"`;
>   - `"removed": [{ "kind": "worktree"|"branch", "ref": <path or name>, "sha": <40-hex> }]`;
>   - `"safeLeft": { "worktrees": n, "branches": n }`, meaning SAFE rows not removed this run (failed or skipped).
> - The drift line appends ` safe=<safeLeft total> removed=<removed count>` after `diskKB=...`.
> - Each printed APPLIED row shows the sha and a restore hint: `restore: git branch <name> <sha>`, plus `git worktree add <path> <name>` for a worktree.
> - Tests:
>   - a SAFE worktree plus branch run under act writes `removed` with both shas;
>   - the drift line regex at janitor.test.mjs:1854 is extended to the new suffix.

Predicted outcome: every deletion is restorable from the committed evidence file, and item 4's efficacy read becomes `safe=0` on the day after first act.

## F3. HIGH: S/T removal crosses mount points and deletes linked worktrees inside scratch; C1 does not say whose repo is checked
Evidence:
- Measured, mounts:
  - Node v24.18.1 rmSync is the C++ binding (`binding.rmSync`, no one-file-system option).
  - In a user namespace I bind-mounted a sentinel dir `outside/keepdir` (files `k`, `k3`) into `T/delegation-m/mnt` and ran `rmSync(T/delegation-m, {recursive:true, force:false})`. It threw with an empty code, and after the namespace exited `outside/keepdir` was EMPTY.
  - Any user FUSE mount inside scratch (rclone, sshfs, a Drive mount) is deleted through. Lean rules single out Drive deletions as painful.
- Worktrees live inside the scratchpad in practice: `...\scratchpad\next-build\wt-T2` (docs/work/evidence/wr-2026-09-21-next-build-t2-builder.md:5).
  - C1's "neither equal to, containing, nor inside any repo root or `git worktree list` path" takes its list from work-record's `root` (work-record.mjs:2064-2071). reclaim has no `--repo` for path args, so the repo whose worktrees get checked is undefined.
  - `reclaim <scratchpad>/next-build` would delete an unmerged builder worktree's uncommitted work, and would delete the object store of a repo whose linked worktrees live elsewhere.
- Measured, these are safe:
  - a symlink inside the tree is not followed (sentinel intact);
  - a hard link inside the tree removes only that name (original intact, links=1).

Fix: replace C2's "Removal:" first bullet with:
> - Before any S/T removal, reclaim walks the target without following links (lstat only) and refuses the whole invocation if any entry, the target included:
>   - has an `st_dev` different from the class root's `st_dev` (POSIX: this catches mount points, bind mounts and FUSE);
>   - is a `.git` FILE (a linked worktree);
>   - is a `.git` DIRECTORY containing a non-empty `worktrees/` (a repo with linked worktrees elsewhere).
>
>   The same walk produces the printed entry-count. Standalone fixture repos (a `.git` dir with no `worktrees/`) stay removable, per work-record's round-3 ruling.
> - The repo list for C1's repo checks is `git worktree list` of the repo containing process.cwd(), when there is one. If that listing fails, reclaim refuses (fail-closed, as at work-record.mjs:2069-2071).
> - Windows gate test: a T dir containing a junction (`mklink /J`) to a sentinel dir outside. Reclaim of the T dir must leave the sentinel's contents intact. If that fails on the Windows host, the walk also refuses any reparse point below the target on win32.
> - Tests: a `.git` file inside S refused; a bind mount (POSIX, skipped when `unshare -rm` is unavailable) refused; a fixture repo with a `.git` dir removed.

Predicted outcome: the measured bind-mount deletion becomes a refusal. The wt-T2 layout is refused with "contains a linked worktree", which points the caller at reclaim W or a prompt.

## F4. HIGH: class S matches the wrong segment on Windows and never matches on macOS
Evidence:
- Windows scratch is `%TEMP%\claude\<project>\<session>\scratchpad`: `C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-...-gudgeon\9c61c35a-...\scratchpad\...` (wr-2026-09-21-next-build-t2-builder.md:5, :43, :64). The segment is `claude`, not `claude-*`, so spec C2's rule matches nothing real.
- `claude-*` does match other tools' temp names, such as `claude-verify.lock` (docs/concurrency-budget.md:40) and `claude-native-episode-*`.
- macOS: `/tmp` is a symlink to `/private/tmp`. The inherited check "realpath equals the resolved path" (work-record.mjs:2045-2053) refuses every `/tmp/...` argument there, and `/private/tmp/...` is under no listed root. S is dead on the Mac.
- The Mac's scratch layout is unmeasured: the repo holds no macOS scratchpad path.
- The same symlink hits T's `/var/tmp` (it is `/private/var/tmp`).

Fix: replace the S bullet's sub-bullets in C2 with:
> - Roots are canonicalised once: each root string R is replaced by `realpathSync.native(R)` (macOS: `/tmp`→`/private/tmp`, `/var/tmp`→`/private/var/tmp`). If the argument starts with R, that prefix is rewritten to the root's realpath before any check. No symlink below the root is tolerated: realpath of the rewritten target must equal it, case-folded on win32.
> - POSIX layout: `<root>/claude-<uid>/<project>/<session>/scratchpad/<rest>`, root ∈ {`/tmp`}, `<uid>` = process.getuid(). Windows layout: `<tmp>\claude\<project>\<session>\scratchpad\<rest>`, where `<tmp>` is os.tmpdir() and the literal segment is `claude`, compared case-insensitively.
> - macOS: the builder records one measured scratchpad path from a Mac session in the build report before S is enabled for darwin. Until then, S on darwin refuses with `S class unmeasured on darwin`.
> - Tests use `platform`/`pathImpl` injection (as `pathWithin`, janitor.mjs:1209) to cover:
>   - the Windows `claude` segment;
>   - a Windows `claude-verify.lock` sibling refused;
>   - a darwin root-symlink rewrite.

## F5. MEDIUM: class S accepts ANY session's scratchpad; the packet says the caller's own
Evidence:
- The packet says "the caller's session scratchpad" (packet :18). Spec C2 accepts any `<session>`, so one agent can delete another live session's intermediate results or review drafts with no prompt.
- Measured: the Bash tool environment carries `CLAUDE_CODE_SESSION_ID`, and its value equals this agent's scratchpad session segment (checked by string comparison, value not printed). A subagent carries its lead's id, which is the right scope.

Fix: add to the S bullet:
> - The `<session>` segment must equal `process.env.CLAUDE_CODE_SESSION_ID`, compared case-insensitively on win32. When the variable is unset (Codex, cron, a plain shell), S refuses with `S needs CLAUDE_CODE_SESSION_ID (own session only)`.
> - Tests: own session accepted; a sibling session dir refused; variable unset refused.

## F6. MEDIUM: roots can be widened by the caller's environment (TMPDIR, DELEGATION_SCRATCH_ROOTS), and `claude-<uid>` ownership is not checked
Evidence:
- The spec roots S and T at `os.tmpdir()`, which reads TMPDIR/TEMP from the calling process. The C4 allow line makes reclaim prompt-free.
- work-record's root list also takes `DELEGATION_SCRATCH_ROOTS` from the environment (work-record.mjs:2002-2008). A verbatim factoring carries that in unless C1's `roots` excludes it.
- With TMPDIR=/home/ben/Code, T accepts `/home/ben/Code/delegation-<anything>` that is not a git root.
- TMPDIR differing between processes: with fixed roots, a scratch made under /var/tmp while the reclaim caller has TMPDIR unset still works. Today a `/tmp/delegation-x` made with TMPDIR unset is refused by a reclaim run with TMPDIR=/var/tmp, which fails safe but costs a prompt.
- /tmp/claude-1000 is mode 700 and owned by ben here, but that is not checked.

Fix: replace "`<tmpdir>` is os.tmpdir() or /tmp" and T's root sentence with:
> - Roots are fixed and never read from the environment:
>   - POSIX S root is `/tmp`; POSIX T roots are `/tmp` and `/var/tmp`;
>   - darwin additionally has os.tmpdir() only when its realpath is under `/private/var/folders/`;
>   - win32 S and T root is os.tmpdir() only when it equals `<homedir>\AppData\Local\Temp`, case-insensitively; otherwise S/T refuse on that host.
>
>   reclaim never reads `DELEGATION_SCRATCH_ROOTS`. C1 takes `roots` from its caller, and work-record keeps passing its own list unchanged.
> - On POSIX, the `claude-<uid>` directory (S) and the `delegation-*` top directory (T) must be owned by process.getuid() and not group- or world-writable.

## F7. MEDIUM: `..` in the raw argument reaches a different file in the kernel than the lexical check sees
Evidence (measured): with `T/delegation-y/link -> outside/deep`, the raw argument `T/delegation-y/link/../victim`:
- resolves lexically (path.resolve) to `T/delegation-y/victim`, which does not exist;
- resolves in the kernel to `outside/victim`: statSync succeeds, `realpathSync.native` = `/var/tmp/l59rt-rJ8G/outside/victim`, and `ls` lists its file.

Node's JS `realpathSync` is also lexical for `..` and threw ENOENT. work-record is safe only because every fs call takes `resolved`. Spec C2's "realpath and lstat run on the argument" invites passing the raw string.

Fix: replace C2's "A path argument is never followed outside its class root: ..." with:
> - An argument containing a `..` segment (split on `/` and `\`) is refused: `refused <arg>: contains ..`. Every fs call (lstat, realpath, the walk, rmSync) receives the `path.resolve()`d string, never the raw argument.
> - Test: `<T>/link/../victim` with link pointing outside is refused, and the outside dir survives.

## F8. MEDIUM: C1 inherits "is a directory", so reclaim cannot remove a scratch FILE; absent and cwd semantics are unpinned
Evidence:
- The work-record checks C1 copies "exactly" include `if (!lst.isDirectory()) ... refused` (work-record.mjs:2040-2042), and ENOENT returns `absent` (:2034-2036).
- Most rm prompts are `rm <file>`. Under C1 as written, `reclaim <scratch>/out.txt` is refused, agents fall back to rm, and the measure does not move.
- Nothing refuses a target that is, or contains, the caller's cwd. closeoutWorktree does refuse it (janitor.mjs:1295-1297).

Fix: add to C1:
> - Option `allowFile` (default false; work-record passes nothing, so its behaviour is unchanged). With `allowFile: true`, a regular file passes (symlinks are still refused).
> - reclaim passes `allowFile: true` for S and T.
> - ENOENT is `{ ok: false, absent: true }`. reclaim prints `absent <arg>`, does not count it as a refusal, and exits 0 when everything else succeeds.
> - reclaim refuses, in every class, a target that equals or contains process.cwd(), using `pathWithin` (janitor.mjs:1209).

## F9. MEDIUM: C4's "no allow-line mechanism in Codex found" is wrong
Evidence:
- The repo records a live Codex rules file: `C:/Users/benzh/.codex/rules/default.rules`, "136 allow rules" (docs/work/evidence/codex-readonly-source-diagnosis.md:57-60).
- Measured with codex-cli 0.158.0, `codex execpolicy check --rules <scratch>/probe.rules -- ...` against `prefix_rule(pattern = ["reclaim"], decision = "allow")`:
  - `reclaim /tmp/x` → `"decision":"allow"`;
  - bare `reclaim` → allow;
  - `reclaimer /x` → no match.

Fix: replace the ALLOW codex line in C4 with:
> - `ALLOW codex: prefix_rule(pattern = ["reclaim"], decision = "allow")  # append to ~/.codex/rules/default.rules`. Print only: `--write-allow` never writes Codex files (the packet asks to print the Codex equivalent).

## F10. MEDIUM: rule form and compound matching are asserted, not probed; invocation shape is unpinned
Evidence:
- Claude Code 2.1.285's `--help` gives the form as `"Bash(git *)"`. docs/specs/review-run-53/redteam.md:87 already requires the builder to "pin the exact rule syntax by probe" for the same reason. The `:*` suffix is the legacy spelling.
- The allow only matches a command that starts with the bare word `reclaim`. `node scripts/reclaim.mjs ...` or `~/.local/bin/reclaim ...` still prompt, and C5 does not say so.
- Answer to the brief's question: Claude Code's documented behaviour splits compound commands, so `reclaim /p && rm -rf ~` needs the `rm` part allowed on its own. The `Bash(reclaim *)` allow does not cover it, and on Linux delete-guard also denies it for subagents (hooks/delete-guard.mjs:3-12). I could not probe this without starting a session, so it must be probed.

Fix: replace "`ALLOW claude: Bash(reclaim:*)`" throughout C4 with `Bash(reclaim *)`, and add:
> - "Line present" means `permissions.allow` already contains `Bash(reclaim *)` or `Bash(reclaim:*)`. If `permissions.deny` or `permissions.ask` holds any rule starting with `Bash(reclaim`, print `WARN <path>: a deny/ask rule shadows reclaim` and do not write.
> - Probe P-allow, run once by the builder with `claude -p --settings <scratch settings holding only the allow line> --permission-mode default` in a scratch cwd, recorded in the build report. Each command is expected to prompt or deny unless marked allowed:
>   - `reclaim /nonexistent` is allowed;
>   - `reclaim /x && touch <scratch>/p1`;
>   - `reclaim /x; touch <scratch>/p2`;
>   - `reclaim $(touch <scratch>/p3)`;
>   - `reclaim /x > <scratch>/p4`;
>   - `FOO=1 reclaim /x`.
>
>   None of p1-p4 may exist afterwards. If any does, the allow line is not shipped and the lane reports it.
> - C5's contract line reads: "remove with bare `reclaim <path>` (never a path to the script, never `node .../reclaim.mjs`, never rm)".

## F11. MEDIUM: `--write-allow` write hazards: symlinked settings, mode widening, secret echo, reformatting, and backup placement
Evidence:
- chezmoi check: `chezmoi managed --include=files` omits chezmoi-managed SYMLINKS. The atomic rename then replaces a symlink with a regular file and silently unlinks the file from whatever syncs it (chezmoi `symlink_`, stow).
- Measured, mode: a fresh `writeFileSync` temp file is 664 while a 600 original stays 600 on copy. The rename widens a 600 settings.json (which may carry an `env` block) to 664. This host is 664 already; the other hosts are unknown.
- Measured, echo: `JSON.parse` errors quote the input, e.g. `Unexpected token 'p', "{"a": plainword-"... is not valid JSON`. A `SKIP <path>: <reason>` built from `err.message` prints a fragment of settings.json.
- "the other keys preserved byte-for-byte" (Tests: mirror) cannot hold through parse/stringify unless the file already round-trips byte-identically.
- Backup `settings.json.bak-<stamp>` in `~/.claude` is machine-specific state inside a chezmoi-watched tree (lean rules: never write machine-specific state into ~/.claude). A later `chezmoi add ~/.claude` would sweep a copy of settings, secrets included, into the dotfiles repo.
- Claude Code itself writes this file ("always allow", /config). A read-modify-rename can drop a concurrent write.
- On Windows, the rename over a file another process holds open fails with EPERM/EBUSY.

Fix: replace C4's condition list and "The write:" block with:
> - Writes only when ALL hold:
>   - `lstat` shows a regular file, not a symlink;
>   - it parses as JSON;
>   - `JSON.stringify(parsed, null, 2) + "\n"` equals the file's bytes exactly, after normalising CRLF to LF for the comparison only (otherwise `SKIP <path>: formatting would change`);
>   - the line is absent (F10's definition);
>   - chezmoi does not manage it. When `chezmoi` is on PATH, `chezmoi managed --include=files,symlinks` (30 s timeout) must not list `.claude/settings.json`, compared after `\`→`/` and, on win32, lower-casing. When chezmoi is not on PATH but `~/.local/share/chezmoi` exists, SKIP. An error or timeout means SKIP.
> - SKIP reasons are fixed strings (`absent`, `not a regular file`, `not valid JSON`, `formatting would change`, `line present`, `chezmoi-managed`, `chezmoi check failed`, `changed during write`, `rename failed`). Never `err.message`, never file content.
> - The write:
>   - adds the line to `permissions.allow`, creating `permissions` and/or `allow` if absent;
>   - writes the temp file `settings.json.tmp-<pid>` in the same directory with flag `wx`, then `chmodSync` to the original's `mode & 0o777`;
>   - re-reads the original just before rename and SKIPs (removing its own temp file) if the bytes changed;
>   - renames with up to 3 attempts 200 ms apart on EPERM/EBUSY/EACCES, otherwise removes its temp file and SKIPs;
>   - backs up to `~/.agents/rollout-backups/claude-settings.json.<UTC stamp>`, same mode, which janitor `--outside` already lists (janitor.mjs:1551).
> - Tests add: symlinked settings SKIP; 600 mode preserved; invalid JSON SKIP output contains none of the file's bytes; non-2-space file SKIP.

## F12. MEDIUM: the reclaim shim's target is unspecified and can point into a worktree janitor will delete (twin of the 2026-09-14 BLOCKER)
Evidence:
- Existing shims run the MIRRORED copy `~/.agents/skills/multi/scripts/<cmd>.mjs` (mirror-shared-skills.mjs:103-106).
- reclaim.mjs lives in `scripts/`, which the mirror does not publish. It also imports janitor.mjs, which imports project-config, wiring-check, work-record and transport, so a Windows copy-mode mirror of a skill dir cannot host it.
- "the installed plugin version" has no concrete path.
- The Codex hook solved the same problem with `path.join(REPO, ...)` behind `isDurablePath` (mirror-shared-skills.mjs:70-83, :686-702, :726). Running the mirror from a gate worktree repointed live homes at a directory "about to be deleted" twice on 2026-09-14 (:686-689).
- An unguarded shim does the same, and F1's daily act then deletes the target.

Fix: replace C2's "Shims:" block with:
> - `reclaim` joins the PATH shims with target `path.join(REPO, "scripts", "reclaim.mjs")`, not `shimTarget()`, so SHIM_SPECS gains a per-command target. It is written as `reclaim` on POSIX, and as `reclaim.cmd` plus extensionless `reclaim` on Windows (SHIM_SPECS, :114-116).
> - It is published only when `isDurablePath(REPO)`; otherwise the mirror prints `SKIP reclaim shim: <REPO> is not durable` and leaves any existing shim untouched.
> - Test: a mirror run from a scratch REPO writes no reclaim shim.

## F13. LOW: the C5 scratch convention `mktemp -d /var/tmp/delegation-<name>-XXXX` is POSIX-only
Evidence: Windows sessions run in Git Bash (mirror-shared-skills.mjs:108-112). The spec's own T root on Windows is os.tmpdir() only. Where `/var/tmp` lands in Git Bash is unmeasured, and it is not `%TEMP%`.

Fix: replace the C5 contract line with:
> - agent scratch goes in `mktemp -d /var/tmp/delegation-<name>-XXXX` on Linux and macOS, and in `mktemp -d -t delegation-<name>-XXXX` on Windows Git Bash (lands in %TEMP%; the Windows gate records `cygpath -w` of one such dir and checks it equals os.tmpdir()'s child); removal is bare `reclaim <path>`, never rm.

## F14. LOW: kill switch mechanics are unpinned, and reclaim has no switch
Evidence:
- The existing switches go through `switchedOff(name)`, which honours `AGENTS_HOME` (project-config.mjs:57-62, the path tests use) and treats any stat error other than ENOENT/ENOTDIR as "present".
- Spec C3 hard-codes `~/.agents/ws-off-janitor-act` and says "on the record's first line". The record is JSON, whose first line is `{`.
- A new prompt-free deleter has no host-local off switch short of editing settings.

Fix: replace C3's kill-switch bullet with:
> - `switchedOff("janitor-act")` true: `--apply` is treated as not given. The record's `"act"` is `"switched-off"` (F2), and the report's first line is `janitor: act switched off (~/.agents/ws-off-janitor-act)`. An unreadable switch path counts as present, so an error fails safe to record-only.
> - reclaim checks `switchedOff("reclaim")` first. If true, it refuses every argument with `reclaim switched off` and exits 3.

## F15. LOW: more parts than needed
Evidence and fixes:
- **`--record-only` duplicates the kill switch.** It needs a reinstall on four hosts; the switch file needs none. Delete the C3 sentence "The installer's new `--record-only` flag restores today's argv." and the `--record-only` test. The kill switch is the only off path.
- **T1's janitor.mjs edit is not needed.** `classify` (janitor.mjs:621), `gatherState` (:976), `applySafe` (:1083), `pathWithin` (:1209) and `closeoutWorktree` (:1223) are already exported. Delete T1's bullet "scripts/janitor.mjs, only exporting ..." and the "janitor.mjs split" coordination paragraph. T2 owns every janitor.mjs edit: the kill switch, F1's idle floor, F2's record.
- **`--json` on reclaim has no consumer.** Usage becomes `reclaim [--dry-run] <path>... | --branch <name> --repo <dir>`.

## F16. LOW: "tree fully clean" misses skip-worktree and assume-unchanged edits, and a gap exists between the check and removal
Evidence:
- Measured: a tracked file with `git update-index --skip-worktree` and a local edit gave empty `status --porcelain --untracked-files=all --ignored=matching`. Unforced `git worktree remove` then exited 0 and the edit was gone.
- isTreeClean runs at gather time (janitor.mjs:998). Removal happens after every other branch has been classified.

Fix: add to C3:
> - isTreeClean also requires `git ls-files -v` to show no line tagged with a lowercase letter (assume-unchanged) or `S` (skip-worktree). applySafe re-runs isTreeClean on each worktree immediately before `git worktree remove` and logs `skipped: tree changed since classify` on false.
> - Test: the skip-worktree fixture above is JUDGMENT.

## F17. LOW: W/B single-target details and the efficacy baseline
Evidence:
- "a path that `git worktree list` in its repo names" does not say which root classify() runs from. classify skips the root and its current branch (janitor.mjs:650-653), so a root chosen from the target itself makes every W refusal vacuous.
- The packet's baseline "236 secret-guard plus rm denials" mixes denials this lane cannot move: the secret guard is out of scope under NOT.

Fix: add to C2's W bullet:
> - The root is the main worktree of the target's repo: first entry of `git -C <target> worktree list --porcelain`. reclaim runs `gatherState({root, config: loadProjectConfig(root).config})` and removes only if the target is in `state.safe.worktrees` and passes F1's idle floor and F8's cwd check. It removes through `applySafe` with a state narrowed to that one row and `branches: []` (the closeoutWorktree pattern, janitor.mjs:1328-1333).
> - B uses the same gatherState and passes `applySafe` a state narrowed to that one branch row.

Replace the lane's measure sentence with:
> - Measure: work lost or stalled. Baseline and read-back count rm-class prompts and denials only: `rm`, delete-guard denials and `Remove-Item`. Secret-guard denials are reported separately, since this lane does not touch them.

---

## Answers to the brief's questions, and verified absences
1. **Classes S and T.**
   - Symlinks and junctions on POSIX: an inner symlink is not followed (measured), and a symlinked target or ancestor is refused by lstat plus realpath equality. Junctions on Windows are unverified: lstat reports them as symlinks at the top level, and an inner junction needs F3's Windows gate test.
   - `..`: F7.
   - Case-insensitive filesystems: case mismatches refuse (the safe direction) on macOS. On win32 comparisons fold case (work-record.mjs:1995), which is correct. There is no false-accept path, because acceptance needs a prefix match on real paths.
   - TMPDIR differences between processes: F6.
   - The `claude-<uid>` segment on Windows: F4.
   - `/var/tmp/delegation-*` owned by another user: already refused by the owner check. F6 adds the mode check.
   - Another session's scratch: not acceptable. F5 scopes S to the caller's own session.
   - Hard links: safe (measured).
   - TOCTOU: the residual window between check and rmSync needs write access to an ancestor. Every ancestor is either uid-owned and mode 700 (`/tmp/claude-1000`, measured) or a sticky root (`/tmp`, `/var/tmp` are 1777, measured) where another uid cannot rename the user's directory. So only the same uid can exploit it, which is accepted and should be stated in the spec as such.
   - Mount points: F3 (measured deletion).
2. **W and B, verified sound.**
   - "Tree fully clean" counts ignored files: `--untracked-files=all --ignored=matching` (janitor.mjs:327-333). Measured: an ignored `node_modules/` makes the tree not clean, so a worktree with node_modules or other ignored config is never SAFE.
   - The only gaps are F16 and F17.
3. **C3.**
   - Hosts sharing only origin cannot interfere. Each acts on its own worktrees and local refs, and origin deletion stays report-only (janitor.mjs:850-859).
   - A stale fetch cannot produce SAFE. Every run fetches, a failure downgrades everything to UNVERIFIABLE (:688-692), and `-D` re-checks a live fetch and the tip (:1136-1157). Verified.
   - Netcup's detached parked checkout is the main worktree, never a candidate (:653). Detached worktrees are never SAFE (:686). Verified.
   - A live agent's cwd is protected only when it is janitor's own root: F1.
   - Kill switch: F14.
4. **C4.**
   - Rule form and compound commands: F10.
   - `~/.claude/settings.json` is the right user-scope file. Claude Code's documented user scope has no user-level `settings.local.json`, and the packet's "local" reads as "this machine's". chezmoi does not list it on this host (measured: `.claude/hooks/...` are listed, `.claude/settings*` count 0 with `--include=files,symlinks`). It is a regular file here.
   - The chezmoi check, backup and atomic write on Windows: F11.
5. **Parts and gaps.** Parts to cut are in F15. Gaps are F1, F2, F3, F5 and F12.

Scratch left at /var/tmp/l59rt-rJ8G (probe fixtures only, no repo content).
