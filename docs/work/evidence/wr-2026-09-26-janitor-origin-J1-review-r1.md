VERDICT: NEEDS_FIXES (2)

# J1 review, round 1: build/janitor-origin-1 at 6c9bc850ae4be8bef4cf6086935923b0c88b137f (base c3f9ad0)

Scope: scripts/janitor.mjs, scripts/janitor.test.mjs, skills/janitor/SKILL.md (diff c3f9ad0..6c9bc85). HEAD 8a40359 changes only the work record. The reviewed tree was read-only. All probes ran on a scratch clone of 6c9bc85 against fixture repos with a bare origin, under the session scratch dir. Every mutation was reverted and the clone's `git status` came back clean.

## Gate (rerun)

- `node --test scripts/janitor.test.mjs skills/multi/scripts/hooks.test.mjs scripts/mirror-shared-skills.test.mjs`: tests 107, pass 107, fail 0 (N2 scanner green).
- `node scripts/run-tests.mjs` (full sealed suite, Windows): tests 1804, pass 1804, fail 0, exit 0.
- Mutation checks on the scratch copy. Each new test fails when its fix is reverted:
  - `-D` changed back to `-d` (janitor.mjs:1093): "J1 item 3 ... IS deleted under --apply" fails, and so does the exactly-one-`-D` source test.
  - Fetch stubbed to a no-op success (janitor.mjs:939): "J1 item 2 merged on origin only" and "J1 item 3 -D" fail, along with the fetch-failure test.
  - `originUnverifiable` forced to false (janitor.mjs:942): "J1 item 1: a fetch that fails ..." fails.

## Bug-fix fields (C4)

Cause: SAFE was gated on ancestry to the checkout's local `refs/heads/<main>` (`isBranchMerged`), with origin only as a second confirmation computed after a local merge was found. Nothing ever fetched, and deletion used `git branch -d`, which judges against the checkout's HEAD or upstream. So a stale local main kept every branch merged on origin standing.
Discriminating check: the fixture "merged on origin only, stale local main" (janitor.test.mjs:1989, 2030). It is SAFE and deleted at 6c9bc85. It fails when the fetch is stubbed out or when `-D` goes back to `-d` (measured above), so the tests pin the cause, not a symptom.
Fix location: scripts/janitor.mjs `gatherState()` (fetch first, `onOrigin` unconditional, 936-974), `classify()` (SAFE gated on `onOrigin` only, UNVERIFIABLE downgrade, 658-669 and 719-771), `applySafe()` (`-D`, 1093).
Simplification: the correct fix is small (one fetch, one gate change, one flag change), but deleting with `-D` removed git's own last guard. So the proven sha has to travel with the SAFE row and be rechecked at delete time (MAJOR 2 below). That is simpler and safer than anything else that would restore the guard.

## Attack brief, item by item

- **UNSTARTED branch reaching `-D`: not possible (verified).** Probe P8: one branch at the stale local-main tip and one cut from `origin/main` after a fetch, with origin advanced by another merge, `--apply`. Both survive. The branch loop checks `b.unstarted` before anything else (janitor.mjs:708). The worktree loop checks it before the origin gate (650). An unstarted worktree is never in `removedHere`, so its branch cannot ride it into SAFE.
- **Fetch that fails halfway: downgraded correctly (verified).** P4 made one tracking ref unlockable (`zz-new.lock`) while `main` updated in the same fetch. git exits non-zero, `fetch.ok === false`, SAFE is empty, and `FETCH FAILED` is line 1. Treating a partial fetch as failed outright is the stricter reading and is correct. See MINOR 3 for how that first line reads.
- **Repo with no origin: never SAFE, nothing deleted (verified).** P5 ran `--apply` with no origin remote. The branch merged into local main survives, the banner is on line 1, and the exit code is 1.
- **Detached HEAD checkout: correct (verified).** P6 detached the main checkout and ran `--apply`. The branch merged on origin was deleted and main was kept. A detached linked worktree is still skipped (janitor.mjs:655).
- **`--apply` run from a linked worktree: correct (verified).** P7: the runner worktree and its branch are kept, a SAFE sibling worktree is removed and its branch deleted, and a plain branch merged on origin is deleted. Fetch from a linked worktree works (the refs are shared).
- **Branch merged on origin, then re-pushed with new commits between fetch and delete.** The literal re-push case loses nothing, because the new commits live on `origin/<branch>`. Its twin, a new commit made locally in that window, is lost (MAJOR 2).
- **`-D` reachable from anywhere other than SAFE after this run's fetch and ancestry check: reachable under `--no-fetch --apply` (MAJOR 1).** There is exactly one `-D` site (janitor.mjs:1093), and it reads only `state.safe.branches`.
- **Failed fetch goes to UNVERIFIABLE, never SAFE, stated on the first lines: holds for local classes (verified), not for the remote class (MINOR 1).** Both loops check the downgrade before the protected, checked-out and SAFE paths (666, 719). Line 1 of the text report is `FETCH FAILED`, and `--json` carries `fetch`.
- **`--no-fetch` label is truthful: partly (MINOR 2).** The age can be a fetch of a different remote.
- **Lane-five guards still hold (verified).** UNSTARTED ordering is unchanged. The 6 h floor still gates both SAFE paths (680, 767), with an unknown age treated as below the floor. `summarizeCounts` still reads `.length` of the printed arrays (1117-1127).
- **Changed old test is justified (verified).** It is the only pre-existing test touched (diff hunk at janitor.test.mjs:374). The `branch -D` ban became an exactly-one-site assertion. That is justified by spec item 3, and it is stricter than a plain removal would have been.
- **Past bug classes.** Symlinked parent through a root check: no new path walking. The only new filesystem read is `statSync` on git's own `--git-path FETCH_HEAD`, which is read-only. `created_by_tool`: no new self-asserted input. N2: the new tests use the file's existing `git()` helper, which passes no env, and the N2 scanner is green.

