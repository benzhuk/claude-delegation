VERDICT: NEEDS_FIXES (8) 0824e76e0372390f7309756462053a4cb8aba489

# Lane 57 review: extended N2 scanner and the two gap fixes

Artifact 0824e76e0372390f7309756462053a4cb8aba489 (diff b63db1a..0824e76), branch build/test-ipc-57-1.
The worktree HEAD is 9a45112, which is 0824e76 plus docs only (build.md and the record). I reviewed the code through `git archive` copies in the scratch folder /var/tmp/l57r-Io64 (`red/` = 1167b9a, `green/` = 0824e76, `probe/` = 0824e76). The worktree was not modified.
Reviewed 2026-09-29, around 5:00 AM America/New_York.

GOAL line served: "work lost or stalled" (gate false reds, and isolation gaps that land unseen). Nearest NOT: "a rule no script checks". A scanner that looks clean but misses real sites is the failure the ruling was written to prevent.

## Summary

- Red and green reproduce as claimed (item 4). The two gap fixes are correct and complete (item 5). Nothing changed in run-tests.mjs, hooks/ or four-read (item 6).
- The scanner (item 1) has a measured false green on real repo code. An apostrophe in a comment inside a call corrupts the call slice, and `call.includes('env:')` then matches a later, unrelated test. Deleting the env key at skills/multi/scripts/note-inbox.test.mjs:369-374 leaves the scanner silent.
- The narrowing (item 2) misses one live node-direct site: `execFileSync("sh", ["-c", '"$0" ...', process.execPath, ...])` with no env, at scripts/collect-from-origin.test.mjs:423. The "provably inert" `-e` check tests only one spelling, so it proves nothing.
- The exemptions (item 3) are keyed by `file:line`. The 6 exempted files had 86 commits in the last 30 days (work-record.test.mjs alone had 44). Any line shift above a site turns N2 red for an unrelated lane, which is the exact measure this lane serves. There is no stale-key check.
- A live site passes `env: process.env`, the whole runner environment, at scripts/native-continuation-smoke.test.mjs:20 (win32 only). Neither N2 check can see it. build.md cites the same file (:17) as an "inert -e literal", but :17 is a spawn written inside a string.

Blocking: F1 to F5. Non-blocking (cheap, patches included): F6 to F8.

## Process notes (stopped steps, disclosed)

- **Item 1 variant battery: stopped.** The one command that would have written the 27 defeat variants into the scratch folder was denied by the secret-guard PreToolUse hook. The variants' own source text (`console.log(process["env"])` and similar) looked like an environment dump. Per the brief ("a denied command stops the step"), I did not retry or reword it. The item 1 results below are therefore **static traces** of `findEnvLessSpawns` (a pure regex scanner, lines 441-523, which can be traced deterministically). The exception is the real-code false green in F1, which is **measured** by an in-memory mutation of the real file against the scanner functions extracted from 0824e76.
- **A grep for `env: <inheriting value>` across the test files was also denied** (secret-guard, "sources a secret file"). That step was stopped too. The F4 evidence comes from a plain Read of the one file.
- The three touched test files were run **twice**, not once. The first run's output was unreadable because the child runners' nested TAP was mixed into my filter. I re-ran with `--test-reporter=tap` to a file. Result: `tests 83 / pass 82 / fail 0 / skipped 1`, exit 0 (skip = the win32-only signal test). I did not run the full suite.

## Item 4: red then green (measured)

On the `red/` archive of 1167b9a (parent b63db1a plus the scanner commit only), running `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` gives:

```
✖ N2: no test file in this suite inherits the runner environment on its own
  ... scripts/test-home.test.mjs:66 [spawn] passes no env key at all, scripts/test-home.test.mjs:523 [execFileSync] passes no env key at all
ℹ tests 2 / pass 1 / fail 1
```

On the `green/` archive of 0824e76: `✔` for both N2 tests, `tests 2 / pass 2`. The builder's claim is confirmed. The red lists exactly :66 (spawnAndSignal) and :523.

