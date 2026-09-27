VERDICT: NEEDS_FIXES (8) eaa36313a4f9aa263ed27b9d1df537df454b91d4

# C1 review, round 1 (collect-status-1)

Reviewed: `/home/ben/Code/wt-collect-status-1-C1`, branch `build/collect-status-1-C1`, HEAD
`eaa36313a4f9aa263ed27b9d1df537df454b91d4` (from `git rev-parse HEAD` in the worktree), diff
`31a23e2..eaa3631`. That covers two new files, `scripts/collect-status.mjs` (325 lines) and
`scripts/collect-status.test.mjs` (436 lines), plus the builder's report, state file and gate log.
I checked them against spec.md "C1", contracts.md K1/K2/Process, briefs/C1.md and scout-C1.md.

Gate re-run by me: `node scripts/run-tests.mjs scripts/collect-status.test.mjs` exited 0 with
`tests 21, pass 21, fail 0`. The log went to the scratch folder, not the tree. The worktree was
still clean afterwards (`git status --short` printed nothing).

All the probes below ran from the scratch folder. They import the module from the worktree
read-only and inject `collectMain` and `spawnNoteSend`. I tried every patch on a `git archive`
copy in scratch, never in the reviewed tree.

Severity counts: 0 BLOCKER, 2 MAJOR, 6 MINOR, 1 NIT.

---

## F1 MAJOR: a failed-fetch run uses up a change, so that wake is lost for good. `announced` is written but never read.

- `scripts/collect-status.mjs:285` compares against the previous run's `changeKey`:
  `const sameAsPrevious = Boolean(previousStatus) && previousStatus.changeKey === currentKey;`
- `:308` saves `changeKey: currentKey` on every run, failed-fetch runs included. `:297` holds
  `announced` back on a failed fetch, but nothing ever reads `announced`. So K2's rule "does not
  update `announced`" is met on paper and changes nothing.