## Findings

### MAJOR 1: `--no-fetch --apply` reaches `git branch -D` with no fetch this run, even when the fetch age is unknown

Evidence:
- Spec item 3: "`-D` is only reached from the SAFE class after the origin ancestry check passed in this same run, after the fetch".
- gatherState, janitor.mjs:936-944: under `noFetch`, `originUnverifiable` is false, so SAFE is populated from whatever `refs/remotes/origin/<main>` last held.
- main(), janitor.mjs:1383-1386: `applySafe` runs regardless of `noFetchFlag`.
- SKILL.md:57 documents this as intended ("or be skipped by `--no-fetch`").

Measured:
- P2: fetch, then the origin is made unreachable, then `main(["--no-fetch","--apply","--min-age-hours","0"])` prints `branch-delete | feat-nofetch | true`. The branch is gone and no fetch was attempted.
- P2b: with no reflog on origin/main and FETCH_HEAD removed, the SAFE row reads `merged into origin/main (as of last fetch, age unknown)`. `--apply` would `-D` it. That is an unknown feeding a destructive action.

Fix: `--no-fetch` becomes report-only. Two changes, both mechanical:

1. main(), janitor.mjs, right after `parseFlags`:
   - old:
     ```
     const { applyFlag, jsonFlag, outsideFlag, minAgeHours, record, noFetchFlag } = parseFlags(argv);
     ```
   - new:
     ```
     const { applyFlag, jsonFlag, outsideFlag, minAgeHours, record, noFetchFlag } = parseFlags(argv);
     if (applyFlag && noFetchFlag) {
       // J1 item 3: -D is reached only after THIS run's fetch; --no-fetch is report-only.
       process.stderr.write("janitor: --apply needs this run's own fetch; --no-fetch is report-only\n");
       return 3;
     }
     ```
2. Defence in depth in applySafe, janitor.mjs, at the top of the branch loop (before the `failedWorktreeBranches` check):
   - new:
     ```
     if (!(state.fetch && state.fetch.attempted && state.fetch.ok)) {
       log.push({ action: "branch-delete", ref: b.ref, ok: false, error: "skipped: no successful fetch this run" });
       continue;
     }
     ```
   Every existing applySafe test builds its state through `gatherState` with a live fetch against a fixture bare origin, so none of them change behaviour.
3. SKILL.md:56-57: replace "this run's fetch of it must have succeeded (or be skipped by `--no-fetch`)" with "this run's fetch of it must have succeeded; `--no-fetch` reports SAFE as of the last fetch but `--apply` refuses it".
4. Test: the "--no-fetch" fixture plus `main(["--no-fetch","--apply","--min-age-hours","0"])` should return 3 with `feat-nofetch` still listed.

Predicted outcome: P2 exits 3 and the branch survives. All other tests stay green.

### MAJOR 2: `-D` deletes whatever the branch points to at delete time, not the sha proven merged, and a commit made between classify and apply is lost

Evidence:
- classify records only the name in a SAFE row (janitor.mjs:770).
- applySafe deletes by name with force (1093). Nothing rechecks the tip.
- Under the old `-d`, git refused a branch with unmerged commits. `-D` removed that last guard, so the ancestry proof now covers a sha that may no longer be the one deleted.

