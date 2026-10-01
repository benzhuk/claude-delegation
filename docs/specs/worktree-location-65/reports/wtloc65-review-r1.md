VERDICT: NEEDS_FIXES (5) b7fcaaee9fa287fbaed79f229912997f08b8b500

# wtloc65 review, round 1 (lane 65, worktree location rule)

Reviewed: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-worktree-location-65-wtloc65, branch build/worktree-location-65-wtloc65.
HEAD (my own `git rev-parse HEAD`): b7fcaaee9fa287fbaed79f229912997f08b8b500. Base 0a33fd52f00abcedf276a4e6497f66c61f5ba24b. Six commits, 19 files, +848/-32. Worktree `git status --porcelain` is empty.

Counts: 0 BLOCKER, 2 MAJOR, 3 MINOR.

## Gate re-run (it is real)
I re-ran the brief's file list myself (the 13 files in the builder's gate, worktree-location.test.mjs included), output to my scratch folder. The tail matches the builder's log exactly: `tests 807, pass 790, fail 0, cancelled 0, skipped 16, todo 1`, exit 0. The only `✖` lines are the `probe` fixture that scripts/run-tests.test.mjs spawns on purpose.

## Guard incident (reported verbatim, not routed around)
My first live probe script built a child env by copying the process env so it could point HOME at a fixture home for the CLI. The secret guard refused it:
`PreToolUse:Bash hook error: [C:/Users/benzh/.claude/hooks/secret-guard.sh pretooluse]: SECRET-GUARD: blocked — command dumps the process environment. Use ~/.claude/scripts/secret-tool.sh (check|fingerprint|sync|set|grep-safe|scrub) — it never prints values. To read a non-secret part of that file, copy the needed non-secret lines via secret-tool grep-safe.`
I dropped that step and did not run the CLI with a modified env by any other route. Instead I called `decide()` in-process with an injected fixture `home` and `fsImpl` (no env handling at all), against a `git init` fixture repo plus a real linked worktree created with `--orphan`, so no commit and no identity. The builder's CLI test covers the CLI path, and it passed in my re-run (R4 CLI, gate log line 379).

## Findings

