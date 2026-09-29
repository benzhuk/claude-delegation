VERDICT: NEEDS_FIXES (3) 1135839b7dac29bb8520094aa982af07821aaab2

# Lane 57 delta review r2: fix round at 1135839 (diff 0824e76..1135839)

Reviewed 2026-09-29, early morning America/New_York. Inputs read: lead-ruling-r1.md, build-r1.md, win-0824e76-fail.md.

## Read this first: most of this review is a static reading

**Every Bash call failed during this review.** The harness could not write its own output file: `ENOSPC: no space left on device, open '/proc/self/fd/40/...output'`. This happened on a plain `echo ok`, in foreground and in background, across 6 attempts. /tmp is out of inodes, as the coordinator warned. Setting TMPDIR=/var/tmp cannot help, because the failure is in the harness's own write, before any command runs. I may not delete anything to free inodes, so I did not.

What this means:
- I could not create the mktemp scratch folder, re-run the note-inbox.test.mjs:369 mutation, measure the exemption counts, or run the three touched files.
- Everything below is a **static reading** with the Read tool. Items that needed a measurement are marked **NOT VERIFIED**.
- I read the code from the worktree files. The branch ref reads `dff5538...`, not 1135839. From build-r1.md, the commits after 1135839 appear to be docs only, but I could not run `git diff 1135839 dff5538` to confirm the code files are the same. The line numbers below are from the worktree copy.

Once the shell works again, the NOT VERIFIED items need one short pass. It is listed at the end.

## Per-item verification (static)

| item | status | evidence |
|---|---|---|
| W1 path separators | **fixed as ruled** | hooks.test.mjs:12 imports `toPosix`. It is applied at :658 (`rel`) and again inside `exemptionOffenders` at :637. The unit test at :780 feeds `'scripts\\fixture.test.mjs'` and expects a match. |
| F1 comment and string blanking | **fixed as ruled**; the real-code check is NOT VERIFIED | `codeOnly` at :449-465. `extractBalanced` skips comments at :481-482. The key test runs on `codeOnly(call)` at :560-561. The unit test at :699-720 covers an apostrophe in a comment and `// env:`. The note-inbox:369 mutation re-run is **NOT VERIFIED** (no shell). By static trace, the call now ends at its own `)` on :374, so removing its env key leaves no `env` key in the slice, and :369 would be flagged. |
| F2 count-keyed exemptions | **fixed as ruled** | :607-628 is `Map<file,{count,reason}>`. :636-644 checks the count exactly. :661-663 sweeps for stale entries. The unit test at :786-807 covers a line shift staying green, a new site going red, and a fixed site going red. The real per-file counts on the tree are **NOT VERIFIED**. |
| F3 node anywhere in argv | **fixed as ruled** | :528-532 and :552 match a node token anywhere in the raw call. The unit test at :734-738 covers sh running process.execPath (in scope) and sh running git (out of scope). The reason for the narrower scope is written next to the check at :510-513. collect-from-origin has an entry at :617. |
| F4 inheriting values | **partly fixed. False green remains: R1** | `undefined`/`null` are handled in (a) at :562. `process.env` and its spread are handled only by (b), one line at a time, at :590-594. |
| F5 inert `-e` special case | **confirmed gone** | No `litMatch`, marker or `-e` branch remains in :522-597. janitor, review-run and native-continuation are now ordinary counted entries (:624-627). run-tests.test.mjs:812 is sealed with `env: sealedEnv(homeDir)`, and `childEnv`'s `over = {}` default covers the missing overrides. |
| F6 fork | **fixed** | :552 `m[1] === 'fork'`; unit test at :728-729. |
| F7 ambiguous resolution | **fixed, with a deviation from the ruling's letter (note N1)** | :495-502 requires exactly one declaration and matches `env` as a key only; unit test at :757-771. |
| F8 scratchHome cleanup | **fixed as ruled** | test-home.test.mjs:69-71 and :531-533 push `fs.rmSync` onto `cleanups`. |
| build.md :17 citation | **corrected in build-r1.md** | :17 is a spawn written inside the `source` template string. The real inheriting site is :19-20 (`runChild` with `env: process.env`). Both are counted: `count: 2` at :624. |
| Three touched files run once | **NOT VERIFIED** | No shell. |

## Findings

### R1 HIGH: `env: process.env` on a spawn-family call is a false green whenever its line begins inside a multi-line string

