VERDICT: NEEDS_FIXES (4) 9526ad717af1a09a151ad2ed4fe8421be45a7515

# wtloc65 review, round 2 (delta re-review of the r1 fix round)

Reviewed: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-worktree-location-65-wtloc65, branch build/worktree-location-65-wtloc65.
HEAD (my own `git rev-parse HEAD`): 9526ad717af1a09a151ad2ed4fe8421be45a7515. Delta: b7fcaaee..HEAD is one commit (9526ad71), 3 files, +164/-23 (hooks/worktree-location.mjs, hooks/worktree-location.test.mjs, hooks/agent-dispatch-guard.mjs comment only). Worktree `git status --porcelain` is empty before and after my review.

Counts: 0 BLOCKER, 1 MAJOR, 3 MINOR. Two of the MINORs are regressions the fix round introduced.

## Gate re-run (it is real)
I re-ran the brief's 13-file list myself, with output going to my scratch folder. The tail matches the builder's round-2 numbers exactly: `tests 811, pass 794, fail 0, cancelled 0, skipped 16, todo 1`, exit 0. The only `✖` lines are the deliberate `probe` fixture spawned by scripts/run-tests.test.mjs.

## Method
All live checks ran in-process (`decide()` / `checkBashWorktreeAdd` / `checkAgentWorktree`) with a fixture home. I used a `git init` fixture repo under my scratch folder plus a real linked worktree, created with `git worktree add --orphan` at `<repo>/.claude/worktrees/lane` (LANE). The git was real, not a stub. To check the suggested patches I used a `git archive HEAD` copy in scratch, never the reviewed tree. I made no env copies, and no guard denied anything this round.

## Prior findings: status

| r1 | Status |
|---|---|
| 1 MAJOR cd/pushd/Set-Location | PARTIAL. Fixed for `cd X && git ...` and `cd X<newline>git ...`. NOT fixed for `cd X; git ...` or `Set-Location X; git ...`, which is the standard PowerShell spelling and a common Bash one. The new test passes only because its stub hides the miss. See finding 1 below. |
| 2 MAJOR line continuation | FIXED. `\`+LF, `\`+CRLF and PowerShell backtick+LF are all whitespace now. In-folder continuations are allowed, and `../cont-out` is denied and named correctly. A bare `/` operand is skipped. |
| 3 MINOR Agent arm formats | FIXED for the build-loop mid-line shape (`Build territory t1. Brief: b. Worktree: <p>. Gate: g.` is denied and names `wt-sib`), `- Your worktree:` and a second line-start `Worktree:`. An existing path is allowed. The header and doc now call the arm advisory. But the same commit broke backslash relative paths: see finding 3. |
| 4 MINOR spellings and comments | FIXED: `Git`, `GIT.EXE`, `& "C:\Program Files\Git\cmd\git.exe"`, `"/c/Program Files/Git/cmd/git"`, and a trailing `# ... git worktree add ../z` comment. But the comment stripper introduced a false allow: see finding 2. |
| 5 MINOR stale doc comment | FIXED (hooks/agent-dispatch-guard.mjs:531-532). |

## Findings

