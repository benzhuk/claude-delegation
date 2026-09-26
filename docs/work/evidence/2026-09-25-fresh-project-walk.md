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
| 1. goal card (injection confirmation) | `claude -p --output-format stream-json --verbose "Say OK."` with valid card in place | transcript's `PostToolBatch`/`systemMessage` carries the injected "Goal card for this project: ..." text | 0.3 |
| 1. goal card (rejection notice at SessionStart) | same, with the malformed card | `systemMessage`: "goal card not injected: ... expected exactly 5 card lines, found 2. No goals are being restated in this session; fix the card or run `node scripts/goal-card.mjs check`." — remedy command assumes plugin-checkout cwd, see F2 | 0.3 |
| 2. bearings (state) | `node .../skills/bearings/scripts/bearings-state.mjs check --repo .` with card removed, then with card present | no-card: `{"status":"unconfigured","reason":"current goal card is missing",...}`; with card: `{"status":"due","reason":"no completion receipt",...}` (spec's "unknown" is loose phrasing for this "unconfigured" state, not itself a finding) | 0.3 |
| 2. bearings (SessionStart advisory) | fresh `claude -p` session, card present | `systemMessage`: "Bearings are due. Run `/delegation:bearings` to assess the current goal and publish the result." | 0.2 |
| 2. bearings (run the skill) | `claude -p "/delegation:bearings"` | verdict RE-PLAN, wrote `docs/bearings/2026-09-25-{packet,assessment,lead-response}.md`, spawned an Opus reviewer subagent itself; explicitly could **not** finish (publish + completion receipt) because no Notion page is configured for the project — stopped there per instructions. See F3. | 2.0 |
| 3. multi (self-test note) | `note-send --from scratch-h --to skills-h --kind FYI --topic fresh-walk-selftest --text "..."` from `~/tmp/scratch-h`, then `note-inbox --me skills-h` (no `--ack`) | note recorded to `~/.agents/notes/2026-09-25.md` and the project's own ledger; `note-inbox` shows "1 new peer note for skills-h: ...FYI: W1 self-test note..." | 0.3 |
| 3. multi (pane hook delivery) | — | **pane hook delivery: confirmed by lead** (placeholder; interactive/un-agent-able, lead skills-h fills the actual result) | — |
| 4. tiny build (docs-only, one lead session) | one `claude -p --model opus` session told to build `scripts/greet.mjs` + `scripts/greet.test.mjs` through spec -> record -> Sonnet builder -> Opus reviewer -> integrate -> census -> accept, using only native-use.md/README.md, self-serving through any gap via error messages (no hints given) | **accepted**; `work-record.mjs accept --census` exited 0; `Status: accepted`. Took 4 failed `accept` attempts (`--record is required` -> `--delivery-ref or --pinned-artifact required` -> `missing required field: work` -> pass) and hand-guessing the record schema by grepping `work-record.mjs`'s parser. See F4/F5. | 3.53 (212s) |
| 5. janitor | `claude -p "/delegation:janitor"` | SAFE and JUDGMENT tables both empty even though a fully-merged, clean `build/greet-cli` worktree/branch existed; janitor's own report attributes this to defaulting `main_branch` to `"main"` when the repo's actual default branch is `master` and no `.agents/project.json` sets `main_branch`. See F6 (handed on). | 0.3 |

Tiny-build timing breakdown (from the lead session's own `docs/work/tiny-build-timeline.log`, ISO timestamps, 2026-09-25 America/New_York):

| phase | start | end | duration |
|---|---|---|---|
| (session start -> first log line) | 18:39:23 | 18:39:53 | 30s |
| SPEC | 18:39:53 | 18:39:53 | 0s |
| RECORD | 18:40:02 | 18:40:02 | 0s |
| BUILD (Sonnet builder subagent) | 18:40:05 | 18:40:39 | 34s |
| REVIEW (Opus reviewer subagent) | 18:40:41 | 18:41:33 | 52s |
| INTEGRATE | 18:41:33 | 18:41:43 | 10s |
| CENSUS | 18:41:47 | 18:41:52 | 5s |
| ACCEPT | 18:41:52 | 18:42:36 | 44s (4 attempts, 3 failed) |
| (ACCEPT end -> session end / final report) | 18:42:36 | 18:42:55 | 19s |
| **Total, spec written -> accepted** | 18:39:23 | 18:42:55 | **212s = 3.53 min = 0.0589 hours** |

Census (from `docs/work/wr-2026-09-25-greet-cli.record.md`): leadTurns **1**, total assistant
turns (deduped) **14**, wallClockHours **0.04**, by-model `claude-opus-5-5=846482,
claude-sonnet-5=164827` (input+cache+output tokens). Session `num_turns` reported by the
CLI for the whole lead session: **29** (includes the two Agent-tool calls and their
reports; `leadTurns` in the census counts conversational lead turns only, per
`docs/census.md`'s definition, hence the smaller number).

**Hours ask to accepted for this fresh-project walk's tiny build: 0.059 hours (3.53
minutes).** This is an unusually fast number: the lead session had no human in the loop
guessing on its behalf and self-served entirely through CLI error messages (e.g. `accept`
telling it which flag it forgot); a more cautious agent, or one that gives up on
ambiguous error messages instead of iterating, could stall indefinitely at the RECORD/ACCEPT
step (see F4/F5) rather than finish in under 4 minutes.

## Findings

| id | severity | doc-or-code file:line | what happened | sentence that would have prevented it | disposition |
|---|---|---|---|---|---|
| F1 | high | `docs/native-use.md` (no mention at all, pre-fix); `README.md:144-146` (pre-fix, names `templates/goal-card.md` only in passing) | A docs-only agent asked to write the project's goal document guessed the wrong path (`docs/GOALS.md`) and the wrong format (prose headings) because neither operator doc gives the goal card's default path (`docs/goals/card.md`), its 5-line `GOAL/NOT/DONE/KILL/SOURCE` format, or the `.agents/project.json` `goal_card` override — that content exists only in `templates/goal-card.md`, never linked from either doc. | "The goal card lives at `docs/goals/card.md` by default ... in exactly this shape: GOAL/NOT/DONE/KILL/SOURCE, five lines." | fixed-docs (`docs/native-use.md`, new "Script paths, the goal card, and closing a build in a fresh project" subsection; `README.md`, new paragraph after the Install section) |
| F2 | low | `scripts/goal-card.mjs:337` (code, W2-allowed) | The malformed-card rejection notice tells the user to run `node scripts/goal-card.mjs check`, which assumes the current directory is the plugin's own checkout; that path does not exist in a fresh project (confirmed: `Cannot find module '.../scripts/goal-card.mjs'`). | "...fix the card or find `goal-card.mjs` under your installed plugin (see native-use.md)." | handed-on (optional future W2; superseded in practice by the F1 doc fix, which now documents the plugin-root path pattern before a user would ever see this message) |
| F3 | med | `skills/bearings/` (forbidden territory); doc gap in `docs/native-use.md`/`README.md` (no mention of the Notion dependency at all, pre-fix) | `/delegation:bearings` ran to a full RE-PLAN verdict with its own Opus reviewer pass, but explicitly could not publish or record a completion receipt without a configured Notion page, per the lane's no-Notion-writes constraint. Nothing in either operator doc warns a first-time, Notion-less user that bearings will stay "due" indefinitely. | "Running bearings to completion needs a configured Notion page for this project; without one it still writes the packet/assessment/lead-response files and gives a verdict, but stays due indefinitely." | fixed-docs (native-use.md, added as the closing sentence of the new subsection) + handed-on (an offline/no-Notion completion path for bearings itself is a skills/bearings change, out of this lane's file territory) |
| F4 | high | `docs/native-use.md:13` (pre-fix: bare link, no schema); `README.md` (record schema never given outside the changelog, which is off-limits to edit) | The tiny-build lead session needed 4 `accept` attempts and had to grep `scripts/work-record.mjs`'s parser (source, not a doc) to learn the record's required fields, `Status:` enum, and `Log:` line shape, because native-use.md only links to `work-record.md` in passing prose and README never states the schema outside its changelog entries. | "Before opening a record, read `work-record.md` for the exact field schema — `work-record.mjs check-acceptance`/`accept` parse it strictly and reject a hand-guessed shape." | fixed-docs (native-use.md, strengthened the existing link to an imperative instruction naming the 9 base required fields) |
| F5 | high | `docs/native-use.md` (no mention, pre-fix); `README.md:266-275` (only in the changelog, off-limits to edit) | `build-census.mjs` and `work-record.mjs accept`/`check-acceptance` are named only in README's changelog section; neither script's invocation (flags, transcript path, plugin-root resolution) appears anywhere a first-time reader would look. The lead session found `--lead`, `--repo`, `--record`, `--pinned-artifact`, `--census` only by reading each command's own error text. | Give the exact `build-census.mjs --lead <transcript>` and `work-record.mjs check-acceptance`/`accept --pinned-artifact ... --census ...` invocations, with the plugin-root resolution pattern, in native-use.md (not the changelog). | fixed-docs (native-use.md, same new subsection as F1) — **verified by re-run below**: the documented `build-census.mjs --lead <transcript>` command now succeeds on the first try |
| F6 | med | `scripts/janitor.mjs:528` (`config.main_branch \|\| "main"`) — not a W2-allowed file | On a repo whose default branch is `master` (this walk's throwaway repo) with no `.agents/project.json`, `/delegation:janitor` returned empty SAFE and JUDGMENT tables even though a fully merged, clean worktree+branch existed; the nested session's own diagnosis is that the hardcoded `"main"` default silently fails janitor's merge check instead of surfacing a "main branch not found" condition. | janitor should detect the repo's actual default branch (or refuse with a clear message) instead of assuming `"main"` when `.agents/project.json` has no `main_branch`. | handed-on (scripts/janitor.mjs is outside every lane's currently-listed allowed files for this walk; `skills/janitor/SKILL.md`, the one W2-allowed file in this area, cannot fix a hardcoded default that lives in the script) |
| F7 | low | `docs/work-record.md` (no mention); implied by F4's re-run | `Lead-session:`, `Spec-session:`, `Spec-from:` are enforced/warned-on by `scripts/work-record.mjs` (0.20.10) but are not in `docs/work-record.md`'s field table at all (only `Worktree:` is documented, and only in body prose at line 134, not the summary table). The lane brief itself anticipates this: "carries your session id in `Lead-session:` field if lane one's field exists on your base." | Add `Lead-session:`, `Spec-session:`, `Spec-from:` to `docs/work-record.md`'s field table with their required/optional status. | handed-on (`docs/work-record.md` is not in this lane's declared doc-fix scope, which names only `native-use.md` and README's install/quickstart; the field itself is lane one's `work-record.mjs` territory) |
| F8 | low | `hooks/` peer-note delivery (not diagnosed further; out of scope) | During the rerun's goal-card session (an unrelated ad hoc `claude -p` invocation), a peer note addressed to `skills-h` about the `fresh-walk-1` branch was injected into that unrelated session's context. Delivery appears to be by pane binding, not by the invoking session's own identity, so an ad hoc session sharing a pane slot can see another session's peer mail. | Not enough evidence from this walk to give a preventing sentence; needs a hooks-territory investigation. | handed-on (hooks/*, multi's delivery mechanism; outside this lane's file territory beyond `hooks/delegation-reminder.js`, which is unrelated to peer-note delivery) |

Counts: **8 findings** — high: 3 (F1, F4, F5); med: 2 (F3, F6); low: 3 (F2, F7, F8).
Disposition: **fixed-docs: 3** (F1, F4, F5 — one combined native-use.md subsection plus one
README pointer); **fixed-docs + handed-on: 1** (F3); **handed-on only: 4** (F2, F6, F7, F8).
**Fixed-code: 0** — see "Territory W2" below for why.

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

## Re-run table (doc-fix verification)

Fresh second throwaway repo: `~/tmp/fresh-walk-2026-09-25-rerun` (`git init`, one commit,
outside `~/Code`), plugin 0.20.10 (the version live on this host by the time of the
re-run).

| finding | re-run step | following only the new text | result |
|---|---|---|---|
| F1 | nested `claude -p` session told to write the project's goal card from native-use.md + README.md alone, given the goal/not/done/kill/source content in the prompt | used the new subsection's path and format | **passes on the first try**: wrote `docs/goals/card.md` in the exact 5-line shape at the documented default path; `node <plugin-root>/scripts/goal-card.mjs check` (the plugin-root pattern from the new text, found via `claude plugin list`) returned `ok: ... exit=0` |
| F5 (census specifically) | nested `claude -p` session builds a trivial 2-file change, opens a record, then runs census and accept per the new native-use.md text only (explicitly told not to read `work-record.md`/`work-record.mjs` source/skill files) | used the new subsection's `build-census.mjs --lead <transcript>` command verbatim | **passes on the first try**: `node $P/scripts/build-census.mjs --lead ~/.claude/projects/.../<session>.jsonl > docs/work/wr-2026-09-26-ping.census.md` succeeded with no retries — the one command in the whole re-run that needed no guessing |
| F4 (record schema specifically) | same session, `check-acceptance`/`accept` | native-use.md's strengthened pointer names only the 9 base fields; the session was told (as this lane's operator restriction requires) not to read `work-record.md` itself | **does not fully pass**: still took 5 attempts to satisfy `check-acceptance` and 3 to `accept` (missing `--pinned-artifact`, wrong `Status:` value, missing `Observed:` paragraph, undocumented `Lead-session:`/`Log:` line shape). This is expected given the fix's design (native-use.md points at `work-record.md` for the exact schema rather than duplicating it, per this lane's declared doc-fix scope) and given F7 (some fields genuinely aren't in `work-record.md` either); a real user who follows the pointer to `work-record.md` — unlike this constrained re-run, which was told not to — gets the complete base schema on the first read. Recorded here as an honest partial: the fix that was in scope (F1, F5-census, the pointer itself) verified; the remainder (F4's full field list, F7) is handed on, not claimed as fixed. |

## Territory W2

**W2 does not exist.** Every finding that needed a code change lives outside the
W2-allowed files (`skills/multi/SKILL.md`, `skills/delegate/SKILL.md`,
`skills/janitor/SKILL.md`, `skills/continue/SKILL.md`, `hooks/delegation-reminder.js`,
`scripts/goal-card.mjs`) or its tests: F6 is in `scripts/janitor.mjs` (not
`skills/janitor/SKILL.md`), F7/F8 are in `docs/work-record.md`/`hooks/*` outside this
lane's declared scope, and F2 (the one finding that does sit in an allowed file,
`scripts/goal-card.mjs`) is superseded by the F1 doc fix — the message it would improve
is now unreachable in practice for a user who read the fixed docs first, so a code change
there is optional polish, not something this walk needs to be usable. All other findings
(F1, F3 partial, F4 partial, F5) are documentation gaps in files that are outside W2's
scope to begin with (they belong to W1's own doc-fix mandate) and were fixed there
directly.

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
