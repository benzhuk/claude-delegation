---
name: janitor
description: >-
  Use when a build, worktree, or run has finished and something needs cleaning up, before starting a new build in a project that hasn't been swept in a while, or when asked what's stale, what's using disk, or what can be removed. Reports two classes, SAFE and JUDGMENT, and only ever acts on SAFE. NOT a replacement for a builder's own cleanup: a builder that leaves a worktree behind still has to say so, by name, in its report.
---

# Janitor: mechanical cleanup, two classes, one owner call

Cleanup is nobody's job by default, so it doesn't happen. This skill makes it a
five-second check: run `node <plugin>/scripts/janitor.mjs` from the project root, read
two short tables and four numbers, done. This skill is mirrored to
`~/.agents/skills/janitor` for Codex the same way the other shared skills are; the
script itself stays in the plugin checkout and is invoked there by its absolute path -
only this skill text is mirrored.

## janitor never deletes a file

This is the load-bearing fact, stated plainly because two rounds of adversarial review
found working ways to make an earlier version delete the wrong one (a symlinked parent
directory that walked straight through a root-containment check; a registry line that
only had to claim `created_by_tool: true` to get a git-tracked file removed). Rather
than harden that check a third time, the capability was cut, and a round-1 review of
this build cut the artifact registry itself (nothing in the plugin ever wrote a line to
it, so it was a reader with no writer). janitor has exactly two destructive actions,
both delegated straight to git, on a whole worktree or a whole branch ref, never on an
individual file:
- `git worktree remove` (no force flag) - removes a worktree DIRECTORY, via git's own
  bookkeeping, not by walking the filesystem itself
- `git branch -D` - deletes a branch REF, and only once its own worktree removal (if it
  had one) has already succeeded - a partial or failed removal leaves the branch alone,
  because the branch may be the last copy of that work. The force form, on purpose: a
  branch reaches this point only after this run's own origin-ancestry proof (below) has
  already confirmed it merged on origin, so `-d`'s own merge-state check - which reads
  the CHECKOUT's local HEAD, not origin - would wrongly refuse exactly the branch
  janitor has just proven merged on origin (pushed, on a checkout whose local main is
  stale). That proof is re-read immediately before the delete too, not just when the
  report was first built: a tip that has moved since (a new local commit, in the window
  between the report and `--apply`) skips the delete instead of removing whatever the
  name now points at.

A tool with no unlink code path cannot delete the wrong file.

`work-record.mjs close --closeout` (documented in `docs/work-record.md`) is the one other
caller of these two actions, through `janitor.mjs`'s own `closeoutWorktree` export: once a
record's `Artifact:` is proven an ancestor of `origin/main`, it resolves that record's
`Worktree:` field the same way, calls `applySafe` with a state narrowed to exactly that one
worktree, and — never through `applySafe`'s own `-D` path — deletes the local branch
separately with `-d`, so a branch not yet fast-forwarded locally is merely refused, never
forced. It then does one more thing this file's own sweep never does: deletes the *origin*
branch itself (`git push --force-with-lease=refs/heads/<name>:<tip> origin :refs/heads/<name>`,
a lease on the sha it just proved merged), and the record's own `Scratch:` directory
(`fs.rmSync`) — the plugin's one file-delete path, gated by its own long list of path-safety
checks. Both live in `work-record.mjs`, not here, because both act on ONE record's own,
already-proven-safe artifact, never on a sweep's report-then-batch-ask shape below.

Origin is the record of truth for every merge judgment, not the checkout's local main.
Every run that will judge a merge fetches first (`git fetch origin --prune`); merged
means an ancestor of `refs/remotes/origin/<main>` - local main plays no part in SAFE,
whatever it contains. A fetch that fails this run (offline, no origin remote, a partial
fetch that errored, or a network timeout) downgrades every merge judgment - worktree,
branch, and the report-only remote-branch table alike - to UNVERIFIABLE, never to SAFE,
and the report says so on its own first lines: a stale or absent origin ref proves
nothing once this run couldn't refresh it. `--no-fetch` skips that call and is
report-only: every verdict resting on origin ancestry is labelled "as of last fetch,
`<age>`" (read from `origin/<main>`'s own reflog, or `FETCH_HEAD`'s mtime, but only when
`FETCH_HEAD`'s own content proves it was `<main>` that got fetched to its current tip -
`FETCH_HEAD` is rewritten by a fetch of any remote or branch, so an unqualified mtime
read could label a 5-day-stale origin "1m ago"); `--apply` refuses to run at all under
`--no-fetch`, since `-D` must never act on a merge judgment this run did not itself just
verify.

