VERDICT: NEEDS_FIXES ad2aac97d7ff48836809b69e6584694841a03120

# C1 review (lane 36, lane-closeout): Scratch field, close --closeout, sweep-origin

Reviewer: Opus, high tier. Artifact: wt/lane-closeout-1-C1 @ ad2aac97d7ff48836809b69e6584694841a03120, diffed against 7b00418621f3b7dc168a2c1aa2f7d3618b1b6d45.
Worktree left untouched (`git status --short` empty, HEAD unchanged after the run).
Territory tests re-run: 360 tests, 357 pass, 1 fail, 2 skipped. The one failure is the known pre-existing `docs/GOALS.md ... STALE regexes`.

GOAL served: "work lost or stalled" and "rework after acceptance". Nearest NOT: "a symptom fix". Several findings below are cases where the delete path trusts a proxy (a stale ref, a name string, a dry-run cleanliness check) instead of the fact it has to prove.

All repros are node scripts in the review scratch dir `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C1-review/` (`lib.mjs`, `e1-ignored.mjs`, `e2-stale.mjs`, `e4-logline.mjs`, `e5-nested.mjs`, `e9-dry-forms.mjs`, `e13-repo-is-wt.mjs`). Each one builds a fresh repo with a local bare origin under that dir. None of them runs a shell delete. The only deletes are the ones the code under review performs itself.

One command was denied (not retried): I tried to read `git config --global user.name` to check a fixture identity, and the hook blocked it. The hook's message, verbatim:
`PreToolUse:Bash hook error: [/home/ben/.claude/hooks/git-identity-guard.sh]: GIT-IDENTITY-GUARD: blocked — command writes git config user.email / user.name (reads with --get are fine)`

Summary: 2 CRITICAL, 5 MAJOR, 4 MEDIUM, 7 MINOR.

---

## CRITICAL

### F1. A live closeout removes ignored files that the dry run reports as `dirty`
- Severity: CRITICAL (work lost; dry run and live run disagree)
- Where: `scripts/janitor.mjs:1223` computes `clean` with `isTreeClean`, whose own comment says it must count ignored files because `git worktree remove` deletes them. The dry run (`:1225-1233`) uses `clean`. The live path (`:1235-1242`) never checks it and hands the worktree straight to `applySafe`, which runs an unforced `git worktree remove`. That command refuses on untracked and modified files, but it deletes ignored ones.
- Repro (`e1-ignored.mjs`): a merged, clean worktree plus an ignored `.env`:
  ```
  DRY:  worktree: would dirty …/wt-build_e1-1 | branch: would refused build/e1-1 (...)
  LIVE: worktree: removed …/wt-build_e1-1 | branch: removed build/e1-1
  .env survives: false
  ```
- Fix (mechanical). In `scripts/janitor.mjs`, insert between the end of the `if (dryRun) { ... }` block and `const state = {`:
  ```js
  if (!clean) {
    steps.push({ step: "worktree", ref: entry.path, result: "dirty", detail: "untracked, modified or ignored files present (git worktree remove would delete ignored files)" });
    if (branch) steps.push({ step: "branch", ref: branch, result: "refused", detail: "worktree left in place (dirty)" });
    return { steps };
  }
  ```
  Predicted outcome: e1 LIVE prints `worktree: dirty` and `.env` survives. The existing clean-worktree tests are unchanged, because the dry-run tests already pass through the same `isTreeClean`.
  Add a test: an ignored `.env` in a merged worktree gives `dirty` on both dry and live runs, and the file survives.

