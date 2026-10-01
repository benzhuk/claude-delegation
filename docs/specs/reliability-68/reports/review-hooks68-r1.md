VERDICT: NEEDS_FIXES (2) 34faa09a9e981a122b2dc8b0a87a8358e18bc714

# Review hooks68, round 1

Reviewed commit: 34faa09a9e981a122b2dc8b0a87a8358e18bc714 (my own `git rev-parse HEAD` in wt-reliability-68-hooks68). Base 0f910a7a142f8bc346619136587d27dea87088d6. Diff: 29 files, +407 -24.
All test runs were made in scratch clones (head and base) under scratchpad/lane-68/review-hooks68-r1/, never in the reviewed worktree. The reviewed worktree's `git status --short` was empty at the end of the review.

Severity count: BLOCKER 0, MAJOR 2, MINOR 2.

## MAJOR

### F1 (MAJOR): test-junk peer-note ledger files are committed, outside the territory
- Evidence: `git diff --stat 0f910a7a..HEAD` lists `docs/ledger/1969-12-31.md` (+4, added in 8fd52133) and `docs/ledger/2026-09-17.md` (+7, added in 34faa09a). Their content is fixture traffic: `taxonomy → nucleus, 12.31.69 19:16 NYC [taxonomy-ping-1] FYI: Batch finished, 413 films.` (note-send.test.mjs:74 `NOW = 1_000_000 + 5_000` gives 12.31.69 19:16 NY) and `taxonomy → nucleus, 9.17.26 18:00 NYC [taxonomy-ping-3..7] ASK: Batch finished, 413 films.` (inbox.test.mjs:38 `NOW = Date.UTC(2026, 8, 17, 22, 0)`).
- Why it matters: `docs/ledger/` is neither hooks68 territory nor anything the brief asks for (the reviewer brief: "A diff that edits a file outside its territory is a finding"). On main, `docs/ledger/` is the real peer-note ledger (the main checkout holds 2026-09-21 to 2026-10-01 there, untracked), which `readLedgerCorpus` and `collect-status.mjs` read; merging would plant fake `taxonomy → nucleus` lines into it. The builder report says "every NOT path [is] untouched" and lists every out-of-gate file it touched, but does not mention these two files.
- Fix: one new commit on the branch: `git rm docs/ledger/1969-12-31.md docs/ledger/2026-09-17.md`, message e.g. `chore: drop test ledger files committed by mistake`. Commit with explicit paths, not `git add -A`/`git commit -a`, so a leaked ledger is never swept in again. Predicted: `git diff --stat 0f910a7a..HEAD -- docs/ledger` is empty.

### F2 (MAJOR): this diff makes inbox.test.mjs write a ledger line into the repo under test on every run
- Cause: note-send.mjs:663 now treats an existing non-checkout `inboxRecord.cwd` as a dead end and falls back to `mainCheckout(worktreePathFromEnv(env) ?? process.cwd(), git)` (note-send.mjs:666). Test C11 at skills/multi/scripts/inbox.test.mjs:1229-1231 registers `codexRecord({ cwd: home })` with `home = tmp()` (no `.git`) and calls `runNoteSend` with `env: {}`, so the fallback is `process.cwd()`, which is the repo. The builder fixed the same shape in C9 and N5 (inbox.test.mjs:1215, :1334) but missed C11.
- Measured: base clone, `node --test` of note-send, inbox, hooks and multi-hook-core: 315 pass, 0 fail, `git status` clean afterwards, no `docs/ledger/`. Head clone, the gate plus the three extra files: 615 pass, 0 fail, `M docs/ledger/2026-09-17.md` afterwards. Running `inbox.test.mjs` alone adds one line each run (`[taxonomy-ping-8]`, then `-9`). note-send.test.mjs, note-flush.test.mjs and decisions-pickup.test.mjs alone added nothing. The repo's own N5 comment (inbox.test.mjs:1317-1318) says "a test must never write into the repo it is testing."
- Patch (ready to apply; I tried it in the scratch clone: inbox.test.mjs 73 pass, 0 fail, ledger line count 9 before and 9 after, so the leak is gone):
  Current, skills/multi/scripts/inbox.test.mjs:1229-1231:
  ```
  test('C11: an interactive send bounds its own inbox post', async () => {
    const home = tmp();
    writeInbox(home, 'nucleus', codexRecord({ cwd: home }), { now: NOW });
  ```
  Replacement:
  ```
  test('C11: an interactive send bounds its own inbox post', async () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.git')); // lane 68: a registered cwd must be a git checkout to be used
    writeInbox(home, 'nucleus', codexRecord({ cwd: home }), { now: NOW });
  ```
- After the fix, run the gate in the worktree and check that `git status --short` is empty. If it is not, another fixture is still leaking.

## MINOR (note only)

- M1: the builder report's honesty gap is covered in F1 (the ledger files were not disclosed). The rest of the report checks out against the tree: the `agent_id` string-only guard at base (`git show 0f910a7a:hooks/multi-inbox.js`), Codex's `unknown` role staying lead-like (multi-codex-hook.mjs:205 comment, codex-role.mjs), `mainCheckout` unchanged, build-loop-workflow.js not edited.
- M2: wiring-check.mjs:519 has a fallback, `restartAdvisoryLine(stale) ?? staleSessionText(stale)`, that can never run. `checkStaleness` returns `stale: true` only when both versions parse as plain x.y.z (plugin-staleness.mjs:133-161), so `restartAdvisoryLine` never returns null on a stale result. It does no harm and needs no change.