### 1. MAJOR: a `cd` / `pushd` / `Set-Location` earlier in the same command defeats R4 (false allow, plus a false hard deny)
Evidence: hooks/worktree-location.mjs:242 (`let dir = callCwd;`) resolves the operand against the hook's `cwd` and any `git -C`, and ignores any directory change that runs earlier in the same command. I ran these in-process against a fixture repo `<B>/Code/repo` and its linked worktree LANE = `<repo>/.claude/worktrees/lane`:
```
[Bash] cwd=LANE | "cd <B>/Code/repo && git worktree add ../cd-escape -b y" -> allow      (git really creates <B>/Code/cd-escape: outside)
[PowerShell] cwd=LANE | "Set-Location <B>/Code/repo; git worktree add ../sl-escape" -> allow
[Bash] cwd=LANE | "pushd <B>/Code/repo && git worktree add ../pd-escape" -> allow
[Bash] cwd=REPO | "cd .claude/worktrees && git worktree add wt-legit" -> DENY Use <B>/Code/repo/.claude/worktrees/wt-legit.  (the exact path it was about to create)
```
This is the named failure class: the guard passes because it is not looking. The setup is a realistic one. A lead or agent whose session cwd is an integration worktree under the folder (this repo's normal layout) runs `cd <main checkout> && git worktree add ../wt-x`. The guard resolves `../wt-x` against the integration worktree, lands inside the folder, and allows it. The real worktree is created as a sibling of the repo in `Code/zhuk-infra/`.
Fix (mechanical). Add a module-level regex next to `VALUE_FLAGS`:
```js
/** A directory change earlier in the same command: git sees the cwd it leaves behind. */
const CD_RE = new RegExp(String.raw`(?:^|[;&|\n(])\s*(?:cd|pushd|chdir|set-location|sl|push-location)(?:\s+(?:-(?:literal)?path\s+)?(${VAL}))?(?=\s*(?:$|[;&|\n)]))`, 'gi');
```
In checkBashWorktreeAdd, exact current code (l.242-244):
```js
      let dir = callCwd;
      let ok = true;
      for (const c of globals.matchAll(new RegExp(String.raw`-C\s*(${VAL})`, 'g'))) {
```
Replacement:
```js
      let dir = callCwd;
      let ok = true;
      for (const c of command.slice(0, segStart[m.index]).matchAll(CD_RE)) {
        if (inQuote[c.index]) continue; // `echo "x; cd /y"` is text, not a directory change
        const v = (c[1] ?? '~').replace(/^(["'])(.*)\1$/, '$2');
        if (v === '-' || UNRESOLVABLE_RE.test(v)) { ok = false; break; } // `cd -`, `cd $X`: cannot place, allow
        dir = joinFrom(dir, expandHome(v, home), platform);
      }
      if (!ok) continue;
      for (const c of globals.matchAll(new RegExp(String.raw`-C\s*(${VAL})`, 'g'))) {
```
Predicted outcome. LANE cwd with `cd <repo> && git worktree add ../cd-escape` gives dir = `<repo>`, target = `<B>/Code/cd-escape`, and a DENY naming `<repo>/.claude/worktrees/cd-escape`. The same goes for Set-Location and pushd. REPO cwd with `cd .claude/worktrees && git worktree add wt-legit` is allowed. REPO cwd with `cd .. && git worktree add wt-cd` is allowed, because `<B>/Code` is not a repo and real git refuses it anyway. Subshell scoping (`(cd x) && git ...`) is not modelled; it errs toward judging, which is acceptable. Add these four cases to hooks/worktree-location.test.mjs, reusing the linked-worktree `gitRunner` stub pattern at :96-107.

### 2. MAJOR: a Bash line continuation turns a correct in-folder command into a hard deny
Evidence: argTokens (hooks/worktree-location.mjs:180) stops at `\n` as a separator, so the `\` before it becomes the path operand. `joinFrom` makes that `/`, which is not inside the folder, so R4 denies, and the deny text names `<name>` because `basename('/')` is empty:
```
[Bash] "git worktree add \\\n  .claude/worktrees/cont -b y" -> DENY Use <B>/Code/repo/.claude/worktrees/<name>.
[Bash] "git worktree add -b y \\\n  .claude/worktrees/cont2" -> DENY Use <B>/Code/repo/.claude/worktrees/<name>.
[PowerShell] "git worktree add `\n  .claude/worktrees/ps-cont -b y" -> allow   (backtick operand hits UNRESOLVABLE_RE: an outside path written this way is never judged)
```
This is a hard deny (enforce file ignored) on a correct command. It contradicts the module's own stated posture at :15-17 ("A guard that can guess wrong must guess allow"), and the deny gives the agent no usable path. Multi-line `git worktree add \` commands with flags are a normal shape for setup steps.
Fix (mechanical). In argTokens, exact current code:
```js
    } else if (SEPARATORS.has(c) || c === ')') {
      break;
```
Replacement:
```js
    } else if ((c === '\\' || c === '`') && (command[i + 1] === '\n' || (command[i + 1] === '\r' && command[i + 2] === '\n'))) {
      if (cur !== null) { tokens.push(cur); cur = null; } // a line continuation is whitespace
      i += command[i + 1] === '\r' ? 2 : 1;
    } else if (SEPARATORS.has(c) || c === ')') {
      break;
```
Belt-and-braces, in checkBashWorktreeAdd after `const target = joinFrom(...)` (l.253), add `if (!path.posix.basename(target)) continue; // a root or empty operand is a parse miss, not a placement`.
Predicted outcome: both `\` cases are allowed, `git worktree add \<nl> ../cont-out` is denied and names `cont-out`, and the PowerShell backtick case is judged as well. Add the three cases to the test.

### 3. MINOR: the Agent arm misses the house mandate formats and can hard-deny a mandate that creates nothing
Evidence: WORKTREE_LINE_RE (hooks/worktree-location.mjs:268) matches only a line-start `Worktree:` and only the first one (no `g` flag).
- This repo's own generator writes `Worktree:` mid-line: skills/team-build/references/build-loop-workflow.js:237, :239, :284, :338 (`Build territory ${t.id}. Brief: ... Worktree: ${t.worktree}. Gate: ...`). Probe: `"Build territory t1. Brief: b.md. Worktree: <B>/Code/wt-sib. Gate: g."` is allowed. The builder-brief style `- Your worktree: <B>/Code/wt-sib2, branch b` is also allowed, and so is `Worktree: none\nWorktree: <B>/Code/wt-second`. The Agent arm therefore never fires on the mandates this repo actually produces. The Bash arm still catches the setup step's `git worktree add <abs>`, so the guard as a whole still holds, which is why this is MINOR.
- It accepts any `/.claude/worktrees/` segment, including the home config dir: `Worktree: <home>/.claude/worktrees/x` is allowed. The builder disclosed this.
- The opposite risk: a reviewer or cleanup runner whose mandate names an EXISTING stray worktree (`Worktree: C:/Users/benzh/Code/wt-old`, line start) is hard-denied, although nothing is being created. Spec item 1 refuses a worktree *created* outside.
Fix (judgment): scan every `Worktree:` occurrence (global regex, line-start or after `. `), and allow when the named path already exists (`fsImpl.existsSync(target)`), because it is not a creation. Or narrow the module header and team-build's sentence to say the Agent arm is advisory hygiene and the Bash arm is the enforcement. Either way, add a test with the build-loop's exact mid-line prompt shape.

### 4. MINOR: executable spellings and comments
Evidence (probe):
```
[Bash] "Git worktree add ../capital" -> allow
[PowerShell] "& \"C:\\Program Files\\Git\\cmd\\git.exe\" worktree add ../fullpath" -> allow
[Bash] "git worktree add .claude/worktrees/x -b y # then later git worktree add ../z" -> DENY Use .../.claude/worktrees/z.
```
WORKTREE_ADD_RE (:163-166) is case-sensitive on `git`, but PowerShell and NTFS resolve `Git` to git.exe. A quoted full-path git.exe has its match index inside a quote, and `&` is not in EXECUTOR_HEAD_RE (:160), so it is skipped as prose. A `#` comment is judged as a command.
Fix: change `\bgit(?:\.exe)?` to `\b[Gg][Ii][Tt](?:\.[Ee][Xx][Ee])?`. When `inQuote[m.index]`, also accept the match if the quoted span is a path ending in `git(.exe)` closed right before ` worktree` and the head matches `/^\s*&?\s*["']?[^"']*$/`. In the stripHeredocs pre-pass, drop an unquoted `#` (at line start or after whitespace) through end of line.

### 5. MINOR: stale doc comment
hooks/agent-dispatch-guard.mjs:531 still reads `Evaluation order is R0-stale, R1, R1b, R2, R3`. decide() now runs R4 between R0-stale and R1 (:553).
Patch: `Evaluation order is R0-stale, R1, R1b, R2, R3, exactly as the spec lists them` -> `Evaluation order is R0-stale, R4 (lane 65), R1, R1b, R2, R3 (R0-stale and R1-R3 as the spec lists them`. Close the parenthesis after the existing R0-stale note.

## Verified absences (attack brief, item by item)

Item 1 (beyond findings 1-4), all checked in-process against a real fixture repo and a real linked worktree:
- `git worktree add ../x -b y` from the repo is denied and names `<repo>/.claude/worktrees/x`. `git -C <repo> worktree add <abs outside>` from an unrelated cwd is denied. From the linked worktree LANE, `../x2` lands in the folder and is allowed, while `../../../x3` is denied and names the MAIN checkout's folder (not LANE's).
- Prefix and traversal: `.claude/worktrees-evil/x` and `.claude/worktrees/../x` are both denied. `.claude/worktrees` and `.claude/worktrees/` (the folder itself) are denied. No prefix, trailing separator or `..` defeat found: insideFolder appends `/` to the root and normalizes the target first (:105-111).
- Spelling: Windows backslash absolute, quoted backslash with a backslash cwd, upper-cased full path (`.CLAUDE/Worktrees`), and Git Bash `/c/...` are all allowed under the folder. `/c/.../repo/../out` is denied. PowerShell `..\ps-x` is denied, and `.claude\worktrees\ps-ok` with a backslash cwd is allowed. Quoted paths with spaces, both `"` and `'`, resolve correctly and are named correctly.
- Flags: `-b/-B/--orphan/--lock --reason "a b"/-q/--detach/--` all find the right operand. Redirections (`> /dev/null`, `2>&1 | tail`) do not confuse it. `time`, `sudo`, `(subshell)` and `echo hi; git worktree add` are judged. A chain with one good and one bad add is denied on the bad one in either order.
- Fail open: a non-git cwd, an empty cwd, `$VAR`, `$(..)`, `--git-dir`, and a throwing gitRunner all allow (and in the builder's test).
- Kill switch: `~/.agents/no-dispatch-guard` gives `{"action":"allow","skip":true,...}`.
- Malformed stdin: runCli returns before decide on unparseable JSON (agent-dispatch-guard.mjs, the readStdin try/catch), and isMain exits 0 on any rejection. Code-read only, because of the guard incident above; the builder's CLI test exercises the printed path.
- R0-stale/R1/R1b/R2/R3: in agent-dispatch-guard.mjs the diff touches only the header comment, the import, the R4 block after R0-stale, and the CLI's Bash early return. No rule text or order changed. agent-dispatch-guard.test.mjs changes only the R0 CLI copy list (it adds worktree-location.mjs). R0-stale, R1, R1b, R3 and resume-notice all gate on `tool_name` Agent or SendMessage (:224, :235, :250-252, :301, :439, :486), so a Bash payload can reach no rule but R4. Bash calls with no R4 hit print nothing and log nothing (:644).
- Matcher widening: only the dispatch-guard group changed (`Agent|SendMessage|Bash|PowerShell`). The delete-guard group is still its own `Bash|PowerShell` group. skills/multi/scripts/hooks.test.mjs, wiring-check, native-package, codex-hook-trust, codex-unsupported and mirror-shared-skills all pass in my re-run. Cost noted, not a finding: one extra node cold start per Bash/PowerShell call (the builder disclosed it). The cross-hook seam is the seam reviewer's.

Item 2: the three item-2 tests in scripts/janitor.test.mjs (gate lines 851-853) build a real merged, clean, aged worktree at `<repo>/.claude/worktrees/<name>`. It is SAFE. The dirty one is JUDGMENT, and the young one is not SAFE at a 1000000h floor. The no-demotion test confirms an outside worktree is still SAFE. Every `--apply` in the new tests runs `main(..., { cwd: root, home })` with `root = initRepo()` (a temp fixture) and a mkTmp home, so `--apply` never reaches a real repo or the real home.

Item 3: `.gitignore` line 3 is `.claude/worktrees/`, and no `.claude/` line exists. `git ls-files .claude/settings.json` still lists it, and `git check-ignore -v` ignores `.claude/worktrees/x/y` but not settings.json. The walkTestFiles test asserts deepEqual to exactly two real files, so removing `.claude` from EXCLUDED_DIRS (scripts/run-tests.mjs:26) pulls in the `.claude/worktrees/...` copies and fails it (checked by inspection of :147-157).

Item 4: `.claude/worktrees` appears exactly once in each of agents/builder.md, agents/runner.md, skills/team-build/SKILL.md, skills/delegate/SKILL.md and docs/pane-setup.md. In both agent files it sits below `<!-- safety-block:end -->`. The agents.test.mjs pinned-block tests pass.

Item 5: resolveRepo (scripts/install-janitor-timer.mjs:149-166): `--repo` wins, then the override file, then the new path if `exists(moved)`, else the old path. A throwing `exists` counts as absent. All four tests pass. My own sweep, `git grep -nIE "Code[/\\\\]+claude-delegation" -- . ':!docs' ':!*.test.mjs'` plus a `Code.{0,4}claude-delegation` pass over .mjs/.js/.sh/.ps1/.json/.toml/.tmpl and a `Code-claude-delegation` slug pass, found only the builder's list: install-janitor-timer.mjs:146 and :533 (fallback text), decisions-pickup.mjs:637 (history comment), skills/janitor/SKILL.md:191 (fallback text), and build-loop-args.example.json:10 and :13 (example values; :13 is a projects-slug example the builder's grep did not print, also not live). No live hit missed.