## Item 1: defeat forms (static trace unless marked MEASURED)

| # | form | result | matters for the stated rule? |
|---|---|---|---|
| 1 | `const opts = {stdio:'ignore'}; spawn(NODE, args, opts)` | caught (one-hop resolve finds no `env`) | - |
| 1b | same name declared twice, the first with `env` | **slips** (resolve takes the first declaration in the file) | low (F7) |
| 2 | `spawn(NODE, args, {...opts})` | caught (conservative: flagged even if opts has env) | - |
| 3 | `env: undefined` (also `env: null`, `env: process.env`, `env: o.env`) | **slips** (`call.includes('env:')`) | yes: node treats a missing or null env as the full `process.env` (F4) |
| 4a | `execFile(NODE, args, cb)` / `execFileSync(NODE, args)` with no options | caught | - |
| 4b | `fork('./child.mjs', ...)` | **slips** (first argument is not process.execPath, yet fork always runs node) | low, 0 in repo (F6) |
| 5 | `spawn('node', ...)` | **slips** (not in `nodeDirect`) | low, 0 in repo (F6) |
| 6 | multi-line call | caught (`[^,]+?` spans newlines) | - |
| 7a | comment containing `env:` inside the call | **slips** | yes (F1) |
| 7b | an apostrophe in any comment inside the call (`// don't ...`) | **slips. MEASURED on real code:** removing the env key at note-inbox.test.mjs:369-374 gives `hits after env removed []`. The slice runs 45 lines and picks up `env: {}` from the next test. goal-card.test.mjs:660's slice runs to EOF (`AGENTS_HOME's`), and is caught only because nothing below it says `env:`. | **yes: live false green (F1)** |
| 8a | template literal as the script (`'-e', \`...\``) | caught (the literal regex needs `'` or `"`) | - |
| 8b | template literal as the command (`` `${process.execPath}` ``) | **slips** | low |
| 9 | a string argument containing `env:` (`"--label=env:ci"`), or a key like `myenv:` | **slips** (substring test) | yes, same fix as F1 |
| 10 | `-e` literal that imports or requires a file, spawns a grandchild, or reads `process["env"]` / `const {env}=process` | **slips** (exempt as "inert") | yes (F5) |
| 11 | `--import ./x.mjs` / `-r` preload in front of an inert `-e '1'` | **slips** | yes (F5) |
| 12 | `execSync(\`"${process.execPath}" x\`)` / `exec` | **slips** (not in fnRe) | low, 0 in repo |
| 13 | `import { spawn as run }`, `const {execPath}=process`, `process.argv0` | **slips** | low, 0 in repo (measured by grep) |
| 14 | `sh -c` / `cmd` running process.execPath | **slips. MEASURED live:** collect-from-origin.test.mjs:423 | **yes (F3)** |

Rows 7b and 14 are live today. Rows 3, 9, 10 and 11 are open doors for the next site.

## Findings

### F1 HIGH: the call slice is not comment-aware, and the env test is a raw substring. Measured false green on real code.

Evidence: hooks.test.mjs:441-458 (`extractBalanced`) treats a `'` in a `//` comment as the start of a string. hooks.test.mjs:507 then runs `call.includes('env:')` on the corrupted slice, which includes comments and string contents.
- In-memory mutation (scratch /var/tmp/l57r-Io64/mut.mjs, scanner extracted from 0824e76): remove `env: childEnv(home, {...})` from skills/multi/scripts/note-inbox.test.mjs:374 and the result is `hits before [] hits after env removed []`. This is a real node-direct spawn with no env, and it is not flagged.
- An audit of every node-direct slice on 0824e76 finds 2 corrupted slices: goal-card.test.mjs:660 (runs to EOF, never closes) and note-inbox.test.mjs:369 (45 lines).

Fix (mechanical, ready patch; trialled in scratch as /var/tmp/l57r-Io64/patched2.mjs).

