VERDICT: NEEDS_FIXES 7c4e0be7b8c333108c06f0c85ef93386f2fdc144

JUDGMENT: NEEDS_FIXES. The tiny build really happened: a Sonnet builder, an Opus reviewer, a census and `accept --census` all ran. But three things are wrong. The step-3 multi result hides lost work. Two of the doc fixes contain a false command or a false path. The reported total time is mislabelled. W2 is not really empty. Two of the rejects are cheap and inside W2's files. All times below are America/New_York.

Review of build/fresh-walk-1 at 7c4e0be (base fbd7cf6), work wr-2026-09-25-fresh-project-walk, territories W1 and W2.
What I read: the spec (origin/docs/lane-specs-0925), the builder brief and report, the diff fbd7cf6..7c4e0be, the three walk repos, the nested session transcripts under ~/.claude/projects/-home-ben-tmp-fresh-walk-2026-09-25{,-rerun}/, the builder subagent transcript (ad389ae1.../subagents/agent-a5391e588ed3ec7b3.jsonl), and the gate log.
What I ran: `check-acceptance` on a scratch copy of the walk repo, `claude plugin list` and `claude plugin list --json`, both failing tests on main, and a node simulation of the H6 fix.
Nothing in the reviewed tree or in ~/tmp was modified.

## Answers to the attack brief

### 1. Are the tiny-build numbers real?

Mostly yes, but the total is mislabelled and some claims are false (see R5).
- **Builder.** subagents/agent-a343c8711cbf6c085: meta says `delegation:builder`, model sonnet. All 13 assistant messages are `claude-sonnet-5`. Active 18:40:10–18:40:31.
- **Reviewer.** agent-ae3cbb1faa38aa196: meta says `delegation:reviewer`, model opus. All 9 assistant messages are `claude-opus-5-5`. Active 18:40:47–18:41:26.
- **Census.** Ran at 18:41:47 and printed `VERDICT: COUNTED ... leadTurns 1, 2 subagent files`.
- **Accept.** Accept attempts ran at 18:41:52, 18:41:54 and 18:41:57, all refused. Two `check-acceptance` runs followed at 18:42:01 and 18:42:29. `accept --census` then returned `{"ok":true}`, and the record carries `Log: 2026-09-25T22:42:34.263Z accepted`. The "4 attempts, 3 failed" claim is true.
- **Integrator: no.** No `delegation:integrator` agent ran, although the plugin ships agents/integrator.md. The lead integrated inline (`git merge --ff` plus the test run), because the builder's operator prompt told it "you acting as integrator". The evidence file does not say this.
- **Step minutes vs timestamps.** The per-phase minutes match the model-written `tiny-build-timeline.log`, and that log matches the tool-call timestamps. The **total** does not:
  - The table's total row runs 18:39:23 to 18:42:55. Those are session start and session end, not "spec written" and "accepted".
  - Ask to accepted: prompt at 18:39:25.5, accept at 18:42:34.3, so **189 s = 3.15 min = 0.052 h**.
  - Spec written to accepted: 18:39:53 to 18:42:34, so **161 s = 2.68 min**.
  - The reported 212 s / 0.0589 h is neither of these.
- **Is "hours ask to accepted" defined honestly? Not fully.**
  - The "ask" was written by the builder, not an operator. It already listed every pipeline role and model tier, which a real user would have to find in the docs.
  - It carried a path hint: "this plugin version ships build-census.mjs and work-record.mjs under its installed scripts/ — locate them under the installed plugin path if the docs don't give an absolute path". Yet the evidence (line 28) and the report both say "no hints given".
  - The number excludes the time to compose the ask and the goal-card setup.
  - It also excludes the lane's own wall clock (R13). The walk step itself took 18:34–18:43 on Sep 25. The lane then stalled about 19.5 h.

### 2. Goal-card path