**Cause.**
- Part (a) at :561-563 counts `env: process.env` (and `{ ...process.env }`) as a valid env key, so `hasEnv` is true and the call is skipped. The comment at :558-559 says the check is deliberately left to (b).
- Part (b) at :590-594 runs `codeOnly` **one line at a time, starting fresh on each line**. A line that begins *inside* a multi-line template literal or string gets inverted. The closing backtick is read as an *opening* one, so everything after it, including `env: process.env`, is blanked.
- So neither half flags this shape, which is common in this repo because node children often take a multi-line template script:
```js
spawn(NODE, ['--input-type=module', '-e', `
  console.log(1);
`], { env: process.env, stdio: 'ignore' });
```
- Trace:
  - (a): `codeOnly(call)` over the whole call is correct, and `/[{,]\s*env\s*[:,}]/` matches, so `hasEnv = true` and the call is skipped.
  - (b), line 1: `spawn(NODE, [..., \`` has no `env:`.
  - (b), line 2: `  console.log(1);` has no `env:`.
  - (b), line 3: `` `], { env: process.env, stdio: 'ignore' }); `` — the backtick opens a string in the fresh state, the rest of the line is blanked, and `inheritRe` finds nothing.
  - Result: **0 hits**.
- It is a static trace, not measured, but it is deterministic: both functions are pure string scans, and I traced each character class that matters.
- The same inversion hides `...process.env` on such a line.

**Fix (mechanical).** Part (a) owns every spawn-family call it examined, including the inheriting values. Part (b) skips lines inside those calls and keeps covering wrapper calls like `runChild`.

Current, hooks.test.mjs:560-563:
```js
    const code = codeOnly(call);
    const hasEnvKey = /[{,]\s*env\s*[:,}]/.test(code) || /\.\.\.\s*process\s*\.\s*env\b/.test(code);
    const inheritsBare = /[{,]\s*env\s*:\s*(?:undefined|null)\s*[,}]/.test(code);
    let hasEnv = hasEnvKey && !inheritsBare;
```
Replacement:
```js
    const code = codeOnly(call);
    if (call.endsWith(')')) ownedSpans.push([line, line + call.split('\n').length - 1]);
    const hasEnvKey = /[{,]\s*env\s*[:,}]/.test(code);
    const inheritsBare = /[{,]\s*env\s*:\s*(?:undefined|null|process\s*\.\s*env)\s*[,}]/.test(code)
      || /\.\.\.\s*process\s*\.\s*env\b/.test(code);
    let hasEnv = hasEnvKey && !inheritsBare;
```
Add `const ownedSpans = [];` right after `const found = [];` (:523).

Current, :593:
```js
    if (inheritRe.test(codeOnly(textLines[li]))) found.push({ line: li + 1, fn: 'inherits', target: 'process.env' });
```
Replacement:
```js
    if (ownedSpans.some(([a, b]) => li + 1 >= a && li + 1 <= b)) continue; // (a) already judged this call whole
    if (inheritRe.test(codeOnly(textLines[li]))) found.push({ line: li + 1, fn: 'inherits', target: 'process.env' });
```
Update the comment at :555-559 to match: (a) now owns inheriting values for its own calls.

A span is recorded only for a call whose extent closed with `)`. A runaway extent therefore cannot suppress (b) for the rest of the file.

**Predicted outcome.**
- The F4 unit cases stay at exactly 1 hit each. For `fullEnv` and `spread`, (a) flags the call and (b) skips its line.
- The `runChild` wrapper case stays at 1 hit, because `runChild` is not in `fnRe` and (b) handles it.
- native-continuation-smoke stays at count 2. :17 is a closed single-line span with no env, flagged by (a). :20 is outside every span, flagged by (b).
- Add the multi-line shape above as a unit case (built with the `SPAWN` join trick), expecting 1 hit. It gives 0 hits on the current code and 1 after the fix.

### R2 MEDIUM: a runaway call extent is still silent. Regex literals can now end a line early.

**Cause.** The coordinator asked whether comment and string blanking breaks the call-extent search on regex literals or nested templates in real test files.
- `extractBalanced` (:474-486) and `codeOnly` (:449-465) do not recognise regex literals.
- A regex containing a quote was already a desync risk at 0824e76. The fix round adds a new one: a regex whose source contains `//` is now read as a line comment. For example, `/https?:\/\//` ends in `\//`, which is a `/` followed by the closing `/`.
- If a spawn call's closing `)` sits on such a line, the extent runs on to some later `)`. The slice can then pick up a later `env:`, which is the F1 false-green class again.
- Nested template literals are parity-safe for ordinary one-level nesting (`${a ? \`x\` : 'y'}`). They break only if a `${}` contains a `//` or an odd number of backticks.
- I could not measure whether any node-reachable call in the real test files hits this (**NOT VERIFIED**). At 0824e76 my r1 audit found exactly 2 malformed extents, both caused by the apostrophe bug that F1 fixes.