Current, hooks.test.mjs:448-452:
```js
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
```
Replacement:
```js
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') { const nl = text.indexOf('\n', i); if (nl === -1) break; i = nl; continue; }
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); if (end === -1) break; i = end + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
```
Add after `extractBalanced`:
```js
/** `s` with every comment and string body blanked to spaces (same length), so key tests see code only. */
function codeOnly(s) {
  let out = ''; let inStr = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') { out += '  '; i++; continue; } if (c === inStr) { inStr = null; out += c; } else out += c === '\n' ? '\n' : ' '; continue; }
    if (c === '/' && s[i + 1] === '/') { const nl = s.indexOf('\n', i); const end = nl === -1 ? s.length : nl; out += ' '.repeat(end - i); i = end - 1; continue; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); const end = e === -1 ? s.length : e + 2; out += s.slice(i, end).replace(/[^\n]/g, ' '); i = end - 1; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; continue; }
    out += c;
  }
  return out;
}
```
Current, hooks.test.mjs:507:
```js
    let hasEnv = call.includes('env:') || /[{,]\s*env\s*[,}]/.test(call);
```
Replacement (the INHERITING part is F4):
```js
    const code = codeOnly(call);
    let hasEnv = /[{,]\s*env\s*[:,}]/.test(code) && !/[{,]\s*env\s*:\s*(?:undefined|null|process\s*\.\s*env)\s*[,}]/.test(code);
```
Keep `fnRe` running on the raw `text`, not on `codeOnly(text)`. I trialled codeOnly on the whole file, and a regex literal holding `"'` (hooks/codex-unsupported.test.mjs:63) desynchronised it and hid :438.

Predicted and measured outcome of patched2 on 0824e76: the same 9 hits (all exempt), so N2 stays green. On 1167b9a it still flags test-home :66 and :523. The note-inbox mutation now gives `hits after env removed [369]`.

Add unit cases to the "N2 scanner" test, built with the file's own `['sp','awn'].join('')` trick: an apostrophe comment inside the call followed by a later `env:` call (expect 1 hit), and a `// env: later` comment inside the call (expect 1 hit).

### F2 HIGH: exemptions keyed by `file:line`. Unrelated edits cause false reds, and there is no stale-key check.

Evidence: hooks.test.mjs:531-541 and :562 (`N2_SPAWN_ENV_EXEMPTIONS.has(\`${rel}:${hit.line}\`)`). Commits touching the 6 exempted files in the 30 days to 0824e76 (`git log --since=2026-08-29`): work-record.test.mjs 44, codex-unsupported 13, goals-mirror 11, decisions-read 9, prefix-test 7, bugfix-fields 2.
- Any insertion above line 1778 of work-record.test.mjs fails N2 in hooks.test.mjs, with a message saying a file the lane never touched "passes no env key". That is a gate false red, the lane's own measure.
- In the other direction, once an exempted site is fixed or moves, its key goes stale without warning. A new env-less site that later lands on the vacated line is then exempt without warning. That is a false green.
- Question 3 ("is a NEW site in an exempted file still flagged?"): yes today, unless it lands on a stale line number.

Fix (mechanical, ready patch). Key by file with an exact count, and ratchet both ways.