## The two classes

**SAFE**: a human would agree without looking.
- a git worktree that is not locked, not the main working tree, not the one janitor is
  running from, not checked out on a protected name (`main`, `master`, `develop`,
  `release`, `release/*`, `hotfix/*`, ...), whose branch's tip is confirmed on origin
  (an `origin/<main>` ref must exist, this run's own fetch of it must have succeeded,
  AND it must contain the branch's tip - with no origin remote at all, a fetch that
  failed, or `--no-fetch` in play, NOTHING is ever confirmed and NO worktree is ever
  SAFE for `--apply` to act on; see "no remote" below), has no submodules, and is fully
  clean including ignored files (`git status --porcelain --ignored`, not just tracked
  changes)
- a local branch confirmed on origin the same way, not a protected name, never the
  current branch, never main

**JUDGMENT**: the tool cannot prove it, a person has to look.
- a dirty worktree, including one that is clean by `git status` but holds ignored
  files with real content (build output, local config): both count
- a locked worktree (its lock reason is shown), or one with submodules
- a worktree OR a branch that is merged into LOCAL main but not confirmed on
  `origin/<main>` (no remote, a fetch that hasn't seen the tip yet, or the tip simply
  isn't there) - a stale local main never gets credit either way, only this exact wording
- a worktree OR a branch this run's fetch could not confirm at all, because the fetch
  itself failed (UNVERIFIABLE)
- an unmerged branch with no commit in 14 days
- a worktree checked out on a protected name, or a branch that is merged but carries a
  protected name (a bookmark IS an ancestor of main by construction; the name is the
  only signal it has one - true whether that name is a ref or a directory checked out
  on it)
- an untracked file matching the project's scratch patterns
- an UNSTARTED worktree or branch, whose tip equals `origin/<main>`'s tip (or has zero
  commits not on it), is reported as `unstarted (tip is main)` with its worktree's age,
  never as SAFE and never as "merged"
- anything younger than `--min-age-hours` (default 6) is never SAFE, whatever else is
  true, and is reported with its age

**No remote configured at all** is a real, common project shape (a fresh repo, a purely
local one), and under it the worktree class - and now the branch class too - is
permanently empty: nothing is ever confirmed as pushed, so nothing is ever SAFE. Read an
empty SAFE table as "nothing provably safe today," never as "nothing to clean."

Report-only is the default: with no flags janitor prints both tables plus four drift
numbers (disk used by the project root, worktree count, open local branch count,
untracked file count) and changes nothing. `--apply` acts on SAFE only. `--json` emits the
same safe/judgment/drift shape as machine-readable JSON instead of the printed tables,
for a caller that wants to parse the result. JUDGMENT is never executed automatically,
by this tool or by an agent reading its output. It is one batched question to the
owner, not N separate ones. Collect everything dispatchable first, then ask JUDGMENT as
ONE multiple-choice pass: "these N things look stale, keep or remove each?" Never
surface JUDGMENT items one at a time as they're found; never act on one without asking.

## What janitor will never do

No unlinking a file, ever - see above. No forced removal, no wiping of uncommitted
changes, no resetting a tree, no touching a work-in-progress shelf, no recursive delete
of a path it did not create. If it isn't sure, it reports and stops.

Reading state and destroying state follow different rules. While only reading, a crash,
a timeout, or state it can't parse is silent and exits clean (0), never a false claim of
safety - EXCEPT that an unreadable project config, or no git at all, is BLIND (exit 3,
one line on stderr), never silently reported as "nothing found."
Once `--apply` has taken even one destructive action, nothing is silent again: a later
failure prints everything already done before it, and the run exits 1 or 3, never 0.

## Definition of done, for any builder

A builder's work is not done when the code is green. It is done when:
1. the branch is pushed
2. the report is on disk
3. its worktree is either removed, or handed over by name to whoever owns it next

A worktree with no owner named is a JUDGMENT item forever. Naming it in the report is
what turns it into something janitor (or the next builder) can act on.

## Cadence: fed, not run on a whim

After every accepted build, the lane's integrator runs `janitor --record` and then
`janitor --apply`, in that order, and pastes the JUDGMENT table into the RESULT. Once a
day per host, the installed timer (below) now does the same, unattended — a node script,
never a Sonnet or Opus turn, so the SAFE class is kept down to zero at zero top-tier
token cost. JUDGMENT is never sent to the owner piecemeal: every JUDGMENT line from a run
goes to the owner's decisions page as ONE item, with a recommendation per line, never as
several separate asks.

