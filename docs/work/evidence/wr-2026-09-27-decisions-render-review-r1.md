VERDICT: NEEDS_FIXES

# Lane 26 (decisions-render): adversarial review of a806bb3810308edbe525bdcdaea76d9dadbe9447

Scope: branch build/decisions-render-1, base d153389, 5 commits. Read-only. Suite run:
`node --test skills/decisions/scripts/*.test.mjs` gave 399 pass, 0 fail. Probes ran as scratch
scripts that import the modules with injected fakes. No Notion write, no push, no edit in the tree.

Count: 1 BLOCKER, 5 MAJOR, 10 MINOR, 1 NIT.

## BLOCKER

### F1. `publish --clear-done` can never succeed on a real page. Every real round exits 4, and the only way through is `--adopt-live`, which returns 0 without clearing Done.
- Evidence: `decisions-render-publish.mjs:275-289`. Step 3 compares the raw fresh read with
  `last-render.md`. Under `--clear-done`, the fresh read always carries Ben's input (a `\*\*` line,
  `- [x] Done`, a ticked option), and `last-render.md` never does, because it is a readback of a
  render. So they differ every time and the code exits 4.
- The tests hide this. Every `--clear-done` test sets `last-render.md` to the page that already
  holds the owner input (`decisions-render-publish.test.mjs:330, 340, 354, 371, 401`, all
  `[last-render.md]: live`). That state cannot occur in production.
- Probe (`probe5.mjs`): real `last-render.md`, plus one escaped `\*\*` comment and a ticked Done,
  a matching capture, and the answer in today's history file.
  - `--clear-done` gives `ERR 4 the page was written outside the renderer`.
  - `--clear-done --adopt-live` gives `code 0 adopted true`, with `replaceMd` never called and
    git running `add last-render.md`, `commit`, `push`. Ben's comment and the ticked Done are now
    baked into `last-render.md`. Done is not cleared, yet the exit is 0. A lead who then runs
    `account` closes a round whose Done is still ticked.
- Fix location: `publish()`, step 3.
- Fix: under `--clear-done` only, compare `last-render.md` against the fresh read with exactly
  the owner-input lines that `decisions-read` found taken back out, and nothing else:
  - Delete each comment line, using the `line` numbers `parseDocument` already returns on
    `d.comments[i].line` and `unattached[i].line`.
  - Flip each ticked option line from `[x]`/`[X]` to `[ ]` (`d.options[i].line` and unattached
    `tick` lines).
  - Flip the last column-0 `- [x] Done…` line to `- [ ]`.
  - Normalise both sides and compare. Anything else Ben changed (a plain line, an edit) still
    exits 4.
  - Without `--clear-done`, step 2 has already exited 3 before step 3 runs, so that path is
    unchanged.
- Also: `--adopt-live` together with `--clear-done` must not return 0 before Done is cleared.
  Either refuse that combination with exit 2, or continue to steps 4-8 after adopting.
- Tests: rewrite the five `--clear-done` tests so `last-render.md` is the clean render (for
  example PAGE_NO_INPUT-shaped, with the unticked `- [ ] Done (last cleared: …)`) and the fresh
  read is that page plus Ben's lines. On the current code they fail with exit 4, which proves the
  regression test bites. Add one more test: a fresh read that has Ben's lines plus one other
  edited line must still exit 4.
- Predicted outcome: probe5's first variant reaches step 4 and renders
  `- [ ] Done (last cleared: Sep 27, 2026, 6:00 PM America/New_York)`. A page drifted anywhere
  else still exits 4.

## MAJOR

### F2. The step 2(b) "verbatim in today's history file or its waiting item" check proves almost nothing, so a line Ben wrote can be dropped with no durable record.
- Evidence: `decisions-render-publish.mjs:256-260`. The test is a plain substring check,
  `todayText.includes(text) || waitingTexts.some(w => w.includes(text))`.
  - Short comments pass trivially. `** no`, `** ok` or `** b` are substrings of almost any
    history file ("no" is inside "note"). The answer bullet is never actually required.
  - Ticks pass trivially. A ticked option's text always appears in its own waiting item, as the
    unticked option line. So `- [x] B` passes and is re-rendered as `- [ ] B` even when nobody
    recorded that Ben chose B. The choice then survives only in the host-local pickup capture.
  - Any waiting item counts, not "the waiting item it answers".
  - Files are read from the working tree. An uncommitted, unstaged history edit passes the check.
    Step 8 then commits only `last-render.md`/`session.md` (`:346-349`), so Ben's text lives only
    in a dirty working tree.