Current, hooks.test.mjs:531-541: the `new Map([['hooks/codex-unsupported.test.mjs:438', '...'], ...])`. Replacement:
```js
const N2_SPAWN_ENV_EXEMPTIONS = new Map([
  ['hooks/codex-unsupported.test.mjs', { count: 1, reason: 'installer smoke (--codex-home scratch), out of lane-57 territory' }],
  ['scripts/bugfix-fields.test.mjs', { count: 2, reason: 'runCli() helper and the usage-message check, out of lane-57 territory' }],
  ['scripts/prefix-test.test.mjs', { count: 1, reason: 'runPrefixTest() helper spawning the real CLI, out of lane-57 territory' }],
  ['scripts/work-record.test.mjs', { count: 1, reason: 'real build-census.mjs CLI invocation, out of lane-57 territory' }],
  ['skills/decisions/scripts/decisions-read.test.mjs', { count: 3, reason: 'symlinked-script, SCRIPT_PATH and blind-input exit-code checks, out of lane-57 territory' }],
  ['skills/decisions/scripts/goals-mirror.test.mjs', { count: 1, reason: 'real CLI render-match check, out of lane-57 territory' }],
]);
```
Current, hooks.test.mjs:560-564:
```js
    for (const hit of findEnvLessSpawns(text)) {
      const key = `${rel}:${hit.line}`;
      if (N2_SPAWN_ENV_EXEMPTIONS.has(key)) continue;
      envLessOffenders.push(`${key} [${hit.fn}] passes no env key at all`);
    }
```
Replacement:
```js
    const hits = findEnvLessSpawns(text);
    const allowed = N2_SPAWN_ENV_EXEMPTIONS.get(rel);
    if (allowed) seenExempt.add(rel);
    if (!allowed || hits.length !== allowed.count) {
      for (const hit of hits) envLessOffenders.push(`${rel}:${hit.line} [${hit.fn}] passes no env key at all`);
      if (allowed) envLessOffenders.push(`${rel}: exemption allows ${allowed.count}, found ${hits.length} - fix the new site or lower the count`);
    }
```
Declare `const seenExempt = new Set();` next to `envLessOffenders`. After the file loop, add:
```js
  for (const f of N2_SPAWN_ENV_EXEMPTIONS.keys()) if (!seenExempt.has(f)) envLessOffenders.push(`${f}: exempted file no longer exists - drop its entry`);
```
Predicted outcome: green on 0824e76 (the measured per-file counts are 1/2/1/1/3/1). A line shift anywhere stays green. One new site in an exempted file goes red and lists every site in that file. Fixing a site goes red until the count is lowered. The trade-off: a fix and a new site in the same commit net out. The ratchet and the rest of the scan still catch every other shape.

### F3 MEDIUM: the "fixed external binary" narrowing misses a live node-direct spawn through `sh`, and it narrows the ruling's letter without sign-off.

Evidence: scripts/collect-from-origin.test.mjs:423:
```js
const out = execFileSync("sh", ["-c", '"$0" "$1" --repo "$2" --no-fetch --json | cat', process.execPath, scriptPath, root], {
  encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
```
This runs process.execPath on the real collect-from-origin.mjs with the whole inherited environment. The scanner skips it because its first argument is `"sh"` (hooks.test.mjs:505). The criterion's own rationale is that node "runs ARBITRARY script text". `sh -c` runs arbitrary script text too, and here the script it runs is node itself.

Question 2 (principled, or a way to keep the red list small?): the node-direct idea is defensible for the two messaging variables. But the rule in test-child-env.mjs also names `HOME` ("its HOME holds Ben's real ~/.agents/notes"), and git fixture calls with an inherited HOME read the real ~/.gitconfig. Under the scanner's own detection, the 0824e76 tree has 13 env-less `git` spawns, 1 `sh`, 1 `mkfifo` and 1 `taskkill.exe` outside its scope. The ruling said "flag a spawn in a test file that passes no env key". The node-only scope is a builder narrowing, and the lead should accept it explicitly in the record.

The inert-literal re-check (question 2b) is mechanical, meaning it re-runs on every edit. It is not sound; see F5.