## Contracts, checked one by one

A. Advisory: met.
- `restartAdvisoryLine` is a new export (plugin-staleness.mjs:188-196). It returns the exact string `plugin ${running} running, ${installed} installed: restart this pane`, null when not stale or not plain x.y.z, and never throws. `checkStaleness` is not changed (the diff only adds lines after line 179).
- wiring-check.mjs:519 prints the one-liner only when `--hook` is passed. It sits inside `if (!wsOffActive(opts))` (line 513), so ws-off silences it. `staleness()` fails open (lines 478-489). `--hook` returns 0 (line 533). hooks/hooks.json:18 runs `--line --hook`, so the change reaches SessionStart.
- `--json` (line 508) and table (line 524) still print `staleSessionText`.
- The builder reports `--hook` also prints `wiring: N flagged` when something is flagged. That line comes from `printLine` (line 438), which was already there before this lane. I accept the builder's reading.
- "Staleness" means strictly older, not "differs", because the contract says to reuse `checkStaleness`.

B. Registration: met.
- Claude hook: multi-inbox.js:264 returns on any non-empty `agent_id`, and the `DELEGATION_REVIEW_RUN` return is kept (lines 268-274). Registration goes through `registerMainSessionInbox` (line 226).
- Codex hook: a non-empty `agent_id` skips registration (multi-codex-hook.mjs:243-250). `agent_id` is a real Codex payload field (codex-role.mjs:50-72 at base), not an invented one.
- One shared helper in transport.mjs: `insideGitCheckout` (lines 1645-1659) walks up with `existsSync` only, has a 256-level cap and never throws. `registerMainSessionInbox` (lines 1668-1684) refuses with `not-a-git-checkout`, writes nothing and never throws. `git grep` shows the two hooks are its only registration callers.
- note-send.mjs:663 makes an existing non-checkout cwd fall back to the sender's repo. Line 672 changes the warning wording. `mainCheckout` is not changed.
- Record cwds go through `toPosix` (`C:/...`), which `path.resolve` handles correctly on Windows.

C. Sentence: met.
- All 11 places carry the sentence once, on its own line, as checked by the new test in agents.test.mjs:191-212.
- The four agents' safety blocks are byte-identical before and after: base and head md5 of each start-to-end block is the same (8 of 8 equal, one hash). The new bullet sits after the end marker.
- The toml bullets follow the Scratch bullet, matching the pinned scratch sentence.
- The builder report says build-loop-workflow.js still needs the sentence and leaves it to census68.

## Discriminating tests (mutation checks in the scratch head clone, each reverted by copying the original back from the worktree)
- M-a: multi-inbox.js guard set back to string-only: (q) fails (20 pass, 1 fail).
- M-b: `&& insideGitCheckout(...)` removed from note-send.mjs:663: the lane 68 note-send non-checkout test fails (163 pass, 1 fail).
- M-c: Codex `childShaped = false`: "a Codex payload naming an agent_id never registers" fails (14 pass, 1 fail).
- M-d: the `registerMainSessionInbox` refusal disabled: (p), the Codex non-checkout test and the transport refusal test fail (44 pass, 3 fail).
- A and C, by reading: the P7 `--hook` test now asserts that "stale session: " is absent and that the one-liner is present, so it fails on base wiring-check.mjs. The agents sentence test fails on base because the sentence is in none of the 11 files.

## Existing pins
- "stale session" literal count, base vs head: wiring-check.test.mjs 8 to 10 (none removed, the bare `--line` pin moved into its own test), agent-dispatch-guard.test.mjs 1 to 1, plugin-staleness.test.mjs 4 to 4.
- hooks/agent-dispatch-guard.mjs, hooks/hooks.json, .claude-plugin/, envelope.mjs and skills/team-build/references/ are not in the diff.
- The PostToolUse path adds no git spawn. `insideGitCheckout` uses `existsSync` only, and the transport test at transport.test.mjs:184 checks that with a fake fs.

## Tests run (scratch clones only)
- Head, gate (8 files) plus hooks.test, inbox.test and multi-hook-core.test: 615 tests, 615 pass, 0 fail.
- Head, other tests that read the edited docs (native-package, skill-text, goal-context, knowledge-triage, accept-prep, review-run, mirror-shim, note-inbox, work-record, page-lint): 511 tests, 492 pass, 0 fail, the rest skipped.
- Head, note-flush.test 153 pass and decisions-pickup.test 86 pass; neither leaked into the repo.
- Base, note-send, inbox, hooks and multi-hook-core: 315 pass, 0 fail, no repo write.
- Not run: janitor, mirror-shared-skills, collect-status, and the full suite (Windows host).

## Scope
- Outside the territory: docs/ledger/* (F1). Everything else in the diff is under hooks/, skills/multi/, agents/, codex/, skills/*/SKILL.md, docs/mandate-template.md or scripts/{wiring-check,plugin-staleness}.mjs plus their tests.
- No plugin.json change, no dotfiles or ~/.claude edits, no secret reads.