- Fix location: `publish()`, step 2(b).
- Fix:
  - Comments: require the quoted form the spec prescribes, `"${text}"` (the spec's
    `Your note, <M-D>: "<full text, verbatim>"`). Accept it in today's history file, or in the
    waiting item whose parsed decision title equals the triple's title.
  - Selections: require today's history file to contain the option text. Keep the waiting-item
    route only if that item's text records the choice (not just the option line), for example a
    line quoting `"<option text>"`.
  - Read both files from committed, pushed content, the same trust basis as the ls-tree rule:
    `git show origin/main:docs/decisions/history/<today>.md` and
    `git show origin/main:docs/decisions/waiting/<f>`, after `ls-tree`.
- Predicted outcome:
  - `** no` with no quoted answer: exit 3.
  - A tick with no history bullet: exit 3.
  - An answer written but not pushed: exit 3 before any Notion write.
  - The existing happy-path fixture (`- Your note, 9-27: "please look at this" — …`) still passes.

### F3. Render can emit a page that fails `decisions-read`. The spec's refusal list and acceptance rule are only enforced after the write, at step 6 (exit 5), or not at all.
- Evidence: `decisions-render-core.mjs:199-213`. `checkWaitingItem` refuses only
  `shapeless.length > 0` or `decisions.length === 0`, and `render()` (`:342-383`) never parses
  its own output.
- Probe (`probe2.mjs`) rendered all of these without refusal:

  | Waiting item | `decisions-read` on the rendered page |
  |---|---|
  | no Default / No default line | exit 1, WARN `no default or "No default" line` |
  | overdue `Default after 2026-01-01…` | exit 1, status DUE |
  | a pre-ticked `- [x] A` in the repo file | exit 1, TICKED |
  | a stray `- [ ] Done` inside the item | exit 1, WARN `more than one Done line` |

- Consequences:
  - Each of these reaches `replace-md` and only then fails step 6 with exit 5. The page is
    already rewritten, and `last-render.md` is not updated, so the next publish exits 4.
  - The pre-ticked case is worse. After the write, the page itself shows "owner input" nobody
    gave, and every later plain publish exits 3.
  - A source line starting with an escaped `\*\*` (a copied owner line) passes the bold rule
    (`:83` tests only `**`) and publishes a fake owner comment.
- Fix location: `checkWaitingItem`, and the end of `render()`.
- Fix:
  - In `checkWaitingItem`, also refuse with exit 2 naming file and line when `doc.warnings` is
    non-empty, when any option is ticked, when any comment or unattached entry exists, or when
    any Done candidate exists. Parse each item with a `now` so that DUE is refused too.
  - At the end of `render()`, run the acceptance rule as an enforced refusal:
    `parseDocument(page)` must give `computeExitCode === 0`, zero warnings and `done === false`.
    Otherwise throw `RefusedError`. (`publish` never passes a ticked Done line, so this cannot
    block a legitimate publish.)
- Predicted outcome: all four probe cases refuse with exit 2 before step 5. The live migration
  render still passes; it was verified byte-identical and decisions-read exit 0 in this review.

### F4. The replace-md backup path is thrown away. Exit 5 cannot name it, and a line Ben types between step 1 and step 5 is silently overwritten while publish exits 0.
- Evidence:
  - notion.js prints the backup to stderr: `console.error(\`[backup] ${file}\`)` at
    `~/.claude/scripts/notion.js:318`.
  - `runReaderCli` returns only `result.stdout` (`decisions-render.mjs:86`), and
    `defaultReplaceMdWithCli` returns nothing (`:95-105`).
  - `publish` ignores the result (`decisions-render-publish.mjs:319`), and the exit 5 message
    says only "restore from the backup notion.js logged at step 5" (`:332`). Nothing logged it.
    The spec requires the path to be logged (step 5) and named in exit 5 (step 6).
  - There is also no guard for the window between steps 1 and 5 (render, 9+ `git ls-tree`
    spawns, notion.js start-up). If Ben writes in that window, step 6 still matches the render,
    publish exits 0, and his line survives only in an unnamed, host-local backup file.