### 1. MAJOR: `cd X; git worktree add ..` and `Set-Location X; git worktree add ..` are still not followed. The test that claims they are is masked by its stub.
Evidence: hooks/worktree-location.mjs:216. CD_RE takes the cd operand with the shared `VAL` (`\S+`, :182). In `Set-Location <repo>; git ...`, the slice before the git segment is `Set-Location <repo>;`. `\S+` takes `<repo>;` (semicolon included), and the lookahead is satisfied by end-of-slice `$`. So `dir` becomes the nonexistent `<repo>;`. Real git then fails in `mainRepoOf`, which returns null, and the call is allowed. Probe with real git, cwd = LANE:
```
[PowerShell] "Set-Location <B>/Code/repo; git worktree add ../sl-escape"   -> allow   (git creates <B>/Code/sl-escape: outside)
[PowerShell] "Set-Location <B>/Code/repo;git worktree add ../nospace-ps"   -> allow
[PowerShell] "cd <B>/Code/repo;git worktree add ..\nospace-ps2"            -> allow
[Bash]       "cd <B>/Code/repo&&git worktree add ../nospace"               -> allow
[Bash]       "cd -- .claude/worktrees && git worktree add wt-dd" (cwd REPO) -> DENY (hard deny on a correct command)
```
Why the new test passes anyway: hooks/worktree-location.test.mjs:234 stubs `gitRunner = () => \`${repo}/.git\n\``, which answers for ANY cwd, the nonexistent `<repo>;` included. Mutation check, on a scratch copy only: I swapped that stub for one that throws on a missing cwd, as real git does. Against the HEAD module, the round-2 cd test FAILS on `Set-Location <repo>; git worktree add ../sl-escape` (`pass 14, fail 1`). Against the patched module below it passes (`pass 15, fail 0`). This is the named failure class: the guard passes because it is not looking, and the test passes because it is not looking either.

Fix (mechanical), at hooks/worktree-location.mjs:216. Exact current code:
```js
const CD_RE = new RegExp(String.raw`(?:^|[;&|\n(])\s*(?:cd|pushd|chdir|set-location|sl|push-location)(?:\s+(?:-(?:literal)?path\s+)?(?![;&|)])(${VAL}))?(?=\s*(?:$|[;&|\n)]))`, 'gi');
```
Replacement:
```js
const CD_VAL = String.raw`(?:"[^"]*"|'[^']*'|[^\s;&|)]+)`;
const CD_RE = new RegExp(String.raw`(?:^|[;&|\n(])\s*(?:cd|pushd|chdir|set-location|sl|push-location)(?:\s+(?:--\s+|-(?:literal)?path\s+)?(?![;&|)])(${CD_VAL}))?(?=\s*(?:$|[;&|\n)]))`, 'gi');
```
Test fix, at hooks/worktree-location.test.mjs:234. Exact current code:
```js
  const gitRunner = () => `${repo}/.git\n`; // a linked worktree answers with the main repo's .git
```
Replacement:
```js
  const gitRunner = (args, cwd) => { if (!fs.existsSync(cwd)) throw new Error('no such cwd'); return `${repo}/.git\n`; }; // as real git: a missing cwd fails