- How it fails: a failed-fetch run still builds rows from the local `origin/*` refs. On the
  reference checkout another process (the lead's own `git fetch`) can move those refs between
  timer ticks. The failed run then sees new state B, sends nothing (correct), and saves
  changeKey=B. The next good run sees B equal to the saved key and stays silent. B is never
  announced.
- Measured (probe `probe.mjs`, scenario A). Run 1: rows A, fetch ok, 1 call. Run 2: rows B, fetch
  failed, still 1 call (correct), `announced` still equals A. Run 3: rows B, fetch ok, **still 1
  call; 2 expected**.
- The existing fetch-failure test (`collect-status.test.mjs:380-395`) passes without testing
  this. It runs once, with no previous status, and asserts `announced === null`, a value no
  behaviour depends on.
- **Patch** (`scripts/collect-status.mjs:285`):
  - old: `    const sameAsPrevious = Boolean(previousStatus) && previousStatus.changeKey === currentKey;`
  - new: `    const sameAsPrevious = Boolean(previousStatus) && (previousStatus.announced ?? null) === currentKey;`
  - Also change the header comment at `:17-18` from "Equal to the previous run's own recorded
    key" to "Equal to the last announced key (status.json `announced`)".
- **Regression test** (append to `collect-status.test.mjs`):
  ```js
  test("a failed fetch that sees a change does not swallow it: the next good run announces it", () => {
    const out = outTmp(); const spawn = fakeSpawnCounter();
    const row = (b) => ({ branch: b, tipSha: "a".repeat(40), tipDate: "2026-09-27T00:00:00Z", recordPath: `docs/work/${b}.record.md`, status: "owned", artifactSha: null, merged: null, hoursSinceLog: 1, state: "owned" });
    const collect = (rows, fail) => (argv, o) => { if (fail) o.warn("collect-from-origin: git fetch failed, proceeding with local refs: x"); o.write(JSON.stringify(rows)); return 0; };
    const root = initRepoWithOrigin();
    const base = { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend };
    main(["--repo", root, "--out", out, "--to", "lead"], { ...base, collectMain: collect([row("b1")], false) });
    main(["--repo", root, "--out", out, "--to", "lead"], { ...base, collectMain: collect([row("b1"), row("b2")], true) });
    assert.equal(spawn.calls.length, 1, "failed fetch: no note");
    main(["--repo", root, "--out", out, "--to", "lead"], { ...base, collectMain: collect([row("b1"), row("b2")], false) });
    assert.equal(spawn.calls.length, 2, "the change seen during the failed fetch is announced on the next good run");
  });
  ```
- Verified on the scratch copy:
  - With the patch, the probe's run 3 makes 2 calls, and the suite plus this test is 23/23 when
    added together with F4's test.
  - With the source reverted to HEAD, the test fails (`✖`).
  - The existing change-key, quiet and fetch-failure tests keep passing, because `announced`
    equals `changeKey` on every run where a send was attempted.

## F2 MAJOR: status.md has no 60-line budget, and its budget test is too small to catch that

- The spec says status.md is "at most 60 lines". `buildStatusMd` (`scripts/collect-status.mjs:215-227`)
  prints 1 header line, an optional note line, `attention (n)`, one line per attention entry, the
  table header, and one line per row. Nothing caps it.
- Measured with `probe.mjs` scenario B, `main()` with injected rows:
  - 40 rows, half `owned` and half `no-record`: **64 lines**.
  - 40 `no-record` rows: **84 lines**.
- The reference checkout has **39** `refs/remotes/origin/*` refs today. 8 rows are unmerged now
  (6 no-record, 2 owned), so a busy day gets close to the limit.
- `collect-status.test.mjs:412-426` is exactly the attack brief's "check that passes because it
  isn't looking". It uses a 5-branch fixture, and it counts only non-empty lines (`filter((l) =>
  l.length > 0)`).
- The builder's deviation 4 calls truncation "an interpretation contracts.md doesn't authorize".
  But the 60-line cap is a stated spec requirement, and the attack brief names this case. Meeting
  the cap is compliance, not new interpretation. The one real choice is what to cut, and the full
  data already lives in status.json.
- **Fix instruction** (a judgment call, so no drafted rewrite): give `buildStatusMd` a line
  budget of 60.
  - Keep the header, the note line and `attention (n)`.
  - Cap the attention entries, then fill the rest with table rows (table header included).
  - When anything is cut, end the section with one line: `(+K more, see status.json)`. That line
    counts toward the 60.
  - Keep the table's own line format byte-identical to `formatTable` for every row it prints.
    Simplest way: call `formatTable(rows.slice(0, k))`.
- Test with the exported `buildStatusMd` on 40 synthetic rows (no git needed), all `no-record`
  so the attention list is 40 long too. Assert `md.split("\n").length - 1 <= 60` counting every
  line, and assert the `(+K more` line is present.
- Predicted outcome: on current code that test fails (84 > 60) and it passes once truncation is in.

## F3 MINOR: a failed note-send doesn't show up in status.md

- `scripts/collect-status.mjs:190-193` records a non-zero exit as `sent: true, reason: "note: send exit N"`.
  `:221` prints the reason only when `!sendOutcome.sent`, so an exit-1 rejection (envelope or
  validation) never appears anywhere.
- `announced` still moves forward, so no later run retries. For exit 2 and 3, moving it forward
  is correct: note-send says "the ledger has the note ... Do NOT re-send" (`note-send.mjs:848-852`).
  But the lead needs to see the failure.
- Measured (probe scenario C): with the spawn returning `{status: 1}`, status.md contains no
  `send exit` line.
- **Patch** (`scripts/collect-status.mjs:221`):
  - old: `  if (sendOutcome.attempted && !sendOutcome.sent && sendOutcome.reason) lines.push(sendOutcome.reason);`
  - new: `  if (sendOutcome.reason) lines.push(sendOutcome.reason);`
- Predicted and verified on scratch: status.md shows `note: send exit 1`. A successful send still
  prints nothing, because `reason` is null there. The suite stays green.

## F4 MINOR: a missing or typo'd `--main` ref wakes the lead with "0 lanes on origin"

- If `--main` doesn't resolve, collect-from-origin (`collect-from-origin.mjs:156-160`) outputs
  `[]`. Its warning is not the fetch-failed one, so `fetchFailed` stays false. The key becomes ""
  and a RESULT goes out claiming there are no lanes. The next good run then wakes the lead a
  second time.
- Measured (`probe3.mjs`, `--repo /home/ben/Code/claude-delegation --no-fetch --main origin/no-such-main`,
  read-only): 1 call with `--text "0 lanes on origin: none, attention 0"`, and the header reads
  `main: unknown | rows: 0`.
- **Patch** (`scripts/collect-status.mjs:288`):
  - old: `    if (!fetchFailed && !sameAsPrevious) {`
  - new: `    if (!fetchFailed && mainSha && !sameAsPrevious) {`
  - `announced` then carries over unchanged, through `:297`'s else-branch.
- **Test**: `main(["--repo", root, "--no-fetch", "--main", "origin/nope", "--out", out, "--to", "lead"], {spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend})`
  and assert `spawn.calls.length === 0`.
- Verified on scratch: the test fails on HEAD and passes with the patch. Every existing fixture
  has `origin/main`, so no existing test changes.

## F5 MINOR: the merge-hours boundary isn't tested at the boundary

- The spec asks for "attention rules at each threshold boundary". `collect-status.test.mjs:162-163`
  tests 3h and 5h against a 4h threshold. Code that used `>=` instead of `>` would still pass.
  The stale-hours test does sit on the boundary (6 vs 6.01, `:174-175`).
- **Patch** (`scripts/collect-status.test.mjs:162-163`):
  - old: `  const justUnder = new Date(now - 3 * 3_600_000).toISOString(); // 3h old, threshold 4h`
  - new: `  const justUnder = new Date(now - 4 * 3_600_000).toISOString(); // exactly 4h old: not over`
  - old: `  const over = new Date(now - 5 * 3_600_000).toISOString(); // 5h old`
  - new: `  const over = new Date(now - 4 * 3_600_000 - 1000).toISOString(); // 4h + 1s: over`
- Verified on scratch: passes on current code. With `>` mutated to `>=` it would flag `b-under`
  and fail, which is the point.

## F6 MINOR: the never-writes assertion checks only `.git`, but the spec forbids any write under the repo

- The spec says "no writes under the repo, no git writes". `snapshotGitDir`
  (`collect-status.test.mjs:73-87`) walks only `<root>/.git`. A stray status file written into the
  working tree would not be caught.
- The test does run the collector's own write path (it writes to `--out`), so it is exercised
  code, just not a complete assertion.
- **Patch** (`scripts/collect-status.test.mjs:74` and `:83`): delete the line
  `  const gitDir = path.join(root, ".git");`, then replace `  walk(gitDir);` with `  walk(root);`.
  Optionally rename the helper to `snapshotRepo`.
- Verified on scratch: still passes (23/23 together with the other patches), so the working tree
  really is untouched today.
- Out of C1's scope, for the seam and the lead: in a real send, note-send appends to
  `<recipient-repo main checkout>/docs/ledger/<day>.md`. The dry-run plan showed
  `append envelope to /home/ben/Code/claude-delegation/docs/ledger/2026-09-27.md`. The spec
  itself requires this (`--recipient-repo <repo>`), and `--quiet` keeps it out of the test.

## F7 MINOR: the test fixtures are copied, not reused, and the file claims otherwise. Cleanup breaks the Process rule.

- The spec says "reuse its helper, do not fork it". `collect-status.test.mjs:26-87` re-declares
  `git`, `mkTmp`, `writeRecord`, `commitAll`, `initRepoWithOrigin`, `newBranch`, `pushBranch`,
  `backToMain` and `snapshotGitDir`. Yet the header comment (`:3`) says "Reuses
  collect-from-origin.test.mjs's bare-remote fixture builders", and the builder's report lists no
  deviation for it.
- Real reuse would mean moving the helpers into a shared module, which touches
  `collect-from-origin.test.mjs` and is outside C1's territory. That needs a check-in, not a quiet
  copy.
- Separately, contracts.md Process says "Tests clean up only through the existing makeTempHome
  helpers". `:428-436` runs `fs.rmSync(dir, {recursive: true, force: true})` in an `after()`. That
  copies collect-from-origin.test.mjs:554-557, but it is still a delete outside makeTempHome.
- **Fix**:
  - (a) Change `:3-5` to say the helpers are copied from collect-from-origin.test.mjs, and list
    the copy as a deviation in reports/C1.md. Or ask the lead to rule on extracting them into a
    shared fixture module.
  - (b) Under `run-tests.mjs`, `FIXTURE_ROOT` is set and removed by makeTempHome's own cleanup
    (`test-home.mjs:99,109`). Make the `after()` hook a no-op when `process.env.FIXTURE_ROOT` is
    set, or ask the lead to accept the precedent explicitly.

## F8 MINOR: on Windows the collector can't find `note-send.cmd`, so it never sends

- `resolveNoteSend` (`scripts/collect-status.mjs:130-139`) looks for the exact filename
  `note-send`. The Windows shim is `note-send.cmd` (`codex/README.md:36`). A schtasks-installed
  collector (C2 supports schtasks) would therefore always report `note: skipped, note-send missing`.
- Even if it found the shim, `spawnSync` of a `.cmd` without a shell fails on Node 24, and K2
  forbids a shell string.
- The ruling installs on Netcup only, so this is not a live defect. It is an undisclosed limit.
- **Fix**: add one line to reports/C1.md: "Windows collectors never notify (note-send.cmd is not
  resolved and K2 forbids a shell), so the collector is Linux/macOS only for notes". The
  alternative is to ask the lead whether a Windows path should spawn `process.execPath` against
  the plugin's `note-send.mjs`. Do not add a shell.

## NIT: status.json is briefly missing during rotation

`:312-313` renames status.json to previous.json first and writes the new file after. If
`atomicWrite` throws (a full disk, say), the directory is left with no status.json. The next run
then treats itself as a first run and sends a repeat note. Writing the temp file first, then
renaming status to previous, then renaming the temp file to status shrinks that window to two
back-to-back renames. Optional.

---

## Attack brief, item by item

- **A crafted branch name or record field reaching the shell or the envelope. Verified absent.**
  - note-send runs through `spawnSync(execPath, argv)` with no shell (`:141-143`).
  - `--text` is built only from `rows.length`, the attention count and `byState` keys (`:182-185`).
    Those keys come only from `computeState`, which can return exactly `accepted-merged`,
    `accepted-unmerged`, `withdrawn`, `rejected` or `owned` (`collect-from-origin.mjs:111-117`),
    or from the literal `no-record` (`:129`).
  - `--goal` is the out path, run through the shipped `assertFieldSafe` and dropped if it fails
    (`:145-152`).
  - `--from` is sanitized as K2 specifies (`:64-71`).
  - No branch name or record path reaches argv. Branch names and statuses do appear in
    status.md, which is not an envelope and never reaches a shell.
  - Discriminating check: I ran the real `note-send.mjs --dry-run --json` with the exact argv the
    collector builds, `HOME` pointed at a scratch folder. It exited 0 and produced a valid
    envelope: `collect-<host> → lead ... RESULT: 1 lanes on origin: owned=1, attention 0. Goal: status at <abs path>/status.md. Needs: none`.
- **Two hosts double-waking one lead.** Nothing in C1 prevents a second install. Each host sends
  from `collect-<host>` and keeps its own `--out` directory and change key, so two installs give
  two notes per change. That matches the ruling. C1's code comment and report make no claim
  otherwise; the report doesn't mention it at all.
- **Does a fetch failure ever send a note?** Not for the direct case. `:288` gates the only send
  on `!fetchFailed`. Detection matches collect-from-origin's own message (`collect-from-origin.mjs:152`)
  and is tested end to end against the real collector with a broken remote URL (`test:380-395`).
  But see F1 (a change seen during a failed fetch is lost afterwards) and F4 (a missing main ref
  isn't caught by this gate).
- **A check that passes because it isn't looking.**
  - Positive: the never-writes test does run the collector's write path.
  - Negative: it covers only `.git` (F6), the 60-line test is too small and counts only non-empty
    lines (F2), and the `announced` assertion checks a field that affects nothing (F1).
- **The `--job` default drifting bytes (C2) and the wiring count (C3).** Not C1's territory;
  skipped.

## Verified correct (no finding)

- Change-key tuple and sort (`:81-85`) match the spec.
- Rules K2-1 (host sanitizing) and K2-2 (`~/.local/bin` first, then PATH, injectable exec) are
  met, and tested at `test:138-145` and `:190-208`.
- K1's default `--out` `~/.agents/collect/<basename>` (`:58-60`, `:243`) matches the path C3's
  wiring check pins.
- RESULT with `--no-type` and `--needs none`; no ACK or FYI.
- `--quiet` takes priority, and a missing note-send still writes the status.
- Temp files sit in the same directory and are renamed into place, and no temp file is left
  behind.
- previous.json is rotated with a rename.
- The header carries both generatedAt and the America/New_York time.
- The table is the imported `formatTable` output, not a reimplementation.
- The collector runs in-process with no shell-out to collect-from-origin (`:34`, `:250`), and
  every path exits 0.

## Builder process notes (information only)

The builder's C1-gate.log holds `node --test` over two files (43 tests), not the brief's gate
command. The builder disclosed this as deviation 2. My run of the brief's own command is quoted
above: 21/21.

## Bug-fix fields

Cause: change detection at `scripts/collect-status.mjs:285` compares against the previous run's
`changeKey`, which every run saves, including failed-fetch runs. `announced`, the field K2 says a
failed fetch must not move, is never read.
Discriminating check: three runs with an injected collector (A ok, then B with a failed fetch,
then B ok) give 1 note-send call against the 2 expected. Scratch probe run 3 printed `calls 1`;
with the patch it printed `calls 2`, and the regression test fails on HEAD and passes patched.
Fix location: `scripts/collect-status.mjs:285` (compare with `previousStatus.announced`) and
`:288` (add `mainSha &&`); `buildStatusMd` `:215-227` for the 60-line budget; `:221` for showing
a failed send.
Simplification: once `announced` is the comparison key, `changeKey` in status.json is kept only
for information. The builder may keep it, but the logic reads a single field.
