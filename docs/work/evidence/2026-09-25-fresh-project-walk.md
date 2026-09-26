# Fresh-project usability walk (W1), 2026-09-25/26

Operator persona: a Claude session with no prior context on this plugin, restricted to
`docs/native-use.md` and `README.md` as its only instructions (per the lane brief).
Throwaway repos: `~/tmp/fresh-walk-2026-09-25` (the walk) and
`~/tmp/fresh-walk-2026-09-25-rerun` (doc-fix verification), both outside `~/Code`, on
this Hetzner host. Plugin installed at user scope; version moved 0.20.9 -> 0.20.10
mid-walk when another lane's release landed on `origin/main` and this host's
periodic update picked it up — expected background activity, not a finding.

All times America/New_York (host is EDT, UTC-4).

## Step table

| step | command | result | minutes |
|---|---|---|---|
| 0. install | `claude plugin marketplace add benzhuk/claude-delegation` then `claude plugin install delegation@benzhuk` (README "Install") | both idempotent; printed "already on disk" / "already installed (scope: user)" | <1 |
| 1. goal card (first attempt, docs-only) | nested `claude -p` session told to write the project's goal document from native-use.md + README.md alone | wrote `docs/GOALS.md` as a **prose skeleton** with UNSTATED slots; did not produce a goal card at all — see Finding F1 | 0.5 |
| 1. goal card (mechanism confirmation) | hand-wrote `docs/goals/card.md` in the correct 5-line format, `node .../scripts/goal-card.mjs check` | `ok: ... (323 bytes rendered)`, exit 0 | 0.5 |
| 1. goal card (rejection text) | truncated the card to 2 lines, re-ran `check` | `goal-card: ...: expected exactly 5 card lines, found 2`, exit 1 | 0.2 |
| 1. goal card (injection confirmation) | `claude -p --output-format stream-json --verbose "Say OK."` with valid card in place | transcript's SessionStart hook `additionalContext` carries the injected "Goal card for this project: ..." text | 0.3 |
| 1. goal card (rejection notice at SessionStart) | same, with the malformed card | `systemMessage`: "goal card not injected: ... expected exactly 5 card lines, found 2. No goals are being restated in this session; fix the card or run `node scripts/goal-card.mjs check`." — remedy command assumes plugin-checkout cwd, see F2 | 0.3 |
| 2. bearings (state) | `node .../skills/bearings/scripts/bearings-state.mjs check --repo .` with card removed, then with card present | no-card: `{"status":"unconfigured","reason":"current goal card is missing",...}`; with card: `{"status":"due","reason":"no completion receipt",...}` (spec's "unknown" is loose phrasing for this "unconfigured" state, not itself a finding) | 0.3 |
| 2. bearings (SessionStart advisory) | fresh `claude -p` session, card present | `systemMessage`: "Bearings are due. Run `/delegation:bearings` to assess the current goal and publish the result." | 0.2 |
| 2. bearings (run the skill) | `claude -p "/delegation:bearings"` | verdict RE-PLAN, wrote `docs/bearings/2026-09-25-{packet,assessment,lead-response}.md`, spawned an Opus reviewer subagent itself; explicitly could **not** finish (publish + completion receipt) because no Notion page is configured for the project — stopped there per instructions. See F3. | 2.0 |
| 3. multi (self-test note) | `note-send --from scratch-h --to skills-h --kind FYI --topic fresh-walk-selftest --text "..."` from `~/tmp/scratch-h`, then `note-inbox --me skills-h` (no `--ack`) | note recorded to `~/.agents/notes/2026-09-25.md` and the project's own ledger; `note-inbox` shows "1 new peer note for skills-h: ...FYI: W1 self-test note..." | 0.3 |
| 3. multi (pane hook delivery) | — | **NOT delivered to the lead pane.** The hook injected the note into the nested tiny-build session 305393c2 (UserPromptSubmit, 18:39:25) and acked it there; the lead pane never saw it, and `note-inbox --me skills-h` now reports no new notes. See F8. | — |
| 4. tiny build (docs-only, one lead session) | one `claude -p --model opus` session told to build `scripts/greet.mjs` + `scripts/greet.test.mjs` through spec -> record -> Sonnet builder -> Opus reviewer -> integrate -> census -> accept, using only native-use.md/README.md, self-serving through any gap via error messages (one hint given: the prompt said `build-census.mjs` and `work-record.mjs` are under the installed plugin's `scripts/`, and it named every role/model tier and told the lead to integrate itself — see R5) | **accepted**; `work-record.mjs accept --census` exited 0; `Status: accepted`. Took 4 failed `accept` attempts (`--record is required` -> `--delivery-ref or --pinned-artifact required` -> `missing required field: work` -> pass) and hand-guessing the record schema by grepping `work-record.mjs`'s parser. No `delegation:integrator` agent ran — the lead integrated inline. See F4/F5. | 3.53 (212s) |
| 5. janitor | `claude -p "/delegation:janitor"` | SAFE and JUDGMENT tables both empty even though a fully-merged, clean `build/greet-cli` worktree/branch existed; janitor's own report attributes this to defaulting `main_branch` to `"main"` when the repo's actual default branch is `master` and no `.agents/project.json` sets `main_branch`. See F6 (handed on). | 0.3 |

Tiny-build timing breakdown (from the lead session's own `docs/work/tiny-build-timeline.log`, ISO timestamps, 2026-09-25 America/New_York):

| phase | start | end | duration |
|---|---|---|---|
| (session start -> first log line) | 18:39:23 | 18:39:53 | 30s |
| SPEC | 18:39:53 | 18:39:53 | 0s |
| RECORD | 18:40:02 | 18:40:02 | 0s* |
| BUILD (Sonnet builder subagent) | 18:40:05 | 18:40:39 | 34s |
| REVIEW (Opus reviewer subagent) | 18:40:41 | 18:41:33 | 52s |
| INTEGRATE | 18:41:33 | 18:41:43 | 10s |
| CENSUS | 18:41:47 | 18:41:52 | 5s |
| ACCEPT | 18:41:52 | 18:42:36 | 44s (4 attempts, 3 failed) |
| (ACCEPT end -> session end / final report) | 18:42:36 | 18:42:55 | 19s |
| (session start -> session end, for reference only — not ask-to-accepted) | 18:39:23 | 18:42:55 | 212s = 3.53 min |
| **Ask -> accepted** (prompt 18:39:25 -> accept Log 18:42:34) | 18:39:25 | 18:42:34 | **189s = 3.15 min = 0.052 h** (spec written -> accepted: 161s) |

\* record opened in a non-schema shape; the schema-valid record, with back-dated `Log:` stamps (18:40:02 to 18:41:43), was written in one piece during ACCEPT at 18:42:29, by `git mv` plus a full rewrite.

Census (from `docs/work/wr-2026-09-25-greet-cli.record.md`): leadTurns **1**, total assistant
turns (deduped) **14**, wallClockHours **0.04**, by-model `claude-opus-5-5=846482,
claude-sonnet-5=164827` (input+cache+output tokens). Session `num_turns` reported by the
CLI for the whole lead session: **29** (includes the two Agent-tool calls and their
reports; `leadTurns` in the census counts conversational lead turns only, per
`docs/census.md`'s definition, hence the smaller number).

**Hours ask to accepted for this fresh-project walk's tiny build: 0.052 hours (189s, prompt
18:39:25 -> accept Log 18:42:34; spec-written-to-accepted was 161s).** This excludes
composing the ask itself, the goal-card setup, and the lane's own wall clock (see R13 — the
lane stalled 19.5h on an unrelated approval after this tiny build finished). This is an
unusually fast number: the lead session had no human in the loop guessing on its behalf and
self-served entirely through CLI error messages (e.g. `accept` telling it which flag it
forgot); a more cautious agent, or one that gives up on ambiguous error messages instead of
iterating, could stall indefinitely at the RECORD/ACCEPT step (see F4/F5) rather than finish
in about 3 minutes.

## Findings

| id | severity | doc-or-code file:line | what happened | sentence that would have prevented it | disposition |
|---|---|---|---|---|---|
| F1 | high | `docs/native-use.md` (no mention at all, pre-fix); `README.md:144-146` (pre-fix, names `templates/goal-card.md` only in passing) | A docs-only agent asked to write the project's goal document guessed the wrong path (`docs/GOALS.md`) and the wrong format (prose headings) because neither operator doc gives the goal card's default path (`docs/goals/card.md`), its 5-line `GOAL/NOT/DONE/KILL/SOURCE` format, or the `.agents/project.json` `goal_card` override — that content exists only in `templates/goal-card.md`, never linked from either doc. | "The goal card lives at `docs/goals/card.md` by default ... in exactly this shape: GOAL/NOT/DONE/KILL/SOURCE, five lines." | fixed-docs (`docs/native-use.md`, new "Script paths, the goal card, and closing a build in a fresh project" subsection; `README.md`, new paragraph after the Install section) |
| F2 | med (was low, R6) | `scripts/goal-card.mjs:337` (code, W2-allowed) | The malformed-card rejection notice tells the user to run `node scripts/goal-card.mjs check`, which assumes the current directory is the plugin's own checkout; that path does not exist in a fresh project (confirmed: `Cannot find module '.../scripts/goal-card.mjs'`). | "...fix the card or find `goal-card.mjs` under your installed plugin (see native-use.md)." | **fixed-code** (R6): `rejectionNotice` now names the script's own real path via `fileURLToPath(import.meta.url)`, with a new assertion in `scripts/goal-card.test.mjs` pinning it; full suite for the file (32 tests) passes |
| F3 | med | `skills/bearings/` (forbidden territory); doc gap in `docs/native-use.md`/`README.md` (no mention of the Notion dependency at all, pre-fix) | `/delegation:bearings` ran to a full RE-PLAN verdict with its own Opus reviewer pass, but explicitly could not publish or record a completion receipt without a configured Notion page, per the lane's no-Notion-writes constraint. Nothing in either operator doc warns a first-time, Notion-less user that bearings will stay "due" indefinitely. | "Running bearings to completion needs a configured Notion page for this project; without one it still writes the packet/assessment/lead-response files and gives a verdict, but stays due indefinitely." | fixed-docs (native-use.md, added as the closing sentence of the new subsection) + handed-on (an offline/no-Notion completion path for bearings itself is a skills/bearings change, out of this lane's file territory) |
| F4 | high | `docs/native-use.md:13` (pre-fix: bare link, no schema); `README.md` (record schema never given outside the changelog, which is off-limits to edit) | The tiny-build lead session needed 4 `accept` attempts and had to grep `scripts/work-record.mjs`'s parser (source, not a doc) to learn the record's required fields, `Status:` enum, and `Log:` line shape, because native-use.md only links to `work-record.md` in passing prose and README never states the schema outside its changelog entries. | "Before opening a record, read `work-record.md` for the exact field schema — `work-record.mjs check-acceptance`/`accept` parse it strictly and reject a hand-guessed shape." | **fixed-docs, re-run clean** (R2/R3): native-use.md now states the exact `check-acceptance --pinned-artifact` command and the full field list `accept` needs (`Status: reviewed`, `Worktree:`, `Lead-session:`, an `Observed:` paragraph, the reviewed `Log:` line, census-after-review) — a record built from that text passed `check-acceptance` and `accept --census` on the first attempt each in a fresh `~/tmp/fresh-walk-2026-09-26-r2` repo; see the re-run table |
| F5 | high | `docs/native-use.md` (no mention, pre-fix); `README.md:266-275` (only in the changelog, off-limits to edit) | `build-census.mjs` and `work-record.mjs accept`/`check-acceptance` are named only in README's changelog section; neither script's invocation (flags, transcript path, plugin-root resolution) appears anywhere a first-time reader would look. The lead session found `--lead`, `--repo`, `--record`, `--pinned-artifact`, `--census` only by reading each command's own error text. | Give the exact `build-census.mjs --lead <transcript>` and `work-record.mjs check-acceptance`/`accept --pinned-artifact ... --census ...` invocations, with the plugin-root resolution pattern, in native-use.md (not the changelog). | fixed-docs (native-use.md, same subsection as F1/F4) — **verified by re-run below**: the documented `build-census.mjs --lead <transcript>` command now succeeds on the first try |
| F6 | med | `scripts/janitor.mjs:528` (`config.main_branch \|\| "main"`) — not a W2-allowed file | On a repo whose default branch is `master` (this walk's throwaway repo) with no `.agents/project.json`, `/delegation:janitor` returned empty SAFE and JUDGMENT tables even though a fully merged, clean worktree+branch existed; the nested session's own diagnosis is that the hardcoded `"main"` default silently fails janitor's merge check instead of surfacing a "main branch not found" condition. | janitor should detect the repo's actual default branch (or refuse with a clear message) instead of assuming `"main"` when `.agents/project.json` has no `main_branch`. | **fixed-docs (R7)** + handed-on: `skills/janitor/SKILL.md`'s Adapters section and native-use.md now both state the `main_branch` default and the `master`-on-plain-`git init` trap; `scripts/janitor.mjs`'s hardcoded default itself is outside every lane's allowed files and stays handed on to janitor's owner |
| F7 | med (was low, R8) | `docs/work-record.md` (no mention); implied by F4's re-run | `Lead-session:`, `Spec-session:`, `Spec-from:` are enforced/warned-on by `scripts/work-record.mjs` (0.20.10) but are not in `docs/work-record.md`'s field table at all (only `Worktree:` is documented, and only in body prose at line 134, not the summary table). `Lead-session:` is mandatory on the installed 0.20.10 (`lead-session-missing`), which is why this is now med rather than low. | Add `Lead-session:`, `Spec-session:`, `Spec-from:` to `docs/work-record.md`'s field table with their required/optional status. | handed-on, mitigated: `docs/work-record.md`'s own table still lacks these fields (out of this lane's declared doc-fix scope, and the addendum's "otherwise put the needed fields in native-use.md" applies), but native-use.md's R3 fix now states `Lead-session:`/`Worktree:`/`Observed:` directly, so a user following native-use.md alone gets them |
| F8 | high (was low, R1) | `hooks/multi-inbox.js:117-139,195-227` (slug from inherited `ORCA_TERMINAL_HANDLE`); `hooks/multi-inbox.js:431-438` (ack after inject); `skills/multi/scripts/note-send.mjs:392-395` (ledger follows the registered inbox's cwd) | Two peer notes were lost, not just misdelivered: the step-3 self-test note (`scratch-h-fresh-walk-selftest-1`) was injected into the nested tiny-build session 305393c2 at 18:39:25 and acked there; skills-fable's `ASK [skills-fable-fresh-project-walk-1]` was injected into the F1 re-run session 6c14bff5 at 14:17:16 on 2026-09-26 and answered late, after its 12:00 deadline. Cause: a `claude -p` started inside a bound pane inherits `ORCA_TERMINAL_HANDLE`/`NOTE_SLUG`, registers itself as the pane's inbox with its own cwd, and the hook ACKs whatever it injects — so both notes' ledger lines and skills-fable's packet moved into `~/tmp/fresh-walk-2026-09-25/docs/{ledger,notes}/`, not the plugin repo. | "A `claude -p` started from inside a bound pane inherits `ORCA_TERMINAL_HANDLE`, claims the pane's slug, receives and acks its peer notes, and moves its ledger into the child's directory. Start nested sessions with `env -u ORCA_TERMINAL_HANDLE -u NOTE_SLUG claude -p …`." | fixed-docs (R1: `skills/multi/SKILL.md` and `docs/native-use.md` both now carry the `env -u` sentence) + handed-on (code: the hook should refuse to register or ack for a session whose handle is already bound to a live, different session id, or for a non-interactive session — owned by multi) |
| F9 | med (new, R13) | lane wall clock, not a doc/code file | The builder's `rm -rf ~/tmp/fresh-walk-2026-09-25-rerun; mkdir … git init …` Bash call, issued 18:45:29 on 2026-09-25, did not return until 14:16:41 on 2026-09-26 — 1171 minutes (19.5h) inside one tool call, consistent with an unwatched approval prompt for `rm -rf` in a background subagent. The tiny build itself (steps 0-5) ran 18:34-18:43 on 2026-09-25; the stall then ate the rest of the lane's wall clock before the F1/F5 re-runs ran 14:17-14:22 on 2026-09-26. This stall is also why F8's skills-fable note went unanswered past its deadline. | "Create a new dated directory for a re-run throwaway repo instead of `rm -rf`-ing an old one; never chain a deletion needing approval onto productive work." | handed-on, evidence recorded here; this round's own re-runs used new directory names (`~/tmp/fresh-walk-2026-09-26-r2`) and never `rm`/`rm -rf`, per the round-2 mandate |

Counts: **9 findings** — high: 4 (F1, F4, F5, F8); med: 5 (F2, F3, F6, F7, F9); low: 0.
Disposition (round 2): **fixed-docs, re-run clean: 4** (F1, F4, F5, F8 — native-use.md's
subsection plus `skills/multi/SKILL.md`); **fixed-docs + handed-on: 3** (F3, F6, F7);
**fixed-code: 1** (F2, R6); **handed-on with a wall-clock lesson only: 1** (F9, R13).
Round-1's earlier "W2 does not exist" call was itself a finding (round-2 review R1/R6/R7):
W2 now holds three commits — R6 (`scripts/goal-card.mjs` + test), R7's doc half
(`skills/janitor/SKILL.md`), and R1's sentence (`skills/multi/SKILL.md`) — see "Territory
W2" below.

## Doc fixes made

- `docs/native-use.md`: strengthened the existing "See work records" sentence into an
  imperative instruction naming the 9 base required fields (F4); added a new subsection
  "Script paths, the goal card, and closing a build in a fresh project" giving the
  plugin-root path-resolution pattern, the goal card's default path and exact 5-line
  format (F1), and the `build-census.mjs`/`work-record.mjs check-acceptance`/`accept`
  invocations (F5); added a closing sentence on the Notion dependency for a completed
  bearings cycle (F3). All Codex-specific prose elsewhere in the file is unchanged.
- `README.md`: added one short paragraph after the "Install" section's peer-notes note,
  pointing to the new native-use.md subsection (F1/F5). The changelog was not touched.

Round 2 (this pass, against `wr-2026-09-25-fresh-project-walk-w1-review-r1.md` R1-R11):

- `docs/native-use.md`: fixed the `check-acceptance` command to require
  `--pinned-artifact`/`--delivery-ref` like `accept` (R2); corrected `bearings-state.mjs`'s
  path to `<plugin-root>/skills/bearings/scripts/` (R4); named the full record schema
  `accept` needs — `Status: reviewed`, `Worktree:`, `Lead-session:`, an `Observed:`
  paragraph, the reviewed `Log:` line, census strictly after it (R3); replaced `claude
  plugin list` with `claude plugin list --json`'s `installPath` (R9); added the
  nested-`claude -p`-inherits-the-pane's-identity warning (R1); added the janitor
  `main_branch` default/trap note (R7); dropped an unsupported "same pattern" sentence and
  moved the whole script-paths subsection plus the bearings/Notion paragraph to sit
  directly before "Choose the route" instead of splitting unrelated paragraphs (R10).
- `skills/multi/SKILL.md` (W2): added the same nested-session warning, with the `env -u
  ORCA_TERMINAL_HANDLE -u NOTE_SLUG` fix (R1).
- `skills/janitor/SKILL.md` (W2): documented `main_branch`'s default and the
  plain-`git init`-gives-`master` trap in the Adapters section (R7).
- `scripts/goal-card.mjs` + `scripts/goal-card.test.mjs` (W2): `rejectionNotice` now names
  its own real script path via `fileURLToPath(import.meta.url)` instead of a
  plugin-checkout-relative one; a new assertion pins it (R6, F2).
- This evidence file: corrected the hook event name (R11), the step-3 result (R1), the
  tiny-build timing/hints/integrator claims (R5), F2/F6/F7/F8's severities and
  dispositions (R6/R7/R8/R1), and added F9 (R13).

## Re-run table (doc-fix verification)

Fresh second throwaway repo: `~/tmp/fresh-walk-2026-09-25-rerun` (`git init`, one commit,
outside `~/Code`), plugin 0.20.10 (the version live on this host by the time of the
re-run).

| finding | re-run step | following only the new text | result |
|---|---|---|---|
| F1 | nested `claude -p` session told to write the project's goal card from native-use.md + README.md alone, given the goal/not/done/kill/source content in the prompt | used the new subsection's path and format | **passes on the first try**: wrote `docs/goals/card.md` in the exact 5-line shape at the documented default path; `node <plugin-root>/scripts/goal-card.mjs check` (the plugin-root pattern from the new text, found via `claude plugin list`) returned `ok: ... exit=0` |
| F5 (census specifically) | nested `claude -p` session builds a trivial 2-file change, opens a record, then runs census and accept per the new native-use.md text only (explicitly told not to read `work-record.md`/`work-record.mjs` source/skill files) | used the new subsection's `build-census.mjs --lead <transcript>` command verbatim | **passes on the first try**: `node $P/scripts/build-census.mjs --lead ~/.claude/projects/.../<session>.jsonl > docs/work/wr-2026-09-26-ping.census.md` succeeded with no retries — the one command in the whole re-run that needed no guessing |
| F4 (round 1, record schema specifically) | same session, `check-acceptance`/`accept` | native-use.md's strengthened pointer names only the 9 base fields; the session was told (as this lane's operator restriction requires) not to read `work-record.md` itself | **did not fully pass** (round 1): still took 5 attempts to satisfy `check-acceptance` and 3 to `accept`. Superseded by round 2's rebuild of the fix below. |

Round 2 re-runs (against R1-R11's exact patches), fresh throwaway repo `~/tmp/fresh-walk-2026-09-26-r2` (`git init`, outside `~/Code`; no `rm -rf` used anywhere, per the round-2 mandate), plugin 0.20.10, commands run directly from the corrected doc text (not re-wrapped in a nested docs-only session, since each of these is "does this exact documented command/schema work", not an interpretation test):

| finding | re-run step | following only the new text | result |
|---|---|---|---|
| F1 (goal card, re-confirmed after the R10 move) | wrote `docs/goals/card.md` per the (relocated but textually unchanged) subsection, ran `node <plugin-root>/scripts/goal-card.mjs check --repo .` | | **passes on the first try**: `ok: .../docs/goals/card.md (336 bytes rendered)`, exit 0 |
| R4 (`bearings-state.mjs` path) | `node <plugin-root>/skills/bearings/scripts/bearings-state.mjs check --repo .` | new path from R4's patch | **passes on the first try**: `{"status":"unconfigured",...}`, exit 0 |
| R9 (`claude plugin list --json`) | ran the documented command | | **passes on the first try**: prints `installPath` for the installed 0.20.10; plain `claude plugin list` (the old text) prints no path, confirming R9's diagnosis |
| F5 (census) | built a trivial `scripts/ping.mjs` + test, ran a one-line `claude -p` for a real lead transcript, then `node <plugin-root>/scripts/build-census.mjs --lead <transcript.jsonl> > docs/work/<id>.census.md` verbatim | | **passes on the first try**: exit 0, correct `VERDICT: COUNTED` header |
| F4/R2/R3 (full record schema, `check-acceptance` + `accept --census`) | built a record with exactly the fields native-use.md's rewritten subsection now lists (`Status: reviewed`, `Worktree:`, `Lead-session:`, an `Observed:` paragraph, a `Log: ... reviewed ...` line placed before the census's own `leadLastMessageAt`), then ran `check-acceptance --pinned-artifact <sha>` and `accept --pinned-artifact <sha> --census <file>` verbatim | | **both pass on the first try**: `check-acceptance` returns `{"ok":true,...}` (two unrelated `Spec-session:`/`Spec-from:` warnings, not failures — those two fields are handed on, F7); `accept` returns `{"ok":true,...}` and the record's `Log:` gains `accepted`. This matches R3's prediction exactly. F4 is now fixed-docs, re-run clean, not a partial. |

Two things happened before the clean pass above, both recorded for honesty rather than
hidden: (1) a record built without `Lead-session:` (an operator slip, not a doc gap —
native-use.md's rewritten text lists the field) failed `check-acceptance` with
`lead-session-missing`, exactly as the docs predict; (2) a record whose `Log: ... reviewed
...` timestamp was taken from wall-clock "now" (after the transcript had already finished)
then failed `accept` with `census-stale` — the documented ordering rule ("take the census
after that Log line") doing its job, not a doc failure. Both were fixed by re-reading and
re-applying native-use.md's own text, then the row above passed clean.

## Territory W2

**W2 exists (round-2 correction of round 1's "W2 does not exist" call).** Round 1 was
wrong to call F2 "superseded" and to leave F6/F8's mitigations entirely off the
W2-allowed files; round 2's review (R1, R6, R7) named three small, in-territory fixes,
each its own commit:

- **R6 / F2** — `scripts/goal-card.mjs` (`rejectionNotice`, 3 code lines) +
  `scripts/goal-card.test.mjs` (2 new assertion lines). The remedy message a user actually
  sees when the card is malformed now names its own real path instead of a
  plugin-checkout-relative one. Commit `dee95ab`.
- **R7 / F6 (doc half)** — `skills/janitor/SKILL.md`'s Adapters section (4 lines): states
  `main_branch`'s default and the plain-`git init`-gives-`master` trap. `scripts/janitor.mjs`
  itself (the hardcoded `"main"` default) stays outside every lane's allowed files and is
  handed on to janitor's owner — that half of F6 is not in W2's scope no matter what.
  Commit `3db7270`.
- **R1 (new)** — `skills/multi/SKILL.md` (6 lines): the same nested-`claude
  -p`-inherits-the-pane's-identity warning as native-use.md's W1 fix, with the `env -u`
  remedy. Commit `f4bd183`.

F7 (`docs/work-record.md`'s field table) and the code half of F6/F8 (`scripts/janitor.mjs`,
`hooks/multi-inbox.js`) remain outside every lane's currently-listed allowed files and stay
handed on. F1/F4/F5's fixes are W1's own doc-fix mandate (`docs/native-use.md`), not W2.

## Janitor output summary (step 5)

`/delegation:janitor` on the throwaway repo (post tiny-build, pre-cleanup): SAFE table
empty, JUDGMENT table empty, drift line reported "488 KB on disk, 2 worktrees, 2 local
branches, 8 untracked files." The nested session's own diagnosis (F6) is that the
merged-and-clean `build/greet-cli` worktree/branch should have appeared under JUDGMENT
("merged locally, not confirmed on origin") but was silently dropped because the repo's
default branch is `master` and janitor assumes `"main"` with no `.agents/project.json`
override. The 8 untracked files (goal card, bearings packet/assessment/lead-response,
ledger, census, timeline log) were correctly left out of both tables — they look like
real work, not scratch, and janitor's report says so explicitly. No SAFE cleanup was
available to `--apply`; the throwaway repo and its worktree were left in place (see
"Leftover dirs/worktrees" in the report to the orchestrator).

## Known pre-existing sealed-suite failures (R12, out of this lane's files)

`node scripts/run-tests.mjs` on this branch fails exactly two tests, both confirmed
pre-existing on `main` at `ac9c842` and both POSIX-only:

- **H6** (`skills/multi/scripts/note-send.test.mjs` -> `skills/multi/scripts/transport.mjs:434`):
  `mainCheckout` resolves a relative `--git-common-dir` with the host's own `path.resolve`,
  so a Windows-path literal gets the Linux worktree's own path prepended on every POSIX host.
- **V4** (`skills/multi/scripts/mirror-shim.test.mjs:291-297`): on POSIX the mirror publishes
  each skill as a directory **symlink**; `readdirSync(..., {recursive:true})` follows it into
  the source tree, which contains `*.test.mjs`. The "no test file published" assertion only
  holds where publishing is a copy (Windows).

Neither file is in this lane's allowed territory (`skills/multi/scripts/*` belongs to the
multi owner; the mirror script belongs to a different lane). Per the round-2 mandate, the
gate is expected to show exactly these two failures and no others — that is what "green" means
for this lane. Acceptance of the whole workstream still needs one of: a small fix lane owned
by multi/mirror taking the two patches the round-1 review worked out, or Ben's explicit
waiver recorded in the work record.

A third, unrelated failure was observed intermittently across several gate runs during this
round: `skills/decisions/scripts/registered-pickup.contract.test.mjs`'s "one injected
selection invokes exactly one bound entry..." test (assertion "ordinal selects canonical
repo/page order, not fixture creation order"), 1-2 times out of 5 full-suite runs, always
passing standalone (8/8) and never failing on pristine `main` at `ac9c842` in the same runs.
`skills/decisions/` is explicitly forbidden territory for this lane; this is recorded as an
observation, not fixed, not counted against this lane's gate, and not one of the two
failures the round-2 mandate names.