Fix (mechanical, trialled as /var/tmp/l57r-Io64/patched3.mjs). Current, hooks.test.mjs:505:
```js
    if (!nodeDirect.has(firstArg)) continue; // not a node-direct spawn: cannot reach the session
```
Replacement (with F6 folded in):
```js
    const SHELLS = /^['"](?:sh|bash|zsh|cmd|cmd\.exe|powershell|powershell\.exe|pwsh)['"]$/;
    const argText = codeOnly(call.slice(1 + (firstArgMatch ? firstArgMatch[0].length : 0)));
    const runsNode = [...nodeDirect].some((t) => /^\w/.test(t) && new RegExp(`(^|[^\\w.])${t.replace('.', '\\.')}\\b`).test(argText));
    if (m[1] !== 'fork' && !nodeDirect.has(firstArg) && !SHELLS.test(firstArg) && !runsNode) continue; // cannot reach the session
```
Measured outcome on 0824e76: exactly one new hit, `scripts/collect-from-origin.test.mjs 1 423[execFileSync]`. The 9 existing hits are unchanged. Red 1167b9a still flags :66 and :523. The new site is out of territory: the lead either approves a one-line `env: childEnv(scratchHome(fs, 'cfo-pipe-'))` there, or adds `['scripts/collect-from-origin.test.mjs', { count: 1, reason: ... }]` under F2's map. Record the lead's node-plus-shell scope decision.

### F4 MEDIUM: an env key whose value inherits (`undefined`, `null`, `process.env`) counts as sealed, and a live `env: process.env` site is invisible. build.md mis-cites it.

Evidence:
- hooks.test.mjs:507 accepts any `env:`. Node falls back to `process.env` when `options.env` is undefined or null.
- scripts/native-continuation-smoke.test.mjs:19-20: `runChild(process.execPath, ['-e', source], { env: process.env, ... })` hands the full runner environment (messaging socket and token, NODE_TEST_CONTEXT, real HOME) to a node child that spawns a grandchild. It is win32 only, so it runs on the Windows gates this lane is about. The original line check only matches the `...process.env` spread, and `runChild` is not in fnRe, so neither check sees it.
- build.md lists "native-continuation-smoke.test.mjs:17" among the "inert inline -e literal" exemptions. Line 17 is a `spawn(...)` written *inside the template string* `source`; the scanner scans string contents. The real spawn is :19-20 and passes `env: process.env`.

Fix:
- (a) The `hasEnv` replacement in F1 already rejects `env: undefined|null|process.env`.
- (b) Extend the line check next to the needle at hooks.test.mjs:558:
```js
      if (line.includes(needle) || /\benv\s*:\s*process\.env\s*[,}]/.test(line)) offenders.push(`${rel}:${i + 1}`);
```
  That source text does not match itself, because `env\s*:` is followed by a backslash, not a colon. Predicted outcome: one new red, at scripts/native-continuation-smoke.test.mjs:20. That is out of territory, so the lead either approves `env: childEnv(scratchHome(fs, 'native-cont-'))` there (a one-line fix; the test only needs a live child) or names it in a counted allowlist.
- (c) Correct build.md's exemption list: :17 is not an inert-literal site.

### F5 MEDIUM: the "provably inert" `-e` literal exemption proves nothing beyond one spelling.

Evidence: hooks.test.mjs:514-519 exempts any inline `-e`/`--eval` literal that lacks the exact text `process.env`. The literal still inherits the whole environment, so all of these pass as "inert":
- `import("./hook.mjs")` or `require("./x")`: runs a separately maintained file, which build.md itself says cannot be trusted.
- `require("child_process").execSync(...)`: a grandchild inherits everything, which is exactly the 2026-09-17 path.
- `process["env"]`, `const {env}=process`, `import {env} from "node:process"`.
- A `--import`/`-r` preload placed ahead of an inert `-e '1'`.

The 4 live literal exemptions are genuinely trivial: `setInterval(()=>{}, 1000)`, `setTimeout(() => {}, 30_000)`, `'0'` and `process.exit(0)`. So nothing is wrong today, but the "provably" claim in the code comment is false.