- Fix location: the reader wiring in `decisions-render.mjs` and step 5/6 of `publish()`.
- Fix:
  - Return `{ stdout, stderr }` from `runReaderCli`.
  - In `defaultReplaceMdWithCli`, parse `/^\[backup\] (.+)$/m` out of stderr and return
    `{ backupFile }`.
  - In `publish`, `write(\`backup: ${backupFile}\n\`)` right after step 5, and put `backupFile`
    in the exit 5 message.
  - Then read the backup file. It holds the same `/pages/<id>/markdown` body that `read` prints
    (notion.js:292-295, 312-314); the builder should confirm this against one real backup,
    read-only. If `normalize(backup) !== normalize(fresh)`, throw exit 5: "the page changed
    between the fresh read and the write; <backupFile> holds it: restore it with
    `notion.js replace-md <page> <backupFile> --force`, then run the pickup".
  - Test with a fake replaceMd that returns a backup different from the fresh read.
- Predicted outcome: every real publish logs its backup path. A mid-flight owner edit becomes a
  loud exit 5 that names the file holding it, never a silent exit 0.

### F5. On exit 6 no `render/last-<ISO>` branch is created, but the message says it was, and the repo can be left mid-rebase.
- Evidence: `decisions-render-publish.mjs:179-185`. The branch is `render/last-${nowIso}`, and a
  `toISOString()` value contains `:`.
  - Verified: `git check-ref-format --branch "render/last-2026-09-27T21:00:00.000Z"` gives
    `fatal: ... is not a valid branch name` (exit 128).
  - The failure is swallowed by the "best-effort" catch, and the thrown message still claims
    "the commit is left on render/last-…".
  - If the `git rebase` at `:176` hit a conflict (two publishers both rewrite `last-render.md`,
    which is a whole-file change on both sides), the caller's checkout is left with a rebase in
    progress.
  - The test's fake git accepts any ref name (`decisions-render-publish.test.mjs:52-58`).
- Patch (replace `:178-186`):
  - current:
    ```js
      } catch (e2) {
        const branch = `render/last-${nowIso}`;
        try {
          execGit(['branch', branch], repo);
        } catch {
          /* best-effort: the commit still exists on the current branch even if this fails */
        }
        throw new PublishError(6, `push failed twice; the page is already updated, the commit is left on ${branch} for the caller (${e2 instanceof Error ? e2.message : e2})`);
      }
    ```
  - replacement:
    ```js
      } catch (e2) {
        const branch = `render/last-${nowIso.replace(/[:.]/g, '-')}`;
        try { execGit(['rebase', '--abort'], repo); } catch { /* no rebase in progress */ }
        let where = `on ${branch}`;
        try {
          execGit(['branch', branch, 'HEAD'], repo);
        } catch (e3) {
          where = `on the current branch only (creating ${branch} failed: ${e3 instanceof Error ? e3.message : e3})`;
        }
        throw new PublishError(6, `push failed twice; the page is already updated, the commit is left ${where} for the caller (${e2 instanceof Error ? e2.message : e2})`);
      }
    ```
- Test: make the fake git throw on `branch` names matching `/[:~^?*\[\\ ]|\.\.|@\{/`, and make
  `rebase` throw once. Assert that `rebase --abort` was called and that the branch arg is
  `render/last-2026-09-27T19-00-00-000Z`.
- Predicted outcome: the exit 6 branch exists, and its name matches the message.

### F6. Step 8 does not push to main as the spec requires. It commits the whole index, and its "rebase this one commit" rebases (and flattens) everything unpushed.
- Evidence: `decisions-render-publish.mjs:348-350, 169-177`:
  - `git commit -m …` has no pathspec, so it sweeps in anything the caller had staged.
  - `git push` pushes the current branch to its upstream. From a lane worktree that is the lane
    branch, or it fails with no upstream (exit 6), after the page has been written.
  - `git rebase` rebases every unpushed commit. Without `--rebase-merges` it linearises an
    unpushed lane merge commit. The procedure invites this ordering: SKILL.md:71 says "merges …
    and pushes, then appends … in that same merge commit … then runs publish".
  - None of these preconditions is checked before step 5, so each failure lands after the page
    write, leaving `last-render.md` off main and the next publisher at exit 4.