### F2. `sweep-origin` never fetches, so `--apply` deletes branches using stale refs and loses unmerged commits on origin
- Severity: CRITICAL (work lost on the real remote)
- Where: `scripts/work-record.mjs:2054-2101`. `sweepOrigin` reads `refs/remotes/origin/*` (`:2070`) with no `git fetch`. The brief says it must "refuse everything, never proceed on stale refs". `git push origin --delete` (`:2091`) then deletes whatever tip origin has now.
- Repro (`e2-stale.mjs`): `build/e2-1` is merged and pushed. A second clone then pushes a new unmerged commit to it. `sweepOrigin({apply:true})`:
  ```
  deleted build/e2-1 e7ef962… restore: git push origin e7ef962…:refs/heads/build/e2-1
  evaluated tip: e7ef962…  real origin tip before delete: 1eab153…
  origin still has branch: false ; new commit: object present (unreferenced, gc-able)
  ```
  The restore line brings back only the stale tip. The unmerged commit is now unreferenced on origin.
- Fix:
  1. Mechanical. At the top of `sweepOrigin`, after `const apply = ...`, add:
     ```js
     const fetchResult = spawnImpl("git", ["fetch", "--prune", "origin"], { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });
     if (fetchResult.error || fetchResult.status !== 0) {
       return { rows: [], lines: ["refused UNVERIFIABLE: fetch failed"], apply, applied: [], exitCode: 2 };
     }
     ```
     In `acceptanceMain`'s sweep-origin branch, change `return 0;` to `return result.exitCode ?? 0;`.
  2. Judgment, lead ruling needed. Right before each delete (here and in closeout `:2016`), make sure origin's current tip still equals the tip that was evaluated. There are two ways:
     - `git ls-remote origin refs/heads/<name>`, compared just before the push, which narrows the race;
     - `git push --force-with-lease=refs/heads/<name>:<tip> origin --delete refs/heads/<name>`, which closes it. This lease variant is my own suggestion; I did not run it, because of the no-delete rule.

     The lease is a conditional delete, not a force. Rule on it given the no-force doctrine.
  Predicted outcome: in e2, the fetch moves `origin/build/e2-1` to `1eab153`, the verdict becomes `keep … tip is not an ancestor of origin/main`, and the branch survives.
  Add a test: fetch failure gives exit 2 and no deletes. Also a variant of e2.

---

## MAJOR