```
Also add `[\`cd ${repo};git worktree add ../semi-escape\`, 'Bash', 'semi-escape']` to that test's deny table, and `'cd -- .claude/worktrees && git worktree add wt-dd'` to its allow list.
Predicted outcome (verified on the scratch copy): all four allow lines above become a DENY naming `<repo>/.claude/worktrees/<leaf>`, `cd -- ...` is allowed, the 15 existing tests pass, and no other probe in my set of about 60 changes outcome.

### 2. MINOR (regression from the r1-4 fix): the per-line `#` stripper drops a closing quote and turns the guard off for the rest of the command
Evidence: hooks/worktree-location.mjs:118-131 and :143. `stripComment` starts each line with `quote = null`. A multi-line quoted string whose second line holds ` #` (an issue ref in a commit message is the typical case) therefore has that line cut at the `#`, and the cut takes the closing quote with it. `scanCommand` then treats everything after it as inside a quote. The git match is skipped as prose. Real git, cwd = REPO; "old" is the round-1 module (b7fcaaee):
```
"git commit -m \"fix: x\nRefs #12\"\ngit worktree add ../escape-a"        -> allow   (old: DENY)
"git commit -m \"fix: x\nRefs #12\" && git worktree add ../escape-b"     -> allow   (old: DENY)
"git commit -m \"a\nb # c\" && git worktree add ../escape-c"             -> allow   (old: DENY)
```
This is a fail-open false allow introduced by this round. The trigger is narrow, a multi-line quoted string containing ` #` in the same call. Hence MINOR.
Fix (mechanical): carry the quote state across lines.
Exact current code (:117-128):
```js
/** Drop an unquoted `#` (at line start or after whitespace) through the end of the line. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    }
```
Replacement:
```js
/** Drop an unquoted `#` (at line start or after whitespace) through the end of the line. */
function stripComment(line, state) {
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (state.quote) {
      if (c === state.quote) state.quote = null;
    } else if (c === '"' || c === "'") {
      state.quote = c;
    }
```
In stripHeredocs, exact current code `  let pending = null;` gets the new line `  const quoteState = { quote: null }; // a quote opened on one line stays open on the next` after it. `    out.push(stripComment(line));` becomes `    out.push(stripComment(line, quoteState));`.
Predicted outcome (verified on the scratch copy): all three commands above are denied and name `escape-a/b/c`. The r1-4 comment cases are unchanged (`... -b y # then later git worktree add ../z` and `# git worktree add ../z\ngit status` are still allowed, and `../x#frag` is still denied). Add the three commands to the "executable spellings ... # comment" test as deny cases.

### 3. MINOR (regression): the Agent arm no longer recognises a backslash relative path
Evidence: hooks/worktree-location.mjs:339. Round 1 had `/^\.{1,2}[\\/]/` (backslash or slash). The rewrite has `/^\.{1,2}[\/]/`, which in a regex literal matches `/` only. Probe, new versus round-1 module:
```
Agent "Worktree: ..\wt-back"  -> new: allow  | old: DENY Use <repo>/.claude/worktrees/wt-back
Agent "Worktree: .\wt-dot"    -> new: allow  | old: DENY Use <repo>/.claude/worktrees/wt-dot
```
No test covers it, which is why the gate stayed green. MINOR, because the Agent arm is advisory.
Patch: exact current `        || /^\.{1,2}[\/]/.test(token);` becomes `        || /^\.{1,2}[\\/]/.test(token);`. Add `'Worktree: ..\\wt-back\n'` to the Agent deny test.
Predicted outcome (verified): both prompts are denied and name `wt-back` / `wt-dot`.

### 4. MINOR: a cd inside an executor's quoted command (`bash -c "cd X && git worktree add ..."`) is ignored, which gives both a false allow and a false hard deny
Evidence: hooks/worktree-location.mjs:273-274. CD_RE only sees text before `segStart[m.index]`. Inside a quote, `scanCommand` never advances the segment start, so the slice before an executor-quoted git is empty or holds only the outer command. The quoted cd is never replayed:
```
cwd=LANE "bash -c \"cd <repo> && git worktree add ../bashc-escape\""            -> allow  (outside: false allow)
cwd=REPO "bash -c \"cd .claude/worktrees && git worktree add wt-bashc-legit\""   -> DENY   (correct command: false hard deny)
```
This is the r1-1 twin under an executor, a shape agents use from PowerShell sessions. The false hard deny contradicts the module's "guess allow" posture at :17-19.
Fix (mechanical). Exact current code (:271-279):
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
```
Replacement:
```js
      let dir = callCwd;
      const replayCd = (text, skip) => {
        for (const c of text.matchAll(CD_RE)) {
          if (skip(c.index)) continue;
          const v = (c[1] ?? '~').replace(/^(["'])(.*)\1$/, '$2');
          if (v === '-' || UNRESOLVABLE_RE.test(v)) return false; // `cd -`, `cd $X`: cannot place, allow
          dir = joinFrom(dir, expandHome(v, home), platform);
        }
        return true;
      };
      // `echo "x; cd /y"` is text, not a directory change ...
      let ok = replayCd(command.slice(0, segStart[m.index]), (i) => inQuote[i]);
      // ... but `bash -c "cd /y && git worktree add .."` runs the quoted cd first.
      if (ok && inQuote[m.index]) {
        const q = head.search(/["']/);
        ok = replayCd(q >= 0 ? head.slice(q + 1) : '', () => false);
      }
      if (!ok) continue;
```
(The `-C` loop that follows already starts with `if (!ok) ...` semantics through its own `ok = false; break;`, so it is unchanged.)
Predicted outcome (verified on the scratch copy together with patches 1-3): the LANE `bashc-escape` case is denied and names `<repo>/.claude/worktrees/bashc-escape`, and the REPO `wt-bashc-legit` case is allowed. The quoted `& "...git.exe"` head contains no cd, so it is unaffected. `echo "x; cd ${repo}/.." ; git worktree add .claude/worktrees/ok` is still allowed. Add both commands to the cd test.

## Combined patch verification
I applied patches 1-4 together, plus the stub change, to a `git archive HEAD` copy in my scratch folder. hooks/worktree-location.test.mjs passes there: 15/15. My probe set of about 60 commands and prompts changes outcome ONLY on the lines named in findings 1-4 (diffed HEAD output against patched output). Every other line (r1 cases, line continuations, spellings, comments, Agent shapes, kill switch) is identical.

## Verified absences in the delta
- Line continuation (r1-2): `\`+LF, `\`+CRLF and backtick+LF are handled outside quotes only. `git worktree add \<nl>` with nothing after it is allowed. A continuation inside the head (`git -C <repo> \<nl> worktree add ../x`, `git \<nl> worktree add ../x`) is not matched by WORKTREE_ADD_RE, which fails open. This is a residual, not counted: an unusual shape. If wanted, a one-line pre-pass `command.replace(/[\\`]\r?\n/g, ' ')` inside stripHeredocs's output covers it.
- Spellings (r1-4): QUOTED_GIT_HEAD_RE does not open a prose hole. `echo "use 'git' worktree add ../x"`, `echo '"git" worktree add ../y'` and `Write-Host "& \"git.exe\" worktree add ../w"` are all still allowed. `git log --grep "x" && "git" worktree add ../qgit` is denied correctly.
- Comment stripping: a glued `#` (`../x#frag`) is kept, and `gh pr view #12; git worktree add ../after-hash` is correctly treated as all comment (bash does the same). Residual, not counted: `...;# git worktree add ../z` (a `#` right after `;`) is judged and hard-denied. Bash treats it as a comment. This is rare.
- Agent arm: mid-line build-loop shape, `- Your worktree:`, a second line, `Worktree: <repo>` (exists), an existing stray (allowed), and a new child under an existing stray (denied, names the child) all behave as documented. Residuals, not counted: two declarations on ONE line (`Worktree: none. Worktree: <out>`) judge only the first, because `[^\n]+` consumes the line. A comma-led `Brief: b, Worktree: <out>` is not matched. Both fall within the advisory scope the header now states. `<home>/.claude/worktrees/x` is still accepted, as disclosed.
- R0-stale/R1/R1b/R2/R3: the delta touches agent-dispatch-guard.mjs only in the doc comment (:531-532). No rule text or order changed. agent-dispatch-guard.test.mjs is unchanged in the delta and passes.
- Kill switch: `~/.agents/no-dispatch-guard` still gives `{"action":"allow","skip":true,...}` for a deny-worthy Bash call.
- Items 2, 3, 4, 5 and 7 are untouched by the delta (`git diff --stat b7fcaaee..HEAD` lists only the three hooks files). My r1 verified absences for them stand, and their tests pass in my gate re-run.

## C4 fields (item 7 is the bug-fix part of this lane; unchanged since r1)
Cause: the janitor's bare `--record` defaulted to the tracked `docs/work/evidence/janitor/` (old janitor.mjs DEFAULT_RECORD_DIR). Every daily scheduled run therefore appended to the tracked drift.md in each durable checkout, and `git pull --ff-only` refused on Netcup and Hetzner.
Discriminating check: scripts/janitor.test.mjs "lane 65 item 7: the scheduled argv (bare --record, --host, --apply) on a clean fixture repo leaves `git status --porcelain` empty" fails under the old default and passes now (passes in my r2 gate re-run).
Fix location: scripts/janitor.mjs `defaultRecordDir` (:139-144), `parseFlags(argv, home)` and `main`'s injectable `home`; no change in this delta.
Simplification: none further needed. One constant became one home-based function, and writeRecord is untouched. For R4 this round, findings 1 and 4 share one `replayCd` helper rather than adding a second cd parser.