A daily `--apply` only ever removes a SAFE item that has been idle at least 24 hours
(`idleHours()`, below) — newest of the worktree directory's own mtime, its git-admin
`HEAD`/`index`/`logs/HEAD`, and any matching Claude or Codex session activity: every
`<home>/.claude*/projects/<slug or slug-*>/` this host has (not only the plain
`~/.claude`), plus any Codex `rollout-*.jsonl` from a session started in the last 30
days whose own `cwd` is inside the worktree — a rollout stays in the date-dir of the day
its session started, however long it keeps writing after that, so the window is 30 days
of sessions, not 30 days of file activity; a session older than that falls through to
the open-process probe below. A worktree whose git state changed, or whose session or
shell wrote anything, in the last 24 hours is skipped, and a session source this run
cannot even read (permissions, a full disk, a network home) counts the whole worktree as
active too — never as idle. On top of the idle floor, a separate, cheap "is any
process's cwd inside this worktree right now" probe (`/proc/*/cwd` on Linux, `lsof` on
macOS, a rename probe on Windows) also runs immediately before removal, so an
idle-but-still-open shell survives too; when that probe itself fails to answer (no
`lsof` on PATH, a timeout), the worktree is skipped as "in-use check failed", not
reported as if a process were actually found.

## Installing the daily timer

`node <plugin>/scripts/install-janitor-timer.mjs` creates ONE host-native scheduled
entry — a systemd `--user` service+timer pair (`janitor-record.service`/`.timer`) on
Linux, a Task Scheduler task (`janitor-record`) on Windows, a launchd agent
(`com.delegation.janitor-record`) on macOS — that runs
`node <installed plugin>/scripts/janitor.mjs --record --repo <repo> --apply` once a day,
at 06:00 local time by default (`--hour <n>` to change it). The daily run acts, not just
reports: `--apply` is part of the scheduled command by default now (there is no installer
flag to remove it), and it only ever removes the SAFE class, only once idle at least 24
hours (see "Cadence" above). The one off switch is `~/.agents/ws-off-janitor-act`
(below), checked by `janitor.mjs` itself at run time — while it exists, a scheduled
`--apply` still writes its record and drift line, but removes nothing, and the report's
first line says so. The switch applies to every `--apply`, typed by hand or scheduled.

- **Which repo it watches**: `~/Code/zhuk-infra/claude-delegation` (the old `~/Code/claude-delegation`
  only when that path does not exist), or the path in
  `~/.agents/janitor-repo` if that file exists, or `--repo <path>` to override both. The installer
  refuses (no files written) when the janitor script or that repo does not exist, so a
  misconfigured host is told at install time rather than getting a green `installed.json` that
  will never actually run.
- **Which host name it records under**: the installing machine's own hostname, baked into the
  scheduled command at install time — stable even if the machine is later renamed — or `--host
  <name>` to set it explicitly.
- **Where the record lands**: the same place a manual `--record` already writes to —
  `docs/work/evidence/janitor/<date>-<host>.json` plus one appended `docs/work/evidence/
  janitor/drift.md` line, in the watched repo. Ben's page links `drift.md` directly, so
  a host that never installs this timer is a host whose drift line never updates on its
  own.
- **The timer's own log**: `~/.agents/janitor/last-run.log` (stdout+stderr, truncated
  every run — always today's run, never last week's).
- **Idempotent, self-repairing**: re-running the installer after a node upgrade (or a
  plugin move) rewrites the unit/task/plist with the new absolute node path; running it
  twice with nothing changed touches nothing. `--dry-run --json` previews every file
  it would write (or already matches) without writing anything at all.
- **`--remove`** deletes exactly what the installer made — every file it manages
  carries its own marker line, so a same-named file it did not create (something you
  wrote by hand) is left alone and reported, never overwritten or removed.
- **The daily act's own off switch**: `touch ~/.agents/ws-off-janitor-act` on a host, and
  the scheduled run there treats `--apply` as not given — it still writes its record and
  drift line (so drift.md keeps updating), and the run's report opens with
  `janitor: act switched off (~/.agents/ws-off-janitor-act)`. Remove the file to resume.
  This is separate from the older, blunter `~/.agents/ws-off`/`~/.agents/ws-off-janitor`
  switches, which still mean "no run at all."