Fix (mechanical; trialled in patched2 and 3 with no change in hits on 0824e76). Current, hooks.test.mjs:517-518:
```js
      const marker = ['process', '.', 'env'].join('');
      if (!litMatch[2].includes(marker)) continue; // inline literal, provably can't read the sealed vars
```
Replacement:
```js
      const reaches = /\b(?:import|require|globalThis|child_process|spawn|exec|fork|eval|Function)\b|\bprocess\b(?!\.exit\b)/;
      const preload = /['"](?:-r|--require|--import|--loader|--experimental-loader)['"]/;
      if (!preload.test(call) && !reaches.test(litMatch[2])) continue; // literal names no way to reach env, a file or a child
```
This is a deny-list of the ways a literal can reach anything. It keeps the 4 trivial sites (`process.exit` is allowed) and drops `setTimeout`-style false alarms. Measured: patched3 on 0824e76 gives the same exempt set. Update the code comment from "provably" to "names no module, child or env access". Add unit cases: an `import(...)` literal, and a `--import` preload with `-e '1'`, each expecting 1 hit.

### F6 LOW: `fork(...)` and `'node'` are not treated as node-direct.

Evidence: hooks.test.mjs:491 `nodeDirect = new Set(['process.execPath'])` and :505. `fork` always runs node, and `spawn('node', ...)` resolves node on PATH. Measured by grep: 0 occurrences in the test files today.
Fix: the F3 patch already treats `fork` as always node-direct. Also change :491 to `new Set(['process.execPath', "'node'", '"node"'])`. Predicted outcome: no change in hits on 0824e76.

### F7 LOW: one-hop resolution takes the first same-named declaration, and `\benv\b` matches any word "env".

