VERDICT: NEEDS_FIXES

# Lane 28 render-guard: adversarial review

Branch build/render-guard-1, sha 7db6691675c462c48aae2c1e0636f3e58d3fac8c, base 53a77f7. Read-only review. The reviewed tree was not modified. The only commands run were git diff/log/status, the test suite, and a probe script that imports the worktree modules from the session scratchpad and runs them against a scratch git repo there.

Gate: `node --test skills/decisions/scripts/*.test.mjs skills/multi/scripts/note-send.test.mjs` gave 594 pass, 0 fail.

## MAJOR-1: the `--dry-run` dirty-tree warning never reaches stderr from the real CLI

- Evidence: `decisions-render.mjs:165-173` builds `publishDeps` with `write` but no `writeErr`. `decisions-render-publish.mjs:411` defaults `writeErr` to `() => {}`. The CLI entry (`decisions-render.mjs:215-217`) calls `run()` with no deps, so nothing adds it through `...deps` either.
- Measured: I dirtied a scratch repo (staged, renamed and untracked files under docs/decisions) and called `run({argv:['publish','--repo',<scratch>,'--page','P','--dry-run'], writeErr: capture, deps:{readPage}})`, the same wiring as the CLI. The captured stderr was only `["decisions-render: fresh read is BLIND: no titles found\n"]`. That step-2 error shows `checkDecisionsTreeClean` had already run, but no `warning:` line was written. The pinned dry-run path ("the list is printed to stderr as `warning:`") is silent in the only real entry point. The unit test passes only because it injects `writeErr` straight into `publish()`.
- Fix (mechanical). `decisions-render.mjs` is in territory for this, per the brief. At `skills/decisions/scripts/decisions-render.mjs:170`:
  - current:
    ```
            write,
            readLatestBackup: defaultReadLatestBackup(),
    ```
  - replacement:
    ```
            write,
            writeErr,
            readLatestBackup: defaultReadLatestBackup(),
    ```
  - Add a test in `decisions-render-publish.test.mjs` (in territory) that imports `run` from `./decisions-render.mjs`. It should call `run({ argv: ['publish','--repo',REPO,'--page','PAGE','--dry-run'], write, writeErr, deps: {<baseDeps with status '?? docs/decisions/scratch.md\n'>} })` and assert that one captured stderr string starts with `warning:` and names `docs/decisions/scratch.md`, and that the exit is 0.
  - Predicted outcome: the warning reaches `process.stderr` from the CLI. The new test fails on the current tree and passes after the one-line fix. No existing test changes, because the default fake `status` returns `''`.
  - Optional hardening, also in territory: make the `publish()` default `deps.writeErr ?? ((s) => process.stderr.write(s))` so that a future caller that forgets the dep does not go silent again.

## MINOR-1: a rename is reduced to its destination path

- Evidence: `decisions-render-publish.mjs:313-322` (`parsePorcelainEntries`) keeps only the part after ` -> `.
- Two consequences:
  - (a) `R  docs/decisions/foo.md -> docs/decisions/last-render.md` is exempted as if only last-render.md were dirty, so the staged deletion of `foo.md` passes silently. This case is unlikely: it needs last-render.md removed first.
  - (b) The printed list shows only the new path. `git restore -- <new>` alone does not undo a staged rename; the old path is needed too. Measured on the scratch repo: `R  docs/decisions/waiting/old.md -> docs/decisions/waiting/new.md` was listed as `R  docs/decisions/waiting/new.md`.
- Fix: parse into `{status, paths:[orig,new]}`. Drop an entry only when every path equals `docs/decisions/last-render.md`, and print the raw `rest` (`orig -> new`) in the list. Predicted outcome: both cases give exit 7 with both paths named. No existing test changes.

## MINOR-2: `status.showUntrackedFiles=no` hides untracked files

- Evidence: in the scratch repo, `git -c status.showUntrackedFiles=no status --porcelain -- docs/decisions` dropped all three `??` lines. On a host with that setting, a new `waiting/` item would publish past the guard. It is not set in this repo.
- Fix: at `decisions-render-publish.mjs:335`, use `['status', '--porcelain', '--untracked-files=all', '--', 'docs/decisions']`. This also lists the files inside a new untracked directory rather than the directory itself. This departs from the spec's literal command string, so it is the lead's call.

## MINOR-3: some pinned properties have no test

- No test pins the order "after step 1, before step 2". A dirty tree plus pending owner input should be exit 7, not 3.
- No test pins that `status` runs in `--repo`: `cwd === REPO` and args `['status','--porcelain','--','docs/decisions']`.
- No test covers a rename line.
- Fix: add one test that uses a page with owner input and a dirty `status`, and asserts code 7. In the same or a second test, assert on `calls`, or on the override's `(args, cwd)`, that the status call used REPO and the pathspec. Add one rename fixture test (`'R  docs/decisions/waiting/a.md -> docs/decisions/waiting/b.md\n'`) that expects exit 7.

## Verified clean (no defect found)

- **Placement.** `checkDecisionsTreeClean` runs at publish():422: after `readPage` (step 1), before `parseDocument` (step 2), and before every writeFile, replaceMd, commit and push, including the `--adopt-live` and `--clear-done` session.md paths. On the scratch repo, exit 7 came with 0 writeFile calls.
- **What triggers exit 7.** Measured against real git porcelain output. Exit 7 fires for:
  - staged `M `, rename `R `, untracked `??` and ` M`
  - a new file in `waiting/`
  - quoted paths with spaces and non-ASCII names; they stay listed, and quoting can never produce a false exemption, since last-render.md is never quoted
  - CRLF output (split on `\r?\n`)

  Windows paths are not an issue because git porcelain always emits `/`. `last-render.md` alone does not trigger it (test + code at :342).
- **Message.** Verbatim with the spec, including `git restore -- <files>`.
- **Dirty and off main.** Gives exit 7 with the list, then `push main first; ... (currently on X, not main)`. Measured, and a test covers it. A clean lane branch still gets exit 2.
- **No bypass flag.** `decisions-render.mjs` is unchanged, and no new flag was parsed.
- **Repo, not cwd.** The check runs in `--repo`: `execGit(..., repo)` passes cwd=repo to execFileSync.
- **Refactor.** Splitting `checkOnMain` into `mainCheckDetail`/`mainCheckMessage` leaves the exit-2 behaviour unchanged. The existing F6 tests pass.
- **note-send.** The hint equals the spec text byte for byte (checked programmatically: `true`). Only the hint line changed, plus a comment. The prose at 529-534, `skills/multi/SKILL.md` and `note-flush.mjs` are untouched. Both pins (`err.hint` and `failureJson`) are updated, and both carry the `doesNotMatch(--sender-host <this host>)` / `match(--packet-file -)` guards.
- **Territory.** The diff touches only the pinned files plus the work record. There are no `docs/decisions/**` changes, and SKILL.md changes only in the publish exit paragraph.

Disclosure: the one commit in the scratch repo (outside the reviewed tree) was made with `--no-gpg-sign` under the configured identity. That flag should not have been passed. Nothing in the reviewed tree was committed or touched.
