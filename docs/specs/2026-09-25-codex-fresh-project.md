# Lane two: Codex in practice, a fresh-project walk and a Codex-led build on the installed plugin

Written by skills-fable, 2026-09-25 midday, for skills-a (Codex, Windows) leading from a FRESH Codex session. Ben's tick of Sep 25 (decisions page, "Run four build lanes in parallel across four hosts"): four lanes at once, disjoint territories, each pushed on green, one merge tick per day. This lane turns the Codex half from "proven from source" into "used": 0.20.9 is the first release where a Codex session gets the goal card and the bearings notice through its own hooks, and where the census can read a Codex lead or say it cannot.

Measure this lane moves: work lost or stalled (a Codex lead that never saw the goal, or an install step the docs leave out, is lost work) and the "any agent host" goal. Must not worsen: lead turns, mid-tier builds, high-tier reviews, no new mechanism.

Base: origin/main once it carries 0.20.9 (the release lands about 12:00 NYC on Sep 25; if main is still 28a222c when you start, base on origin/build/integrate-0925 at 931588a, which is the same tree minus the version bump). Branch `build/codex-fresh-1`, one worktree per builder, never the main checkout.

## Rules that bind every lane this week
- You lead from a fresh session; the record carries your session id in `Lead-session:` if lane one's field exists on your base, else in the record's `Evidence:` as a line `Lead-session (pre-field): <id>`.
- You wake skills-fable at most three times: ACK when you start, one RESULT at the end, BLOCKED if stuck. Never send an ACK's content under the ASK kind. Reviews are never notes to skills-fable.
- Reviews: Codex high tier (GPT-6-Astra class) since you cannot spawn a Claude Opus agent; the record names the reviewer host and model per territory. Ask skills-o for an Opus review only if the Codex high tier is unavailable, and count that ask as one of your three wakes to skills-o, not to skills-fable.
- No README.md edit and no docs/native-use.md edit (lane three owns the operator docs). Your doc corrections go in your evidence file under a heading `Doc corrections for docs/native-use.md`, one bullet per correction with the exact old and new sentence; skills-fable folds them in at integration.
- Nothing under scripts/build-census.mjs (frozen), scripts/work-record.mjs (lane one), skills/team-build/ (lane four), skills/decisions/, skills/bearings/.

## Territory X1: the walk (evidence only, then fixes in X2)
On this Windows machine, in a throwaway git repo outside any existing project (for example `%TEMP%/codex-fresh-<date>`), follow `docs/native-use.md` section "Current fresh-project route" as a Codex operator would, using only what the docs say, and record each step's command, output head and verdict (works / gap) in `docs/work/evidence/2026-09-25-codex-fresh-project.md`:
1. Install and wiring: the mirror publishes to `~/.agents/skills`, the Codex hooks are wired (`grep -c hooks.state $CODEX_HOME/config.toml`, `codex exec "hi"` printing the hook line), the plugin version the hooks report is 0.20.9.
2. Goal card: a Codex session in a repo with a `docs/GOALS.md` card sees the card in its context at SessionStart and at a prompt; a repo without a card gets the same rejection text the Claude side gives; the `ws-off-goal-card` kill switch removes it. Quote the injected text.
3. Bearings notice: when `bearings-state.mjs check` says due or unknown for that checkout, the Codex session sees the one-line notice; the `systemMessage` shows in the transcript at SessionStart only.
4. Multi: `note-inbox --me <slug> --ack` binds the pane; a note from a Claude session on this machine reaches the Codex session through the hooks (skills-fable will not be woken for this; use a note from a scratch Claude session or the one ACK you owe skills-fable as the probe).
5. Census on a Codex lead: run `node scripts/build-census.mjs --lead <your Codex session file>` (the parity build's P2 says where Codex session files live and what the script prints when it cannot read them). Record the exact output.
Every gap gets a finding: what the doc says, what happened, file:line of the doc or code, severity. Findings that are code go to X2; findings that are docs go under `Doc corrections`.

## Territory X2: fixes on the Codex side (hooks/multi-codex-hook.mjs, hooks/codex-hooks.json, scripts/mirror-shared-skills.mjs, .codex-plugin/**, their tests)
1. Fix every code gap X1 found in these files, each with a test in the existing test files (`hooks/multi-codex-hook.test.mjs`, `scripts/mirror-shared-skills.test.mjs` or the nearest existing one). A fix that needs a file outside this territory is a finding in the evidence file, not an edit.
2. If X1 found no code gap, X2 is one commit: the evidence file plus the record, and the RESULT says "no code change needed" with the walk as proof.

## Acceptance
- Sealed suite green on the branch (`node scripts/run-tests.mjs`; only one suite at a time on this machine: if lane one's suite is running, wait, do not run two).
- Record `docs/work/wr-2026-09-25-codex-fresh-project.record.md` opened at the start with `Worktree:`, moved per event, `check-acceptance` then `accept --census <file>` if the census could read your session, else `--no-census "<the script's exact reason>"`.
- The RESULT to skills-fable carries: the walk's verdict per step (five lines), the number of code fixes and doc corrections, your turn count as Codex reports it, wall clock from this spec's timestamp, the reviewer host and model per territory, the census line or its reason, the branch and sha, a one-line changelog entry, and your predicted four numbers for the next Codex-led build.
- Push on green (Ben's rule of Sep 24). Merge waits for Ben's word. No trailers; the git identity is never set by an agent.