- Fix location: a pre-write guard before step 5, and the git commands in step 8.
- Fix:
  - Before step 5 (and before `--adopt-live` writes), run `git fetch origin main` and require
    the current branch to be `main`, and `HEAD` to equal `origin/main`, with nothing unpushed.
    Otherwise exit 2: "push main first; publish runs from an up-to-date main checkout".
  - Step 8: `git commit -m … -- docs/decisions/last-render.md [docs/decisions/session.md]`, then
    `git push origin HEAD:main`.
  - Retry: `git fetch origin main`, `git rebase origin/main` (now exactly one commit), then
    `git push origin HEAD:main`.
- Predicted outcome: a publish from a stale or lane checkout refuses before touching Notion.
  Exit 0 then means `last-render.md` is on origin/main. The existing rebase and exit 6 tests
  keep passing with the updated arg assertions.

## MINOR

- M1. The hex rule's exemptions are wider than the spec's "URL or a quoted owner note":
  - Evidence: `decisions-render-core.mjs:69-72` blanks the whole markdown link, including its
    visible text, and any `"…"` span.
  - Probe: `See [a806bb3](https://x.y/z).` and `The commit "a806bb3" broke it.` both render.
  - `\b` also lets `sha_a806bb3` through.
  - Fix: blank only the `(…)` target of a link, not `[text]`; exempt quotes only inside the
    `Your note, <M-D>: "…"` / `Your question, <M-D>: "…"` form; use
    `(?<![0-9A-Za-z])[0-9a-fA-F]{7,40}(?![0-9A-Za-z])`.
- M2. The bold rule misses bullets that start with bold:
  - Evidence: `:83` tests `trimmed.startsWith('**')`, so `- **Evidence** here` renders
    (probe `bullet-bold`). This is the "plain bullet, never starting with bold" rule SKILL.md
    states.
  - Fix: strip a leading `- ` / `- [ ] ` marker before testing. Also refuse a leading escaped
    `\*\*` (see F3).
- M3. Handback drift check:
  - It prints `DRIFT` plus `HANDBACK blocked`, not the spec's `HANDBACK page-drift`
    (`decisions-handback.mjs:474-476, 523, 532`). Either emit the spec token or amend the spec.
  - It reads `last-render.md` from the `--repo` working tree (`:441-445`). Any worktree
    branched before the latest publish sees a false DRIFT after every lane close. Read
    `git show origin/main:docs/decisions/last-render.md` instead.
  - It goes BLIND in a repo without `last-render.md`, which the updated "unconfigured" CLI test
    had to paper over (`decisions-handback.test.mjs:923-924`). Skip the check when the project
    does not bind `decisions_url`.
- M4. A step 7 retitle failure (`decisions-render-publish.mjs:336`, throwing from
  `decisions-render.mjs:64`) aborts before step 8 after the page is written and verified. That
  guarantees exit 4 on the next publish, with a misleading message. Run step 8 anyway, then exit
  non-zero naming the retitle failure.
- M5. `--clear-done` renders the page with the OLD `since:` heading (step 4) and rewrites
  `session.md` only in step 8 (`:340-344`). The page Ben sees says "since your tick at <previous
  tick>", and the next unrelated publish changes the This-session heading. Render step 4 with
  the new `since` (pass an override to `buildSessionSection`).
- M6. The exit 4 crash hint is dead and inverted:
  - `readLatestBackup` is never wired in the CLI (`decisions-render.mjs:136-144`).
  - Its test `normalize(backup) === freshNorm` (`publish.mjs:279`) is backwards. The notion.js
    backup is the pre-write snapshot, so a crash after writing shows `backup ≈ last-render`,
    not `backup ≈ fresh`.
  - Fix the comparison, wire it to the newest `<page>/*.md` in the backup dir, and consider
    requiring that signature for `--adopt-live` (M9).