native-use.md:27 says `docs/goals/card.md`, with override key `goal_card` in `.agents/project.json`. That is **correct** against scripts/goal-card.mjs:31-32 (`CONFIG_KEY = "goal_card"`, `DEFAULT_CARD_PATH = "docs/goals/card.md"`) and templates/goal-card.md:14-15. This project's own card is also docs/goals/card.md; docs/GOALS.md is only its SOURCE doc. The documented exit codes (0 / 1 / 3) match `runCli` (goal-card.mjs:450-491).

Other claims in the same subsection are false: the `bearings-state.mjs` path (R4) and the `check-acceptance` command (R2).

### 3. Is W2 really empty?

- **F2** (scripts/goal-card.mjs:335-338 `rejectionNotice`):
  - In territory: **yes**.
  - Size: about 3 code lines plus 2 test lines.
  - Recommendation: **fix here** (R6). The notice is what a user sees when the card is broken, and its remedy command fails in every fresh project. The F1 doc fix does not make that message unreachable.
- **F6** (scripts/janitor.mjs:528 `config.main_branch || "main"`):
  - The code fix is **not** in territory; janitor.mjs is not on the W2 list, so handing it on is legitimate.
  - A doc mitigation **is** in territory: skills/janitor/SKILL.md "Adapters" (W2 file) plus native-use.md (W1).
  - Size: about 3 lines.
  - Recommendation: **do the doc part here** (R7) and hand on the code part.
- **Also W2 (new):** the nested-session sentence for skills/multi/SKILL.md (R1), about 3 lines.
- **So W2 exists.** Stated fairly, it is 2 to 3 small edits.

### 4. Doc fixes: faithful re-runs and truth against the code

- **The `check-acceptance` command is false (R2).** I ran it on a scratch copy and got `exactly one of --delivery-ref or --pinned-artifact is required`, exit 1. The re-run session hit the same thing and said so: "The documented `check-acceptance` command failed on the first try". The evidence files that failure under F4 instead of flagging the new text.
- **The `bearings-state.mjs` path is false (R4).**
- **"find that root with `claude plugin list`" cannot work (R9).** Plain `claude plugin list` prints no path; `--json` prints `installPath`.
- **The F5 re-run of `build-census.mjs --lead` is genuine.** It passed first try (316ca8a4 at 14:21:38).
- **The F1 re-run is genuine.** It wrote docs/goals/card.md, `check` returned ok, and the session read only the docs plus `claude plugin list` and `ls` of the cache.
- **F4/F5 "fixed-docs" is not earned (R3).** The spec says a doc fix is complete only when a re-run of the failing step, following only the new text, passes. Here, accept needed 5 `check-acceptance` runs, 3 `accept` runs, and a brute-force loop over `Log:` shapes.

### 5. Forbidden files and the changelog

The diff touches only README.md (Install section, lines 32-37, not the changelog), docs/native-use.md, and the new evidence file. No forbidden file and no record file were touched.

The native-use.md edits sit in "Everyday work on a project" (host-neutral), not in a Codex section. **Clean.** There is one structural side effect (R10): the new `###` heading now also owns three pre-existing general paragraphs.

### 6. The two failing tests

Both fail on main at ac9c842, confirmed with `node --test --test-name-pattern` in /home/ben/Code/claude-delegation. Both are **POSIX-host defects, not environment noise**, and neither is in this lane's files.
- **H6** (skills/multi/scripts/note-send.test.mjs:367 → skills/multi/scripts/transport.mjs:434):
  - Cause: `mainCheckout` resolves a relative `--git-common-dir` with the host's `path.resolve`. On Linux, `path.resolve('C:/Users/x', '.git')` gives `<cwd>/C:/Users/x/.git`. It therefore fails on every POSIX host, with the cwd baked in.
  - Patch, simulated: returns `C:/Users/benzh/Code/Zhuk Projects`.
    - Old: `if (!path.posix.isAbsolute(c) && !/^[A-Za-z]:/.test(c)) c = toPosix(path.resolve(start, c));`
    - New: `if (!path.posix.isAbsolute(c) && !/^[A-Za-z]:/.test(c)) c = toPosix(/^[A-Za-z]:/.test(start) ? path.win32.resolve(start, c) : path.posix.resolve(start, c));`