**Fix (mechanical).** Make a malformed extent loud instead of silent. Add after :544:
```js
    if (!call.endsWith(')') || call.split('\n').length > 40) {
      found.push({ line, fn: m[1], target: 'call extent not parsed - rewrite or split this call' });
      continue;
    }
```

**Predicted outcome.** No new hits on the current tree, if F1 holds as the static trace says. At 0824e76 the only extents that failed to close or ran past 25 lines were the two apostrophe cases (goal-card:660, which ran to EOF, and note-inbox:369 at 45 lines). Confirm with one N2 run once the shell is back. Any future regex-literal desync then fails N2 red instead of passing green.

### R3 LOW: a bare `node` word anywhere in a call brings a git or sh call into scope

**Cause.**
- `nodeTokenRes` (:528-532) strips the quotes from `'node'`/`"node"`, so the regex matches the bare word `node` anywhere in the raw call. That includes a comment ("// the node side") and a hyphenated path (`'x/node-lib'`, since `-` is not a `\w` character).
- This errs loud (a false red), never a false green, so it is non-blocking. It can, however, red an unrelated lane's git fixture call, and that is the lane's measure.

**Fix.** Keep the bare-word match so `sh -c "node x.mjs"` is still caught. Run it on the call with comments stripped (strings kept):
```js
    const noComments = call.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
    const reachesNode = m[1] === 'fork' || nodeTokenRes.some((re) => re.test(noComments));
```
**Predicted outcome.** No change on the current tree. A comment mentioning node no longer brings a call into scope. Tighten the `node-lib` case only if it ever happens.

## Notes (no action required)

- **N1.** F7 was ruled as "nearest declaration before the call". The builder implemented "exactly one declaration in the file, else don't vouch". That is stricter, and it errs loud, so I accept it. The lead should record the deviation.
- **N2.** Aliasing (`const env = process.env; spawn(NODE, a, { env })`, `const { env } = process`) is beyond what a text scanner can see. I found no such site by reading, but did not grep (no shell).
- **N3.** The old raw-line `...process.env` needle is gone and replaced by (b) on the comment- and string-blanked line. A spread written inside an `-e` source string is no longer flagged. That only matters if the outer call is unsealed, and (a) flags that case. This is not a regression.

## Out-of-lane follow-ups (for the RESULT)

- scripts/collect-from-origin.test.mjs:423 (sh -c running process.execPath, no env).
- scripts/native-continuation-smoke.test.mjs:20 (`env: process.env`) and :17 (a nested spawn written inside a string).
- janitor.test.mjs:1074 and review-run.test.mjs:111 and :577 (formerly the "inert literal" exemptions).
- The original 9 sites in 6 files.

## Pending verification (one pass once the shell works)

1. Create scratch with `mktemp -d /var/tmp/l57r2-XXXX` and `git archive 1135839`. Confirm `git diff --stat 1135839 dff5538` touches docs only.
2. Mutation: remove the env key at note-inbox.test.mjs:374 and run `findEnvLessSpawns`. Expect `[369]`.
3. Per-file counts: run the extracted scanner over `walkTestFiles`. Expect exactly the 10 files and counts at :607-628.
4. `TMPDIR=/var/tmp node --test` on the three files. Build-r1 reports 88/87/0/1 skipped.
5. The R1 multi-line shape as an in-memory string: expect 0 hits at 1135839 and 1 after the patch.

## C4 fields

Cause: part (a) treats `env: process.env` and `{...process.env}` as a valid env key and leaves them to part (b). Part (b) blanks strings and comments one line at a time with a fresh state. A line that starts inside a multi-line template (`` `], { env: process.env }) ``) is inverted, so the inheriting value is blanked and neither half flags it (hooks.test.mjs:560-563 and :590-594).
Discriminating check: the three-line shape above (a multi-line template `-e` script closed on the same line as `{ env: process.env }`). A deterministic static trace gives 0 hits at 1135839; after the R1 patch, 1 hit. Not measured, because every shell call in this session failed with ENOSPC. Add it as a unit case, with the in-memory run listed above.
Fix location: skills/multi/scripts/hooks.test.mjs: `findEnvLessSpawns` (:523 add `ownedSpans`, :560-563 put the inheriting values in `inheritsBare`, :593 skip owned spans, :544 the extent tripwire from R2, :552 comment-stripped node token from R3), plus 2 new unit cases (the multi-line template shape and a runaway extent).
Simplification: part (a) judges each spawn-family call whole, including its inheriting values. Part (b) shrinks to "wrapper calls only". That removes the split ownership at :555-559 that caused R1, and no call is judged twice.