Evidence: hooks.test.mjs:461-469. A second `const opts = {stdio}` in another function resolves to the first one, which has env. `{ cwd: env.HOME }` also counts as an env key.
Fix. Current:
```js
  const re = new RegExp(`\\b(?:const|let|var)\\s+${ident}\\s*=\\s*\\{`);
  const m = re.exec(fileText);
  if (!m) return null;
  const braceIdx = fileText.indexOf('{', m.index);
  const obj = extractBalanced(fileText, braceIdx, '{', '}');
  return /\benv\b/.test(obj);
```
Replacement:
```js
  const re = new RegExp(`\\b(?:const|let|var)\\s+${ident}\\s*=\\s*\\{`, 'g');
  const decls = [...fileText.matchAll(re)];
  if (decls.length !== 1) return null; // ambiguous or absent: do not vouch for it
  const braceIdx = fileText.indexOf('{', decls[0].index);
  return /[{,]\s*env\s*[:,}]/.test(codeOnly(extractBalanced(fileText, braceIdx, '{', '}')));
```
Predicted outcome: note-send.test.mjs:868 still resolves (it is the only one-hop case the builder cites), so there is no change on 0824e76. I measured this under patched2.

### F8 LOW (non-blocking): the new scratchHome dirs are never removed on a standalone run.

Evidence: scripts/test-home.test.mjs:69 and :529 mkdtemp one dir per call and never delete it. After my two standalone runs of the three files, the scratch TMPDIR held 8 `spawn-and-signal-*` and 2 `handler-idempotent-*` dirs (5 per run). Under run-tests.mjs they fall inside the per-run root, so there is no leak-check hit there, and bare `scratchHome` is the repo's existing convention. The file already has `cleanups`, though.
Fix. Current :69:
```js
    const env = childEnv(scratchHome(fs, "spawn-and-signal-"));
```
Replacement:
```js
    const sealedHome = scratchHome(fs, "spawn-and-signal-");
    cleanups.push(() => fs.rmSync(sealedHome, { recursive: true, force: true }));
    const env = childEnv(sealedHome);
```
Apply the same change at :529 with `"handler-idempotent-"`.

## Item 3: the 9 exemptions

I read each site at 0824e76. Each reason is true as stated: each is a `spawnSync(process.execPath, [<real CLI>], {...})` with no env, and each is out of lane-57 territory. hooks/codex-unsupported:438 runs mirror-shared-skills.mjs with `--codex-home <scratch>`, which the installer restricts to that one home (scripts/mirror-shared-skills.mjs:721-722), so an inherited CODEX_HOME does not widen it.

The reasons say why each site is not fixed, not why inheritance there is safe. That is honest, and it fits a ratchet list.

Measured: all 9 keys match a live hit, with no stale entries, and no other hits exist on 0824e76. The keying defect is F2.

## Item 5: the gap fixes (verified absence of defects)

- run-tests.test.mjs: b63db1a had 10 `delete env.NODE_TEST_CONTEXT` sites. 0824e76 has 11 `sealedEnv(` occurrences (1 definition + 10 calls), no remaining bare `childEnv(` spawn env, and both markers are deleted in `sealedEnv`. The coverage is complete.
- spawnAndSignal and the idempotency test: the children run `node -e` against test-home.mjs, which imports only fs, os, path and test-child-env (no node:test). `makeTempHome` places the home under `os.tmpdir()`. `childEnv` leaves TMPDIR untouched and changes only HOME/USERPROFILE (never read by those scripts), the git-locating names, and the two blanked messaging variables. Signal delivery and the re-raise path do not depend on env.
- So the four signal tests prove the same thing as before: the handler removes the registered home and re-raises the real signal, and a kept home survives. The idempotency test proves the same listener counts. NODE_TEST_CONTEXT still passes through `childEnv` into these children, but it is inert there because nothing imports node:test.
- The three files at 0824e76 give `tests 83 / pass 82 / fail 0 / skipped 1`, exit 0.

## Item 6: out-of-territory paths (verified absence)

`git diff --name-only b63db1a..0824e76 -- scripts/run-tests.mjs hooks/` returns 0 files, and no path matches `four`. The diff touches exactly scripts/run-tests.test.mjs, scripts/test-home.test.mjs and skills/multi/scripts/hooks.test.mjs.

## C4 fields

Cause: the scanner decides "has an env key" from a raw substring (`env:`) over a call slice that is not comment-aware. An apostrophe in a comment inside a call stretches the slice into later code. Its node-direct gate also ignores `sh -c` running process.execPath, and it counts inheriting values (`env: undefined|null|process.env`) as sealed. So N2 goes green over real inheriting sites: note-inbox.test.mjs:369 if its env key is removed (measured), collect-from-origin.test.mjs:423, and native-continuation-smoke.test.mjs:20.
Discriminating check: an in-memory mutation removing the env key at skills/multi/scripts/note-inbox.test.mjs:374 gives `[]` hits on the 0824e76 scanner and `[369]` on the patched scanner (/var/tmp/l57r-Io64/mut.mjs, mut2.mjs). patched3 on 0824e76 adds exactly `scripts/collect-from-origin.test.mjs:423`. Red 1167b9a still flags test-home :66 and :523 under every patch.
Fix location: skills/multi/scripts/hooks.test.mjs:441-523 (extractBalanced comment skip, codeOnly, the hasEnv test, the literal deny-list, the node-direct gate, resolveIdentHasEnvKey), :531-541 and :560-564 (per-file counted exemptions and the stale check), :558 (the `env: process.env` line check), plus unit cases in the "N2 scanner" test. The out-of-territory sites collect-from-origin.test.mjs:423 and native-continuation-smoke.test.mjs:20 go to the lead. scripts/test-home.test.mjs:69 and :529 need cleanup pushes (F8).
Simplification: key exemptions by file with a count instead of `file:line`. That removes line-shift false reds and adds a ratchet in one map. One `codeOnly` pass replaces three ad hoc text tests (the `env:` substring, the shorthand regex, and the `\benv\b` resolve check).

## Scratch

Everything is under /var/tmp/l57r-Io64: the red, green and probe archives, the tmp dir, audit.mjs, mut.mjs, mut2.mjs, patched.mjs, patched2.mjs, patched3.mjs, shells.mjs, scanner-extract.mjs and three.tap. It was left in place under the no-delete rule, and none of it is in a repo.
