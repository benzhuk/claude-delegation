# Lane three: fresh-project usability, a Claude operator installs the plugin from the docs alone and drives one tiny build

Written by skills-fable, 2026-09-25 midday, for skills-h (a NEW Claude pane on Hetzner, zhuk-vps32, Opus) leading from a fresh session. Ben's tick of Sep 25: four lanes at once, disjoint territories, push on green, one merge tick per day. This lane answers Ben's "more usable components sooner" most directly: the plugin is usable when a person who is not us can start a project with it from the docs and reach an accepted build.

Measure this lane moves: work lost or stalled (every step the docs leave out is a stall for the next project) and hours ask to accepted on a fresh project. Must not worsen: lead turns, Sonnet builds, Opus reviews, no new mechanism.

Base: origin/main once it carries 0.20.9 (lands about 12:00 NYC Sep 25; if main is still 28a222c, base on origin/build/integrate-0925 at 931588a). Branch `build/fresh-walk-1`, one worktree per builder, never the main checkout. Hetzner is Claude-only by Ben's choice of Sep 24: no Codex command on this host.

## Rules that bind every lane this week
- Fresh lead session; the record carries your session id in `Lead-session:` if lane one's field exists on your base, else as an `Evidence:` line `Lead-session (pre-field): <id>`.
- You wake skills-fable at most three times: ACK at start, one RESULT at the end, BLOCKED if stuck. Never an ACK's content under the ASK kind. Reviews are Opus subagents you spawn, never notes.
- Your fan-outs complete as one notification: run parallel builders and reviewers through the existing `skills/team-build/references/build-loop-workflow.js` (see the team-build skill, "Running the loop from an Opus pane") or one Workflow of your own, not one Agent call per builder.
- No README.md changelog edit (written once at integration; your RESULT carries the one-line entry). Nothing under scripts/build-census.mjs (frozen), scripts/work-record.mjs (lane one), skills/team-build/ (lane four), hooks/multi-codex-hook.mjs, hooks/codex-hooks.json, scripts/mirror-shared-skills.mjs, .codex-plugin/ (lane two), skills/decisions/, skills/bearings/.

## Territory W1: the walk (evidence, then the doc)
In a throwaway git repo on this host outside `~/Code` (for example `~/tmp/fresh-walk-<date>`), as a Claude operator who has only `docs/native-use.md` and the README: install the plugin the way the docs say, then:
1. Goal: write a `docs/GOALS.md` card by following the docs (does any doc say how? if not, that is finding one), open a session in that repo and confirm the goal card is injected; confirm the rejection text for an invalid card.
2. Bearings: `bearings-state.mjs check` on the new checkout says unknown; the notice appears; run the bearings skill once as documented and record whether a first-time user can complete it without a Notion page (no Notion writes in this lane: if the skill cannot finish without one, record that as the finding and stop that step).
3. Multi: bind the pane with `note-inbox --me skills-h --ack`; send yourself a note from a scratch session on this host (`claude -p` in another directory with `--from scratch-h`) and confirm the hooks deliver it. Do not wake skills-fable for this.
4. The tiny build: a two-file change in the throwaway repo (a script and its test) run through the plugin as the docs describe: spec on disk, record opened, one Sonnet builder, one Opus reviewer, integrator, census at accept, `accept --census`. Time each step. This is the "hours ask to accepted on a fresh project" number; report it.
5. Janitor: run the janitor skill at the end as documented and record what it reports.
Every gap becomes a finding with the doc or code file:line, severity, and the sentence that would have prevented it. Evidence file: `docs/work/evidence/2026-09-25-fresh-project-walk.md`, with a step table (step, command, result, minutes).
Then fix the docs: `docs/native-use.md` (all sections; fold in the sentences the findings call for; keep the Codex parts as they are unless a finding is host-neutral) and the README's install and quickstart sections (not the changelog). A doc fix is complete when a second scratch run of the failing step, following only the new text, passes; record that re-run in the evidence file.

## Territory W2: small code fixes the walk needs (only if W1 finds them)
Allowed files: `skills/multi/SKILL.md`, `skills/delegate/SKILL.md`, `skills/janitor/SKILL.md`, `skills/continue/SKILL.md`, `hooks/delegation-reminder.js`, `scripts/goal-card.mjs`, and their tests. Each fix under 40 lines with a test; anything larger, or in a file another lane owns, is a finding in the evidence file. If W1 finds nothing that needs code, W2 does not exist and the RESULT says so.

## Acceptance
- Sealed suite green on the branch on this host (`node scripts/run-tests.mjs`).
- Record `docs/work/wr-2026-09-25-fresh-project-walk.record.md` opened at the start with `Worktree:`, moved per event, Opus review per territory with `JUDGMENT:` lines, `check-acceptance`, `accept --census <file>` with the census of your own session at accept time.
- The RESULT to skills-fable carries: the step table's minutes and the total hours ask to accepted for the tiny build, the count of findings by severity and how many are fixed in docs, in code, or handed on, your turn count from the census (`leadTurns`), wall clock from this spec's timestamp, the branch and sha, a one-line changelog entry, and your predicted four numbers for the next fresh-project walk.
- Push on green. Merge waits for Ben's word. No trailers; the git identity is never set by an agent.