- The installer never calls `systemctl`/`schtasks`/`launchctl` unless you pass
  `--enable`; without it, the files exist but the entry is not yet live — review them,
  then re-run with `--enable` (or run your platform's own enable command by hand) once
  you're satisfied.

## Cleanup is never chained onto productive work

Gated, permission-requiring cleanup (removing a worktree, deleting a branch, or a hand
`rm` on something janitor only ever reports) runs as its own standalone step, never
appended to a command that's doing real work. A build that ends "...and also let me
clean up" turns one permission prompt into a blocker for everything before it. Run the
build, report it, then run janitor separately, or leave the cleanup named and
unresolved for the next pass.

## Reclaim: the one allowlisted deleter

`janitor.mjs` itself never unlinks a file (see above) — but a session still hits real
`rm` prompts and denials for things that are provably safe to remove: its own scratchpad,
an agent's `delegation-<name>-XXXX` scratch dir, a worktree or branch janitor has already
classified SAFE. `reclaim` is a second, narrow tool that covers exactly those four
classes and nothing else, so an agent can clean up without a raw `rm`:

```
reclaim [--dry-run] <path>... | reclaim --branch <name> --repo <dir>
```

Always the bare `reclaim` shim, never `node scripts/reclaim.mjs ...` or a path to the
script — only the bare form matches the allow line below (F10).

- **S, session scratch** — strictly inside the CALLING session's own
  `<tmpdir>/claude-<uid>/<project>/<session>/scratchpad/` (the session id must match
  `CLAUDE_CODE_SESSION_ID`; the scratchpad directory itself is never removed, only its
  contents).
- **T, plugin temp** — a directory named `delegation-<name>-XXXX` directly under
  `os.tmpdir()` or `/var/tmp` (POSIX: owned by the current uid), or anything inside one.
  This is the agent-scratch convention (see `docs/subagent-contract.md`).
- **W, finished worktree** — a path `git worktree list` names in its repo, that
  `janitor.mjs`'s own `classify()` marks SAFE, AND that has been idle at least 24 hours
  (`idleHours()`, the same floor the daily act uses) — removed through janitor's own
  `git worktree remove`, never by hand.
- **B, merged local branch** — `--branch <name> --repo <dir>`, SAFE per `classify()`,
  removed through janitor's own `git branch -D`, its ancestry re-checked immediately
  before the delete.

Every argument is validated before anything is removed: one refusal among several
removes nothing. `--dry-run` prints `would-remove <class> <path> <tag>` and removes
nothing. A real removal prints `removed <S|T|W|B> <path-or-branch> <tip-sha-or-entry-
count>` — restorable by name from that line alone for a W/B removal (the tip sha is a
branch you can recreate with `git branch <name> <sha>`).

**The kill switch**: `touch ~/.agents/ws-off-reclaim` and every call refuses every
argument with `refused <arg>: reclaim switched off`, exit 3 — checked before any other
validation. Separate from, and in addition to, the daily act's own
`~/.agents/ws-off-janitor-act` switch above; reclaim is a tool a human or agent can
invoke any time, not only from the timer.

**The allow line**: without it, every `reclaim` call still prompts (or is denied) like
any other `Bash` tool call. `node scripts/mirror-shared-skills.mjs` prints both lines on
every run, and `--write-allow` adds them when the file exists, is not chezmoi-managed,
and does not already carry the line:
- Claude: `Bash(reclaim *)` in `permissions.allow` (`~/.claude/settings.json`) — the
  space form Claude Code 2.1.285 itself documents, not the legacy `Bash(reclaim:*)`
  colon form. A chained, substituted, or env-prefixed invocation
  (`reclaim /x && ...`, `reclaim $(...)`, `FOO=1 reclaim /x`) still prompts or is denied
  under this rule, exactly as it would for any other single-word Bash allow — only a
  bare `reclaim <args...>` (output redirection included) is covered.
- Codex: `prefix_rule(pattern = ["reclaim"], decision = "allow")` appended to
  `~/.codex/rules/default.rules` — measured against codex-cli 0.158.0.

Neither line is ever written by anything other than a human running
`mirror-shared-skills.mjs --write-allow` themselves; nothing in a build or a gate run
edits either file.

## Adapters

Tool-neutral by design: reads `.agents/project.json` for `main_branch` and
`scratch_patterns`, nothing project-specific. `git worktree` / `git branch` are the only
VCS assumed; `vcs: "none"` in project config makes every git-dependent check a silent
no-op. No adapter has been written for a non-git VCS; a project on one should either set
`vcs: "none"` (janitor stays silent) or extend the git wrappers in `janitor.mjs` behind
the same SAFE/JUDGMENT contract.