Measured:
- P1: a SAFE worktree and branch (merged on origin) go through `gatherState`. A new commit is then made in that worktree, and `applySafe(state)` runs. The worktree is removed (clean tree, so no refusal), the branch is `-D`'d, and the late commit is on no ref: `for-each-ref --contains` is empty, and it is not in origin/main.
- P1b: same result for a plain branch that is not checked out and whose ref moved after classify.
- Control on the same shape with an up-to-date local main: `git branch -d` refuses ("not fully merged").

The window runs from gatherState to the delete. It includes per-branch git calls, `du -sk`, and `checkWiring`, which is seconds to minutes on a real repo. Builders and leads work concurrently in lane worktrees. This is the "rework after acceptance" metric the spec says must not worsen.

Fix (mechanical):
1. gatherState branch map, janitor.mjs:963-974: add `tip: refSha(root, headRef(name)),` to the returned object.
2. classify SAFE branch push, janitor.mjs:770:
   - old:
     ```
     safe.branches.push({ ref: b.name, reason: `merged into origin/${mainBranch}${fetchAgeSuffix}` });
     ```
   - new:
     ```
     safe.branches.push({ ref: b.name, sha: b.tip || null, reason: `merged into origin/${mainBranch}${fetchAgeSuffix}` });
     ```