### F3. Scratch `rmSync` deletes a registered worktree, or the repo itself, when either sits inside the target
- Severity: MAJOR (work lost; the plugin's one file-delete path)
- Where: `scripts/work-record.mjs:1888-1905`. The repo-root and `git worktree list` checks are equality-only, and the `.git` check looks only at the target's own direct child. On top of that, `listWorktrees(root) || []` (`:1892`) fails open: when git cannot list worktrees, the check silently passes.
- Repro (`e5-nested.mjs`, with `DELEGATION_SCRATCH_ROOTS` set to a fixture root):
  ```
  E5a: scratch: removed …/roots/sess-e5a-000001/lane
  E5a inner worktree uncommitted work survives: false
  E5a git worktree list still names it: true        (a registration with no directory behind it)
  E5b (repo root INSIDE Scratch:) dry-run: scratch: would removed …/lane
  ```
  I did not run e5b live. It would delete the repo that holds the record.
- Fix (mechanical). Replace the `if (root) { const worktrees = listWorktrees(root) || []; ... }` block with:
  ```js
  if (root) {
    const worktrees = listWorktrees(root);
    if (worktrees === null) {
      return { step: "scratch", result: "refused", ref: scratchPath, detail: "could not read git worktree list" };
    }
    const inside = (p) => { const rel = path.relative(resolved, path.resolve(p)); return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)); };
    if (worktrees.some((w) => inside(w.path))) {
      return { step: "scratch", result: "refused", ref: scratchPath, detail: "is or contains a path in git worktree list" };
    }
    if (inside(root)) {
      return { step: "scratch", result: "refused", ref: scratchPath, detail: "contains the repo root" };
    }
  }
  ```
  Also replace `fsImpl.existsSync(path.join(resolved, ".git"))` with an `lstatSync` probe, so a dangling `.git` symlink still counts.
  Predicted outcome: e5a and e5b are both refused. The existing tests still match `/repo root/` (the equality check stays first) and `/git worktree list/`.
  Add tests for both nested cases.

### F4. The "named by another active record" check misses every name form except the exact string
- Severity: MAJOR (the brief's own attack item; deletes a branch an open record is using)
- Where: `deriveRecordBranch` (`:1726`) and its callers at `:1786` and `:1799`. The match is exact string equality on the raw `Worktree:` value. An absolute `Worktree:` path falls through to `Artifact:`, which open records usually do not have yet (`none`). A Windows path such as `C:/Users/...` is not absolute on Linux, so it is read as a branch name. Real records carry both shapes; see the `docs/work/` grep for `Worktree: C:/Users/benzh/orca/...`.
- Repro (`e9-dry-forms.mjs`, E10): another record with `Status: owned` names the same branch as `origin/build/e10-1`, `refs/heads/build/e10-1`, `build/e10-1/`, or an absolute worktree path. `sweepOrigin` returns `delete build/e10-1 …` for all four forms.
- Fix (judgment):
  1. Add `normalizeBranchName(s)`: trim, strip trailing `/`, strip a leading `refs/heads/`, `refs/remotes/origin/` or `origin/`.
  2. For each record, build the set of branches it claims:
     - the normalized `Worktree:`, when it is not a path;
     - the normalized `Artifact:` ref;
     - when `Worktree:` is a path (`path.posix.isAbsolute || path.win32.isAbsolute`), the branch that `listWorktrees(root)` reports at that path.
  3. `activeOther` and `otherOwn` test whether that set contains the name.

  Predicted outcome: all four E10 forms return `keep … named by wr-e10-other (Status: owned), not closed/withdrawn`.
  Add one test per form.

### F5. `close --dry-run` without `--closeout` now performs a real close; base refused it
- Severity: MAJOR (the brief requires plain `close` to be byte-identical to base, and a dry-run flag that writes is a trap)
- Where: `parseCloseArgs` (`:2150`) now accepts `--dry-run` and `--by` for every `close`. `acceptanceMain` (`:2201`) consults only `opts.closeout`, and `closeRecord` ignores `dryRun`.
- Repro (base module vs head module, same argv `close --record … --merge abc --at … --dry-run`):
  ```
  base THROWS: unknown or incomplete option: --dry-run
  head {"command":"close",...,"dryRun":true}      -> closeRecord writes the close
  ```
  `--by` without `--closeout` is likewise ignored silently (base threw).
- Fix (mechanical). In `acceptanceMain`, immediately after the `if (opts.closeout) { ... }` block, add:
  ```js
  if (opts.dryRun || opts.closeoutBy !== undefined) {
    throw acceptanceError("--dry-run and --by are only valid with --closeout", "closeout-flag-without-closeout");
  }
  ```
  Predicted outcome: exit 1, nothing written, the same result as base for that argv. Add a test.

### F6. The closeout `Log:` line creates a `stale-result-candidate` finding on the closed record
- Severity: MAJOR (every closed-out record becomes invalid; `continuation.mjs:159` turns that into `INVALID_RECORD`)
- Where: `:2035` `formatLogLine(at, "closeout", by, summary)` writes the session id as the Log owner. `validateRecord` (`:393-407`) treats an owner change after the newest artifact note as stale evidence. The contract's shape is `closeout skills-... <step summary>`, which puts the lead's name in the owner slot, not the session id.
- Repro (`e4-logline.mjs`):
  ```
  AFTER findings: [..., ["stale-result-candidate","owner changed at 2026-09-28T20:02:11Z (to \"sess-e4-000001\"), after the newest artifact note ..."]]
  ```
  That finding was absent before the closeout.
- Fix (mechanical):
  ```js
  // old
  const logLine = formatLogLine(at, "closeout", by, summary);
  // new
  const logLine = formatLogLine(at, "closeout", record.fields.owner ?? by, `by ${by} ${summary}`);
  ```
  Then update `docs/work-record.md:312` to `closeout <Owner> by <lead-session-id> <step>=<result> ...`, and update the test at `work-record.test.mjs` (the `owner, "closeout-session-1"` assertion) to check `note` starts with `by closeout-session-1`.
  Predicted outcome: e4 AFTER equals BEFORE. Add a test that `validateRecord` gains no finding-level code after a live closeout.

### F7. The worktree step can remove the worktree that is `--repo` itself, and on Windows it can remove the one that contains cwd
- Severity: MAJOR
- Where: `scripts/janitor.mjs:1216-1218`. `cwdReal = path.resolve(cwd)` is not a realpath. `samePath` and `startsWith` compare git's forward-slash paths (`C:/Users/...`) with `process.cwd()`'s backslash paths, so on win32 the refusal never fires. Nothing refuses the entry that is, or contains, `root`.
- Repro (`e13-repo-is-wt.mjs`):
  - E13: `closeoutWorktree({root: <linked wt>, worktreeField: <its branch>, cwd: elsewhere})` gives `worktree: removed`, the directory is gone, and the next step fails with `spawnSync git ENOENT`. In `closeoutRecord` the later steps then run against a missing repo, including F3's fail-open worktree list.
  - E14: the Windows-shaped containment comparison evaluates to `false`.
- Fix (mechanical). Replace lines 1216-1220 with:
  ```js
  const norm = (p) => { let r = path.resolve(p); try { r = realpathSync.native(r); } catch {} return process.platform === "win32" ? r.toLowerCase() : r; };
  const within = (child, parent) => { const rel = path.relative(norm(parent), norm(child)); return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)); };
  if (within(cwd, entry.path)) {
    return { steps: [{ step: "worktree", ref: entry.path, result: "refused", detail: "refuses the worktree containing process.cwd()" }] };
  }
  if (within(root, entry.path)) {
    return { steps: [{ step: "worktree", ref: entry.path, result: "refused", detail: "refuses the worktree that is (or contains) --repo" }] };
  }
  ```
  (`realpathSync` is already imported at `:109`.)
  Predicted outcome: E13 refused, and the cwd refusal fires on win32. The existing cwd tests keep matching `/process\.cwd\(\)/`.

---

## MEDIUM

### F8. The default scratch roots never match the real session layout, and `DELEGATION_SCRATCH_ROOTS` is undocumented
- Where: `:1853` `if (segments.length < 2 || !cmp(segments[0], by))` requires the session id to be the first segment directly under a root. The contract says "a whole path segment strictly between the root and the target".
- Effect: this lane's own scratch is `/tmp/claude-1000/-home-ben-Code-claude-delegation/<sid>/scratchpad/lane-closeout/`. Under the default roots (`/tmp`, and `realpath(os.tmpdir())` = `/tmp` here) the first segment is `claude-1000`, so every real closeout refuses the scratch step unless the lead exports `DELEGATION_SCRATCH_ROOTS`. That variable appears nowhere in `docs/` or `skills/`; the only mention is `grep` hit `work-record.mjs:1838`. This is a wrong refusal, so it costs a manual step every time rather than losing work.
- Fix (lead picks one; I recommend (a), which matches the contract's wording):
  - (a) Replace `:1853` with:
    ```js
    const idx = segments.findIndex((s) => cmp(s, by));
    if (idx === -1 || idx >= segments.length - 1) continue;
    ```
    Keep the rest.
  - (b) Keep the stricter rule, and document `DELEGATION_SCRATCH_ROOTS` with the project-scratch parent in `docs/work-record.md` and the lead brief.

  Either way:
  - accept only absolute root entries (`if (t && path.isAbsolute(t))`). Today `.` resolves to cwd, which may be the repo, and `~` becomes a literal `./~`.
  - add tests for `..` segments, a trailing slash, an env root, and the real nested layout.

  Predicted outcome of (a): this lane's real Scratch path passes under `/tmp`, and the session directory itself is still refused.

### F9. A Windows-authored `Scratch: C:/...` is refused as `scratch-invalid` on Linux
- Where: `:121`. `path.isAbsolute("C:/Users/…")` is `false` on Linux (E15), so a cross-host record fails `validateRecord`, `accept` and `check-acceptance`, and `continuation` on the Linux host.
- Fix (mechanical): at `:121`, change `if (!path.isAbsolute(scratch))` to `if (!(path.posix.isAbsolute(scratch) || path.win32.isAbsolute(scratch)))`.
  In `removeScratchDirectory`, before `path.resolve`, add `if (!path.isAbsolute(scratchPath)) return { step: "scratch", result: "refused", ref: scratchPath, detail: "not absolute on this host (recorded on another OS)" };` so a foreign path is never resolved against cwd.

### F10. `--exclude` silently drops keep-list entries
- Where: `parseSweepOriginArgs` `:2171` overwrites a repeated `--exclude`, and `sweepOrigin` `:2061` does not normalize names.
- Repro (E12):
  - `--exclude a --exclude b` parses as `"b"`.
  - `--exclude origin/build/e12-b` leaves `build/e12-b` as `delete`.
  - Spaces and a trailing comma are handled correctly (`" build/e12-a , "` keeps `build/e12-a`).
- Fix (mechanical):
  - In the parse loop: `opts[key] = key === "exclude" && opts.exclude !== undefined ? `${opts.exclude},${argv[i + 1]}` : argv[i + 1];`
  - In `sweepOrigin`: `.map((s) => normalizeBranchName(s))`, using the helper from F4.
  - Print `warn exclude <name> matches no origin/build/* branch` for each unmatched entry.

### F11. `--by` gates only the scratch step
- Where: `:1821`. Any session that passes any `--by` can remove the worktree, delete the local and origin branches, and write the `Log:` line. The contract places the check under step 5 only, so this is a ruling request, not a defect in the letter of the contract.
- Suggest: check `record.fields.leadSession === by` once, right after `by` is read (`:1938`), and refuse all four steps with that reason. Also reject a `by` that is not `\S{1,64}`; today one with a space produces a malformed `Log:` line and `MALFORMED_RECORD` in continuation.

---

## MINOR
- **M1.** Dry run and refs, the brief's proof item (`e9-dry-forms.mjs`, E9). I snapshotted refs, the worktree list, `status --ignored`, the record's hash, origin's refs and the scratch directory before and after `--dry-run`.
  - When origin had not moved, nothing changed.
  - When origin had advanced, `refs` changed: the mandatory `git fetch origin` updates `refs/remotes/origin/*`.

  Document it in `docs/work-record.md`: "`--dry-run` still fetches; it changes nothing else".
- **M2.** Pushes use short names at `:2016` and `:2091`. Use `refs/heads/${name}` so a same-named tag on origin cannot make the delete ambiguous. Also use `git fetch --prune origin` at `:1970`. Without it, a branch already deleted on origin keeps its tracking ref, is evaluated `delete`, and the push fails. That gives `refused` and exit 2 where the answer should be `absent`.
- **M3.** Scratch edge cases in `removeScratchDirectory`:
  - a target that is a regular file is removed, so require `lst.isDirectory()`;
  - an `lstat` error other than `ENOENT` (for example `EACCES`) is reported `absent`, which exits 0;
  - there is a check-then-delete race: an ancestor swapped for a symlink between `realpathSync` and `rmSync` would be followed. I noted it and did not exploit it, per the brief.
- **M4.** `sweep-origin` always exits 0: after `delete-failed`, and when `for-each-ref` fails (`:2073`, where it silently lists nothing). `git push` stderr is inherited, so the `To … [deleted]` lines interleave with the report lines.
- **M5.** The closeout `Log:` write (`:2041`) joins lines with `\n`, which turns a CRLF record into LF. It also writes to `path.resolve(repoRoot, recordPath)` rather than through the confined path used for the read.
- **M6.** Tests that are not looking, or are missing:
  - "refuses a branch not under build/ (main, docs/*, feat/*)" (`work-record-closeout.test.mjs:273`) tests only `main`; add `docs/x` and `feat/x`;
  - there is no test for the "symlinked ancestor" branch (`:1880`), `..` segments, a trailing slash, `DELEGATION_SCRATCH_ROOTS`, win32 case folding, or a duplicate `Scratch:` singleton refused through `accept`;
  - the seventh-reason test is a regex over source text. That is acceptable as stated, since the check is genuinely redundant with reason 3.
  - Every other refusal test does assert its specific reason, not just a nonzero exit.
- **M7.** Performance: `tipBehindMergeCommit` spawns 4 git processes per first-parent merge per branch. The real repo has 69 merges and 41 `origin/build/*` branches, so a sweep can reach about 11k spawns. The containment it tests is monotonic along the first-parent chain, so a binary search over `git rev-list --first-parent origin/main` finds the unique M in O(log n).
- **M8.** Out of territory: the builder edited `scripts/record-closed-and-skip.contract.test.mjs` (3 lines, a fixture only, disclosed in the report). The territory map does not list it; the lead should accept or move it explicitly.

---

## Verified absent: attacked, and they hold
- `-D` is unreachable: `applySafe` receives `branches: []`, and the local branch is deleted only by `git branch -d --` (`janitor.mjs:1253`).
- The main worktree is refused, both by path and by `Worktree: .`.
- A dirty worktree with untracked or modified files is reported `dirty` and never forced. The ignored-file case is F1.
- Merge proof: a fetch failure refuses all four steps with `UNVERIFIABLE: fetch failed`, and an Artifact that is not an ancestor refuses all four. Both are tested, with specific reasons.
- Origin rules. Each of these branches is refused:
  - a fresh branch cut from main whose tip is a strict ancestor of main (E11: `tip is not on the mainline behind a merge commit`);
  - a fast-forward merge (tested);
  - a tip equal to main's tip (tested);
  - `main` (tested);
  - `docs/*` and `feat/*` (regex; tests missing, see M6);
  - `origin/build/x` given as this record's own branch (fails the `^build/` check).

  A bare-sha `Artifact:` with an absolute `Worktree:` gives `refused (no branch name could be derived)`. That fails safe.
- Scratch paths. Each of these is refused:
  - `..` segments and a trailing slash, which are normalized before the checks;
  - the session directory itself;
  - the session id appearing only as a substring of a segment (segments are compared whole);
  - the session id appearing only as the root;
  - a symlink as the target (tested);
  - a symlinked ancestor (the realpath comparison);
  - an empty `DELEGATION_SCRATCH_ROOTS` entry, which is filtered out rather than becoming cwd.

  A `/` root still requires `/<sid>/<x>`. A home root requires `~/<sid>/<x>`, which is acceptable.
- Tests use only local bare origins (grep of the added test lines: every `push` targets a `git init --bare` fixture). `sweep-origin` is a dry run by default (tested, and E12). Every successful origin delete prints a restore line.
- The `Log:` line is written only by the script, and never on `--dry-run` (tested, and E9).
- `Scratch:` is a singleton through `SINGLETON_LABELS`, which is derived from `FIELD_LABELS`. `SCRATCH_FROM` is set to 2099, `opts.scratchFrom` is injectable, a record from before the cutoff with no `Scratch:` gets a warning only, and a relative value is refused (see F9 for the Windows form).
- "Unreachable refusal" fix: it hides no ordering bug. Both orders refuse, and only which reason is printed changes. After the reorder, reason 2 in effect means "claimed by a closed or withdrawn other record". The real weakness in both checks is the name matching (F4), not the order.