- M7. SKILL.md still has stale lines:
  - `:115` "Keep the page in two sections … `# Waiting on you now` and `# Closed`".
  - `:98` quotes a callout text the renderer no longer emits.
  - `:71` "merges … and pushes, then appends … in that same merge commit" orders the push before
    the bullet. Pane-setup's version, "once main is pushed", is right. Reword to "merge commit
    that also appends …; push; then publish".
- M8. `defaultReadPickupCapture` (`publish.mjs:110-125`) uses `receipt.round` whatever the
  receipt `status` is (ACCOUNTED, NEEDS_RECONCILIATION, legacy). Accept only an unaccounted
  captured round: PREPARED, RECORDED or WAITING_OWNER.
- M9. `--adopt-live` adopts any drift, including a plain (non-`**`) line Ben typed, and the next
  publish then overwrites it. That is acceptable as an explicit operator action, but F1 currently
  makes it the routine path. After F1, consider refusing it unless the crash signature (M6)
  holds.
- M10. Git failures after the write other than the push fall through to exit 1:
  - `git commit` with nothing to commit (a republish whose readback is byte-identical) exits 1
    after a successful write.
  - Pass `--allow-empty`, or skip the commit when `git diff --cached --quiet`, and map add/commit
    failures to exit 6.
- Spec gap (not the builder's): Notion rewrites `~` to `\~` and autolinks bare `x.md` names,
  so a session bullet mentioning `SKILL.md` or `~/.agents` always fails step 6 after the write.
  A pre-write refusal of a bare `~` or a bare `<name>.md` outside a link would turn that into
  exit 2.

## NIT
- `normalize` (`core.mjs:46-48`) also drops a tab-indented trailing `<empty-block/>` (via
  `.trim()`) and strips all trailing blank lines. Neither can hide a tick or a comment, but it is
  slightly looser than "drop one trailing `<empty-block/>`". Compare against the exact
  `'<empty-block/>'`.

## Verified with no defect found

- **Step 2 without `--clear-done`:** a ticked Done, a ticked option and an escaped `\*\*`
  comment (attached or unattached) each exit 3 with the spec message. Anything `decisions-read`
  misses is still caught by step 3 drift before any write. `--adopt-live` never skips step 2
  (it runs first).
- **Normalisation:** CRLF, trailing `[ \t]`, blank-run collapse and the trailing empty-block
  drop are as specified. The one function is shared by drift, readback and handback.
- **Migration:** `render --repo .` with the live Done line is byte-identical to
  `pack/live-page.md` (cmp). `docs/decisions/last-render.md` is byte-identical to
  `pack/live-page.md`. `decisions-read` on the render gives exit 0, `DONE false`, zero
  warnings. The eight Summary lines sit on line 2, under the heading.
- **Render refusals and page shape:**
  - The 7-digit count and the date do not trip the hex rule, and a sha does.
  - The session limits (8 bullets, 200 characters) and now.md's 3-5 sentences (links excluded)
    are enforced.
  - A missing Summary line refuses, and so does an ls-tree miss on origin/main, for history and
    archive files alike.
  - History runs newest first, and the link shape
    `[Mon D](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/YYYY-MM-DD.md) — <Summary>`
    matches the live page.
  - Only `<empty-block/>` follows Done.
- **Other publish behaviour:**
  - `since:` is written only under `--clear-done`.
  - Exit 0 comes only after the push, and `--dry-run` never writes.
- **Tests:** they use fakes for notion.js, the title set, the pickup status and git. There is no
  real push or Notion call, and the spawned tests use `childEnv()`.
- **Territory:** pane-setup adds only the new `## Closing a lane` section before `## Releasing`,
  and Releasing is byte-untouched.
- **Declared deviation, justified:** `decisions-archive.contract.test.mjs:207-209` adds
  `readLastRender: () => decisions`. That test passes `--repo 'r'`, so the new default reader
  would walk up from cwd into the real checkout's `last-render.md`, making the test
  non-hermetic. The one-line test-only pin is the minimal correct fix and changes no production
  behaviour. Note that M3's "skip when no decisions_url binding" would not have removed the need
  for it.