3. applySafe, janitor.mjs, immediately before `git(["branch", "-D", "--", b.ref], root);` (inside the existing try, after the `stillCheckedOut` check):
   ```
   const tipNow = refSha(root, headRef(b.ref));
   if (!b.sha || tipNow !== b.sha || !isBranchOnOrigin(root, b.ref, state._raw.mainBranch)) {
     log.push({ action: "branch-delete", ref: b.ref, ok: false, error: `skipped: tip moved since it was proven merged on origin this run (${b.sha ? b.sha.slice(0, 7) : "none"} -> ${tipNow ? tipNow.slice(0, 7) : "gone"})` });
     continue;
   }
   ```
   That leaves a window of milliseconds between the recheck and `-D`. If the builder wants it fully atomic, use `git update-ref -d refs/heads/<name> <sha>` (a compare-and-delete on a full refname, which fits the file's ref rules), followed by `git config --remove-section branch.<name>` ignoring failure. The exactly-one-`-D` test would then be adjusted, and the Log would say so.
4. Regression test: build the item-2 fixture, `gatherState`, commit in the worktree, `applySafe(state)`. Assert the branch still exists, its tip is the late commit, and the log carries `skipped: tip moved`.

Predicted outcome: P1 and P1b keep the branch with the late commit. The worktree is still removed, which loses no commits because the branch holds them. Every existing test stays green, since none moves a tip between gather and apply.

### MINOR 1: a failed fetch does not downgrade the remote class, which still prints `git push origin --delete` as a merged verdict

Evidence: janitor.mjs:798-811 builds rows from `rb.merged` off stale `refs/remotes/origin/*` without consulting `originUnverifiable`. P10: with the origin unreachable, `fetch.ok` is false, yet the row reads `origin/feat-remote | remote branch merged into main (at 0c2a905, as of last fetch) | git push origin --delete feat-remote`. It is report-only, but the spec says "every merge judgment".

Fix:
1. Pass `originUnverifiable` into the remote loop.
2. In the loop, before `if (rb.merged)`, add:
   ```
   if (rb.merged && originUnverifiable) {
     judgmentRemoteBranches.push({ ref: `origin/${rb.name}`, reason: `merge judgment UNVERIFIABLE this run: git fetch origin failed`, command: "" });
     continue;
   }
   ```

Predicted: P10 shows UNVERIFIABLE with no command.

### MINOR 2: the `--no-fetch` age can reflect a fetch of a different remote, so a 5-day-stale origin reads "1m ago"

Evidence: `lastFetchAgeHours` (janitor.mjs:204-224) takes the newer of origin/main's reflog time and `FETCH_HEAD`'s mtime. `FETCH_HEAD` is rewritten by any fetch or pull of any remote, and by a narrow `git fetch origin <other-branch>`. P3 (no reflog on origin/main, FETCH_HEAD backdated 5 days) reports 120.0 h. After `git fetch upstream` it reports 0.00001 h, while origin/main has not been refreshed. `FETCH_HEAD` is also per-worktree, so from a linked worktree the age silently falls back to reflog only. SKILL.md:47-48 says FETCH_HEAD is used "when that ref has none", but the code takes the max of both.

Fix: accept `FETCH_HEAD`'s mtime only when its content proves it was origin's main that was fetched to the current value. Read the file and require a line whose sha equals `refSha(root, "refs/remotes/origin/<main>")` and which contains `branch '<main>' of `. Otherwise ignore it and fall back to reflog-only, or "age unknown". Align SKILL.md:47-48 with whichever rule ships.

Predicted: P3's second reading stays at 120 h, or "age unknown". Once MAJOR 1 is fixed, this affects the label only.

### MINOR 3: the fetch error is dumped raw, as multi-line git stderr, into the report's first line and into every row reason

Evidence: `fetchOrigin` returns `err.message` (janitor.mjs:190), which is "Command failed: git fetch origin --prune\n" plus git's full stderr. P4 and P5: the "first line" is a 5-15 line blob, including git's "Another git process seems to be running..." advice. P9: each UNVERIFIABLE row's reason spans several lines and breaks the table. The message also carries the remote URL.

Fix, janitor.mjs:189-190:
- old:
  ```
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  ```
- new:
  ```
  } catch (err) {
    const text = String((err && (err.stderr || err.message)) || err);
    const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const first = lines.find((l) => /^(fatal|error):/.test(l)) || lines[0] || "unknown error";
    return { ok: false, error: first };
  ```

Predicted: line 1 reads `FETCH FAILED: ... (fatal: 'origin' does not appear to be a git repository).`, and rows stay on one line.

### MINOR 4: the new network call has no timeout and can block on a prompt

Evidence: `fetchOrigin` goes through `git()` (janitor.mjs:164-166, 187). That call has no `timeout`, and nothing sets `GIT_TERMINAL_PROMPT=0`. The janitor never touched the network before. An https origin that needs credentials can open a Git Credential Manager dialog on Windows and wait. An unreachable host waits for the OS connect timeout.

Fix: in `fetchOrigin` only, call `execFileSync("git", ["fetch", "origin", "--prune"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } })`. This is production code; the N2 scanner covers only `*.test.mjs`. A timeout then lands as `ok: false`, which gives UNVERIFIABLE.

### MINOR 5: SKILL.md adds a new section, which the spec forbids ("no new sections")

Evidence: SKILL.md:39 `## Origin is the record of truth` is a new `##` heading. Base headings are at c3f9ad0:7,16,35,81,94,104,113,122. The builder's report says "no new top-level sections", but this is one. SKILL.md:35 also uses build-narrative voice ("the branch this fix exists to delete").

Fix: delete the heading line and its blank line so the paragraph opens "## The two classes", or sits at the end of "janitor never deletes a file". Reword "this fix exists to delete" to "the branch janitor has just proven merged on origin".

### NIT 1: the `--no-fetch` test would pass with "age unknown"

janitor.test.mjs:2140 asserts `/as of last fetch/`, and the banner assertion (2151) doesn't check the age either. Tighten it:
- old: `assert.match(row.reason, /as of last fetch/, ...)`
- new: `assert.match(row.reason, /as of last fetch, \d/, ...)`

### NIT 2: the builder report overstates the `--no-fetch` labelling

It says every origin-derived "SAFE/JUDGMENT reason" is labelled, but `fetchAgeSuffix` is appended only to SAFE rows (janitor.mjs:684, 770). P11: "merged, but checked out in a worktree this run is not removing" carries no age. The text report's first-line banner covers it. In `--json`, consumers get it only through the top-level `fetch`. Either append `fetchAgeSuffix` at 728 and 744 or correct the report wording.

### NIT 3: a fetch refspec that doesn't cover `<main>` is never flagged

If `remote.origin.fetch` does not cover `<main>` (a narrowed refspec), `git fetch origin --prune` succeeds without refreshing `origin/<main>`, yet the verdict is presented as fresh. This is conservative unless origin rewinds. Optionally compare `origin/<main>` before and after against `git ls-remote origin refs/heads/<main>`, or document it.

## Verified absences

- No path other than `state.safe.branches` reaches `-D`. There is one call site (janitor.mjs:1093), and the source test pins it at exactly one.
- No SAFE row is possible after a failed fetch, for local worktrees and branches: both loops check the downgrade before the protected, checked-out and SAFE paths.
- Local main plays no part in SAFE. `merged` only feeds JUDGMENT wording (660, 729-730, 751-754).
- No UNSTARTED row reaches SAFE or `-D` (P8, plus code order).
- Worktree removal still uses the unforced `git worktree remove --` (1036).
- No new test builds an env by hand (N2 green).