- **V4** (skills/multi/scripts/mirror-shim.test.mjs:291-297):
  - Cause: on POSIX the mirror publishes each skill as a **directory symlink** (scripts/mirror-shared-skills.mjs:422,442; ~/.agents/skills/* are symlinks here). `readdirSync(..., {recursive:true})` follows the link into the source tree, which contains `*.test.mjs`. The "no test file published" assertion only holds where publishing is a copy (Windows).
  - Fix: wrap lines 291-297 in `if (IS_WINDOWS) { … }`. Add an `else` branch that asserts `fs.lstatSync(path.join(home,'.agents','skills','multi')).isSymbolicLink()`.
- **Territory.** Neither file is lane-allowed: transport.mjs and mirror-shim.test.mjs are skills/multi/scripts/*, and the code under test belongs to lane two's mirror script.
- **Consequence.** The spec's acceptance line "sealed suite green on the branch on this host" **cannot be met by this lane**. It needs one of:
  - a small fix lane owned by multi, taking the two patches above; or
  - Ben's explicit waiver recorded in the record.

  The RESULT must say which.

### 7. Are any severities under-rated?

Yes:
- F8 low → **high** (R1).
- F2 low → **med** (R6).
- F7 low → **med**: `lead-session-missing` refuses `check-acceptance` on the installed 0.20.10 in every fresh project (R3).
- F6 med stays med, with the note that plain `git init` on this host gives `master` (`init.defaultBranch` is unset), so janitor is blind on every fresh repo here.

## Findings

### R1 — HIGH — Step 3 hides lost work. F8 is mis-rated and mis-diagnosed.

**Evidence**
- The self-test note `scratch-h-fresh-walk-selftest-1` never reached the skills-h pane. It was injected by the UserPromptSubmit hook into the **nested tiny-build session** 305393c2 at 18:39:25 Sep 25. That session was running in ~/tmp/fresh-walk-2026-09-25 and ignored the note ("1 new peer note for skills-h: scratch-h → skills-h … [scratch-h-fresh-walk-selftest-1]").
- skills-fable's `ASK [skills-fable-fresh-project-walk-1]` ("Needs: ack by 12:00") was injected into the **F1 re-run session** 6c14bff5 at 14:17:16 Sep 26, which had nothing to do with it. That session said "It isn't about this task … so I didn't act on it or reply". The 12:00 deadline had already passed; the lead never saw the note.
- The hook acks what it injects (hooks/multi-inbox.js:8 and :431-438, "then ack (cursor advances)"). That is why `note-inbox --me skills-h` now reports "No new notes".
- **Mechanism.**
  - The nested `claude -p` sessions inherit the pane's `ORCA_TERMINAL_HANDLE`; it is set in this session's child processes.
  - `registerMyInbox` (hooks/multi-inbox.js:195-227) and `cheapSlug` (:117-139) map that handle through the pane bindings to `skills-h`. The child therefore registers itself as skills-h's inbox, with cwd set to the throwaway repo.
  - note-send then routes the recipient's ledger and packet to the registered inbox's cwd (skills/multi/scripts/note-send.mjs:392-395). This is why both notes' ledger lines, and skills-fable's packet, sit in ~/tmp/fresh-walk-2026-09-25/docs/ledger/ and docs/notes/, not in the claude-delegation repo.
  - skills-fable's own note already names the symptom: "Two live sessions claim the skills-h slug since 18:30".

**Fix**
- **Evidence line 27**
  - Old: `| 3. multi (pane hook delivery) | — | **pane hook delivery: confirmed by lead** (placeholder; interactive/un-agent-able, lead skills-h fills the actual result) | — |`
  - New: `| 3. multi (pane hook delivery) | — | **NOT delivered to the lead pane.** The hook injected the note into the nested tiny-build session 305393c2 (UserPromptSubmit, 18:39:25) and acked it there; the lead pane never saw it, and \`note-inbox --me skills-h\` now reports no new notes. See F8. | — |`
- **F8 row**
  - Severity: `low` → `high`.
  - File:line: `hooks/multi-inbox.js:117-139,195-227 (slug from inherited ORCA_TERMINAL_HANDLE); hooks/multi-inbox.js:431-438 (ack after inject); skills/multi/scripts/note-send.mjs:392-395 (ledger follows the registered inbox's cwd)`.
  - What happened: name both lost notes, with ids and times as above.
  - Preventing sentence: "A `claude -p` started from inside a bound pane inherits `ORCA_TERMINAL_HANDLE`, claims the pane's slug, receives and acks its peer notes, and moves its ledger into the child's directory. Start nested sessions with `env -u ORCA_TERMINAL_HANDLE -u NOTE_SLUG claude -p …`."
  - Disposition:
    - fixed-docs in skills/multi/SKILL.md (W2) and native-use.md.
    - Code handed on to the multi owner: the hook should refuse to register or ack for a session whose handle is already bound to a live, different session id, or for a non-interactive session.
- **Doc sentence.** Add the sentence above to skills/multi/SKILL.md, and to native-use.md next to the `multi` mention (line 53).
- **Lead recovery, operational, not a code edit.** Run `note-inbox --me skills-h --ack` from the lead pane to re-register it. Read skills-fable's ASK from ~/.agents/notes/2026-09-26.md, because the packet is in ~/tmp/fresh-walk-2026-09-25/docs/notes/. Answer it.
- **Predicted result.** The next walk's nested sessions, started with `env -u`, do not register as skills-h. The pane stays the only inbox, and a self-test note shows up in the lead pane.

### R2 — HIGH — native-use.md:48 gives a `check-acceptance` command that fails as written.

**Evidence**
- work-record.mjs:737 requires exactly one of `--delivery-ref` / `--pinned-artifact` for both commands.
- I measured it: exit 1, `exactly one of --delivery-ref or --pinned-artifact is required`.
- The re-run hit the same failure at 14:21:19.
- The new line also contradicts docs/work-record.md:115-117.

**Patch** (docs/native-use.md, lines 47-49)
- Old:
  ```
  confirm the record parses with
  `node <plugin-root>/scripts/work-record.mjs check-acceptance --repo . --record docs/work/<id>.record.md`,
  then close it with exactly one of `--delivery-ref <ref>` or `--pinned-artifact <sha>` plus
  ```
- New:
  ```
  confirm the record parses with
  `node <plugin-root>/scripts/work-record.mjs check-acceptance --repo . --record docs/work/<id>.record.md --pinned-artifact <sha>`
  (read-only; it takes the same one of `--delivery-ref`/`--pinned-artifact` as `accept`),
  then close it with that same flag plus
  ```

Predicted: the documented command exits 0 on a valid record at first try.

### R3 — HIGH — F4/F5 (and F7) are marked "fixed-docs" without meeting the spec's completion rule.

**Evidence**
- In the re-run session 316ca8a4, following the new text, `accept` still failed on:
  - the `--pinned-artifact` omission (R2);
  - `Status must be reviewed … got: review`;
  - the required `Observed:` paragraph;
  - `lead-session-missing` (installed 0.20.10);
  - `census-stale: … a Log: reviewed entry on the record … required` (work-record.mjs:776-789), which forced a brute-force loop over `Log:` shapes.
- The evidence (line 100) says "a real user who follows the pointer to work-record.md … gets the complete base schema on the first read". That is **false**:
  - The "Full example record" in docs/work-record.md (lines 200-216) has no `Worktree:`, no `Observed:` and no `Lead-session:`.
  - docs/work-record.md never mentions the census or the rule that a reviewed Log line must come before the census (`grep -n census docs/work-record.md` finds nothing).
- The 9-field list in native-use.md:13 omits `Worktree:`, which work-record.md:134 makes mandatory for accept.

**Fix**
- Append this to the "To close a build" paragraph in native-use.md (W1 scope). It is in scope and short:

  > Before `check-acceptance`, the record needs, besides the fields in [work records](work-record.md): `Status: reviewed`; `Worktree: <path or branch of the build's worktree>`; on plugin 0.20.10 and later `Lead-session: <the lead session's id>`; a top-level `Observed:` paragraph after a blank line; the reviewer's report (first line `VERDICT: APPROVE <sha>`) listed in `Evidence:`; and a line `Log: <ISO-8601 UTC> reviewed <reviewer-id> artifact <sha>` written when the review lands. Take the census **after** that Log line; `accept` refuses a census older than the last `reviewed` entry.

- Also change native-use.md:13 from `` `Next:`, `Opened:`, plus repeatable `Log:` lines) `` to `` `Next:`, `Opened:`, `Worktree:`, plus repeatable `Log:` lines and an `Observed:` paragraph) ``.
- Then re-run the accept step in a fresh ~/tmp repo following only native-use.md and the links it gives. Do not forbid the link target: the fix's design is "follow the link". Record the attempt count.
- If the re-run still needs more than one attempt, mark F4 "partial, handed on" rather than "fixed-docs".
- Predicted: 1 attempt for `check-acceptance` and 1 for `accept`.
- Separately, hand on F7 to docs/work-record.md's owner: add `Lead-session:`, `Spec-session:` and `Spec-from:` to its table and its full example.

### R4 — MED — native-use.md:18-22 puts `bearings-state.mjs` under `<plugin-root>/scripts/`. It lives at `<plugin-root>/skills/bearings/scripts/bearings-state.mjs`.

**Evidence**
- `find` in the worktree, and skills/bearings/SKILL.md:51 (`<bearings-skill>/scripts/bearings-state.mjs`).
- The walk itself used the correct path (evidence line 23).

**Patch** (docs/native-use.md)
- Old:
  ```
  The scripts named below (`goal-card.mjs`, `build-census.mjs`, `work-record.mjs`,
  `bearings-state.mjs`) are **the installed plugin's own scripts**
  ```
- New:
  ```
  The scripts named below (`goal-card.mjs`, `build-census.mjs`, `work-record.mjs` under
  `<plugin-root>/scripts/`, and `bearings-state.mjs` under
  `<plugin-root>/skills/bearings/scripts/`) are **the installed plugin's own scripts**
  ```

Predicted: `node <plugin-root>/skills/bearings/scripts/bearings-state.mjs check --repo .` prints the status JSON.

### R5 — MED — Tiny-build timing and honesty claims in the evidence are wrong.

**Evidence**: see answer 1. Four separate problems:
- The total row's times are session start and session end.
- "no hints given" is false.
- "RECORD 0s" hides a rewrite. The schema-valid record was produced only inside ACCEPT, at 18:42:29, by `git mv` plus a full rewrite. That rewrite carried back-dated `Opened:` and `Log:` stamps (18:40:02 to 18:41:43), all typed at 18:42:29.
- The integrator was the lead inline.

**Fix** (evidence file)
- **Line 44.** Replace with:

  `| **Ask -> accepted** (prompt 18:39:25 -> accept Log 18:42:34) | 18:39:25 | 18:42:34 | **189s = 3.15 min = 0.052 h** (spec written -> accepted: 161s) |`

- **Line 28.** Replace "(no hints given)" with:

  "(one hint given: the prompt said build-census.mjs and work-record.mjs are under the installed plugin's scripts/; the prompt also named every role and tier, and told the lead to integrate itself; no delegation:integrator agent ran)".

- **Line 38.** Append this to the RECORD row: "record opened in a non-schema shape; the schema-valid record, with back-dated Log lines, was written in one piece during ACCEPT at 18:42:29".
- **Line 53.** Restate the headline as 0.052 h. Add: "excludes composing the ask, the goal-card setup, and the lane's own wall clock (see R13)".
- **Handed on to lane one:** `accept` accepts `Log:` lines written back-dated in one piece. Whether that matters is lane one's call; this lane only records it.

### R6 — MED (was F2 low) — The goal card's rejection notice gives a command that fails in every fresh project. This is in W2 territory.

**Patch**
- scripts/goal-card.mjs:335-338, old:
  ```js
  export function rejectionNotice(cardPath, reason) {
    return `goal card not injected: ${cardPath} — ${reason}. No goals are being restated in this session; `
      + "fix the card or run `node scripts/goal-card.mjs check`.";
  }
  ```
- New (`fileURLToPath` is already imported at :23):
  ```js
  const SELF_PATH = fileURLToPath(import.meta.url);
  export function rejectionNotice(cardPath, reason) {
    return `goal card not injected: ${cardPath} — ${reason}. No goals are being restated in this session; `
      + `fix the card or run \`node "${SELF_PATH}" check\` from the project root.`;
  }
  ```
- Test: in scripts/goal-card.test.mjs, in the "MAJOR 4" test after line 365 (`fileURLToPath` is already imported at :10), add:
  ```js
  assert.ok(notice.includes(fileURLToPath(new URL('./goal-card.mjs', import.meta.url))), 'the remedy names the script by its real path');
  assert.ok(!notice.includes('node scripts/goal-card.mjs'), 'no project-relative path a fresh project lacks');
  ```

**Checks and prediction**
- No other test asserts the old string. `grep "goal-card.mjs check"` over *.js and *.mjs finds only :337.
- The Codex hook shares this helper through hooks/lib/goal-context.mjs, which resolves to the same installed file.
- Predicted: the test passes. With the old line restored it fails on the first new assertion.
- Update F2's row to severity med, disposition fixed-code.

### R7 — MED (F6) — Doc mitigation for janitor's `main` default belongs in W2 and W1.

**Evidence**
- scripts/janitor.mjs:528.
- `git config --get init.defaultBranch` is unset on this host, so every `git init` here gives `master`, and janitor's tables come back empty.

**Patch**
- skills/janitor/SKILL.md:108, old: ``Tool-neutral by design: reads `.agents/project.json` for `main_branch` and``
- New: ``Tool-neutral by design: reads `.agents/project.json` for `main_branch` (default `main`; a repo whose default branch is anything else — a plain `git init` gives `master` — must set it, e.g. `{"main_branch": "master"}`, or janitor sees nothing as merged and reports empty tables) and``
- Add the same parenthetical to native-use.md next to the `.agents/project.json` mention (line 28).
- Hand on the code fix to janitor's owner: detect the default branch, or refuse when `refs/heads/<main_branch>` is missing.
- Predicted: with `main_branch` set, the step-5 janitor run lists `build/greet-cli` under JUDGMENT.

### R8 — MED — F7 is under-rated.

`Lead-session:` is mandatory on the installed 0.20.10 (work-record.mjs on main, around line 801, `lead-session-missing`) and appears in neither operator doc. It is covered by R3's sentence. Raise F7 to med in the evidence.

### R9 — LOW — `claude plugin list` prints no path. `claude plugin list --json` does.

**Evidence**: both commands, run on this host.

**Patch** (native-use.md:20-21)
- Old: ``find that root with `claude plugin list` (its cache path is typically``
- New: ``find that root as `installPath` in `claude plugin list --json` (typically``

### R10 — LOW — Placement and an unsupported claim in the new subsection.

- **Unsupported sentence.** native-use.md:23-24, "This is the same pattern the shared docs already use for `docs/<name>.md` links (see below)." Nothing below uses a plugin-root pattern. Delete the sentence.
- **Heading placement.** The new `###` heading was inserted mid-section. The pre-existing paragraphs on `continue`/`bearings`/`decisions`/`multi`, "Honor an explicit user stop", and the Codex trial paragraph now fall under "Script paths, the goal card…". Move the whole subsection, plus the bearings/Notion paragraph, to just before `## Choose the route`.
- **Anchor.** The README anchor still resolves after the move.

### R11 — LOW — The evidence names the wrong hook event for card injection.

- Evidence line 21 says "PostToolBatch/systemMessage". The transcripts show the card in **SessionStart `additionalContext`**, for example fdc48212 at 18:35:21.
- Old: "transcript's `PostToolBatch`/`systemMessage` carries"
- New: "transcript's SessionStart hook `additionalContext` carries"

### R12 — BLOCKS ACCEPTANCE, outside this lane's files — The sealed suite is red on this host.

The H6 and V4 causes and patches are in answer 6. Record in the evidence and the RESULT that:
- both failures are pre-existing on main (ac9c842);
- they are POSIX-only;
- they are handed on to multi's owner, or to lane two for the mirror test;
- acceptance of this lane then needs either that fix landed or Ben's waiver.

### R13 — MED (work stalled; bears on the lane's wall clock, not the tiny build)

**Evidence**
- The builder's `Bash` call `rm -rf ~/tmp/fresh-walk-2026-09-25-rerun; mkdir … git init …` was issued at 18:45:29 Sep 25. Its result came back at 14:16:41 Sep 26: **1171 min in one tool call**.
- The lead session shows no activity from 18:42:58 Sep 25 to 14:34:34 Sep 26.
- The cause is not proven by the transcript. It is consistent with an approval prompt for `rm -rf` in a background subagent that nobody watched.
- The whole walk (steps 0-5) ran from 18:34 to 18:43 Sep 25. The re-runs ran from 14:17 to 14:22 Sep 26.
- The stall overlapped R1: skills-fable's ASK asking about this exact stall went to a nested session instead of the lead.

**Fix**
- Add to the evidence: "Lane wall clock: builder spawned 18:31 Sep 25, done 14:34 Sep 26; 19.5 h of that was one blocked tool call (`rm -rf` of the re-run dir). The walk itself took 9 min."
- For the next lane's brief: tell the builder to create a new dated directory instead of `rm -rf`-ing an old one.

## Verified absences

- No forbidden file is touched and README's changelog is untouched (diff --name-only: 3 files).
- The goal-card default path, the config key and the exit codes in native-use.md are correct against the code.
- The `build-census.mjs --lead <jsonl> > file` invocation is correct (build-census.mjs:961-975, output to stdout), and the re-run confirms it.
- The `accept` flags in native-use.md:49-51 (`--repo`, `--record`, `--pinned-artifact`, `--census`, `--no-census`) match work-record.mjs:1043-1045.
- The README anchor `#script-paths-the-goal-card-and-closing-a-build-in-a-fresh-project` matches the heading.
- The builder and reviewer model ids, the census and `accept --census` success are real (answer 1).
- The F3 Notion statement agrees with skills/bearings/SKILL.md:40-54. The script itself only needs an http(s) publication URL (bearings-state.mjs:33-39), but the skill prescribes Notion, so the doc sentence is not false.

## Bug-fix fields (for R1, the work-lost defect)

Cause: nested `claude -p` sessions inherit the pane's ORCA_TERMINAL_HANDLE. hooks/multi-inbox.js (cheapSlug :117-139, registerMyInbox :195-227) maps that handle to the pane's slug, registers the child as skills-h's inbox with the child's cwd, and the UserPromptSubmit branch acks what it injects (:431-438). Notes therefore land in and are consumed by throwaway sessions, and note-send.mjs:392-395 moves the ledger and packet to the child's directory.
Discriminating check: in a bound pane, run `env | grep -c ORCA_TERMINAL_HANDLE` (1). Start `claude -p "say ok"` in a scratch dir, send the pane an FYI, and check the child transcript for "new peer note for <slug>". Repeat with `env -u ORCA_TERMINAL_HANDLE -u NOTE_SLUG claude -p …`: the note should appear only in the pane.
Fix location: docs now, in skills/multi/SKILL.md (W2) and docs/native-use.md (W1). Code handed on for hooks/multi-inbox.js (registration and ack guard), owned by multi.
Simplification: a single `env -u` prefix on nested sessions removes the collision without new mechanism. The code guard (never register or ack when the handle's binding names a different live session) replaces behaviour rather than adding to it.