Item 7: `defaultRecordDir(home)` = `<home>/.agents/janitor-evidence` (janitor.mjs:142). A bare `--record`, or `--record` followed by `--repo` (the scheduled argv at install-janitor-timer.mjs:198), resolves to it through `parseFlags(argv, home)`. writeRecord creates the dir recursively and keeps the `wx` create-only write (:2082). The same-day collision test (gate line 856) still passes. The `home` passed into applySafe is the same `os.homedir()` that idleHours already defaulted to, so production behavior is unchanged. The four item-7 tests (gate lines 847-850) prove: json and drift.md both land under the injected home; an explicit absolute and an explicit relative `--record <dir>` still write exactly there and leave the default untouched; and the scheduled argv shape, including a run that reclaims a worktree under the folder, leaves `git status --porcelain` empty on a clean fixture. docs/work/evidence/janitor/drift.md is unchanged in the diff and left frozen. SKILL.md's "Where the record lands" and Cadence text match the code. Nothing in skills/ or scripts/ writes the tracked path.

Cause fix or compensation: items 5 and 7 are cause fixes (the default moved, not a cleanup after the fact). R4's Bash arm is a cause-side guard. Its two MAJOR gaps are parsing gaps, not compensations.

## C4 fields (item 7 is the bug-fix part of this lane)
Cause: the janitor's bare `--record` default was the tracked `docs/work/evidence/janitor/` (old janitor.mjs l.133 DEFAULT_RECORD_DIR), so every daily scheduled run appended to the tracked drift.md in each durable checkout, and `git pull --ff-only` refused on Netcup and Hetzner.
Discriminating check: scripts/janitor.test.mjs "lane 65 item 7: the scheduled argv (bare --record, --host, --apply) on a clean fixture repo leaves `git status --porcelain` empty". With the old default, it fails on the untracked docs/ json and drift.md in porcelain, and on the missing `~/.agents/janitor-evidence` readdir.
Fix location: scripts/janitor.mjs `defaultRecordDir` (:139-144), `parseFlags(argv, home)` (:2160-2180), and `main`'s injectable `home` (:2214).
Simplification: none further needed. The fix replaces one constant with one home-based function; writeRecord is untouched.
