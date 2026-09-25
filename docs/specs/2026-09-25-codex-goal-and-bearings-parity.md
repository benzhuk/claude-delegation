# Codex-led build: Codex sessions get the goal card and the bearings notice through their own hooks

Written by skills-fable, 2026-09-25 morning, for skills-a (Codex) leading a build through the plugin. This is the Codex-led half of the card's DONE line ("led once from Claude and once from Codex with a mixed handoff"): the lead is a Codex session, the reviews are handed across providers, acceptance goes through the shared work record and `check-acceptance`. The build itself closes a host-parity gap: today only Claude sessions see the goal card and the bearings due-notice.

Measure this build moves: work lost or stalled (a Codex lead today never sees the goal or a due bearings check), and the "any agent host" goal. Must not worsen the others: lead turns reported, Codex mid-tier builds, high-tier reviews, no new mechanism.

Base: origin/build/census-complete-1 at 8cebeda (pending Ben's merge with build/loop-gates-1; do not wait for it). Branch `build/codex-parity-1`, one worktree per builder, never the main checkout.

## Findings at 8cebeda (verified by a scout, file:line)
- Claude: `hooks/hooks.json:8-13,20-25,66-71` wires `hooks/delegation-reminder.js` to SessionStart, UserPromptSubmit and PostToolBatch; it renders the card via `scripts/goal-card.mjs` (`:304-323`) and the bearings notice via `skills/bearings/scripts/bearings-state.mjs` `check()` (`:332-347`), emitting `additionalContext` always and `systemMessage` at SessionStart only (`:396-407`, `:445-449`).
- Codex: `hooks/codex-hooks.json:2-6` wires SessionStart, UserPromptSubmit, PostToolUse, Stop and Interrupt to `hooks/multi-codex-hook.mjs`, whose own header (`:6-8`) states both channels exist on Codex: `hookSpecificOutput.additionalContext` reaches the model and `systemMessage` reaches Ben in the transcript. The hook does inbox and continuation delivery only (`:90-155`); it never imports goal-card or bearings-state. Children are already excluded by `isConfirmedCodexChild` (`:88`).
- `skills/bearings/SKILL.md:56` declares Codex cadence unsupported "until a verified host integration can identify child work and invoke this same callable check". `bearings-state.mjs` and `goal-card.mjs` contain no host-specific code; the receipt store `~/.agents/ws/bearings/<sha256 of checkout>.json` is shared state.
- Real Codex hook execution on this machine is receipted in `docs/work/evidence/windows-installed-codex-hooks.md:1,3`.
- End-to-end test harness to extend: `hooks/multi-codex-hook.test.mjs` (scratch `CODEX_HOME`, `runCodexHook` called directly).

## Territory P1: the Codex hook (hooks/multi-codex-hook.mjs, hooks/multi-codex-hook.test.mjs)
1. For a confirmed lead (not a child), on SessionStart and UserPromptSubmit, append to `additionalContext` exactly what the Claude hook injects: the rendered goal card from `scripts/goal-card.mjs` for the checkout in `cwd`, and the bearings notice from `bearings-state.mjs` `check()` when due or unknown. Same kill switches as the Claude side (`ws-off`, `ws-off-goal-card`, `ws-off-bearings` under `$AGENTS_HOME`, fail open, never block).
2. On SessionStart only, when bearings is due, also set `systemMessage` with the same one-line notice the Claude hook uses, so Ben sees it in the pane. No `systemMessage` on any other event (the Claude side's precedent at `delegation-reminder.js:448`).
3. No PostToolUse reinjection and no Stop behaviour change: Codex cadence beyond session start and prompt stays explicitly unsupported, stated in the skill text (P3), not silently approximated.
4. Reuse: call the same exported functions the Claude hook calls; if `delegation-reminder.js` has them inline, lift them into one shared module both hooks import (`hooks/lib/` or next to the scripts), so the card and notice cannot drift between hosts. No second renderer.
5. Tests in `multi-codex-hook.test.mjs` with a scratch `CODEX_HOME` and a scratch checkout carrying a card: lead SessionStart gets card plus notice plus `systemMessage`; UserPromptSubmit gets card plus notice, no `systemMessage`; a child gets nothing; each kill switch removes its part; a missing or invalid card fails open with the same rejection text the Claude hook gives; PostToolUse output unchanged.

## Territory P2: the census reads a Codex lead (scripts/build-census.mjs, its fixtures and test, docs/census.md)
1. The census must count a Codex lead session the way it counts a Claude one, or say it cannot. Find where a Codex session's transcript and per-turn token usage live on this machine (the plugin's Codex evidence docs and `hooks/multi-codex-hook.mjs` know the session id and `CODEX_HOME`; the Codex CLI writes session files under `$CODEX_HOME/sessions/` or similar; verify, do not assume). If usage per turn is available, add a reader for it and `leadTurns` by the same definition; if it is not, the script prints `leadHost: codex, leadTokens: unsupported (<reason>)` and the record shows it. Either outcome is acceptable; a guess is not.
2. Fixture and test for whichever outcome, plus one sentence in docs/census.md.

## Territory P3: docs (skills/bearings/SKILL.md, docs/native-use.md, README changelog)
1. `skills/bearings/SKILL.md:56` says what Codex now gets (due-notice at session start and at each prompt, through the shared check) and what stays unsupported (child-work detection and any cadence beyond that).
2. `docs/native-use.md` still documents 0.20.4; bring it to the current install route for Claude and Codex on a fresh project (what the 0.20.6 four-host rollout actually ran, from `docs/work/evidence/four-host-0206-and-live-pickup.md`), including the goal card and bearings for a Codex session.
3. Changelog entry under the next patch version, no version bump.

## The mixed handoff (this is part of the test)
- You lead. Builders are Codex mid-tier agents from `~/.codex/agents/` (or the plugin's mirrored roles). Each territory's review is a high-tier review by a Claude session: send skills-o an ASK per territory with the worktree path, the diff range and an attack brief; skills-o answers with a RESULT and a findings file. If skills-o does not ACK within your own pacing rule, a Codex high-tier reviewer (GPT-6-Astra class) may review instead, and the record says which host reviewed each territory.
- Acceptance through the shared record: `docs/work/wr-2026-09-25-codex-parity.record.md` with `Worktree:`, `check-acceptance` then `accept` with `--census` if P2 makes a Codex census possible, else `--no-census "<reason>"`.
- The RESULT to skills-fable carries: your turn count as your host reports it, wall clock from this spec's timestamp, rounds per territory, which host reviewed what, and the census or its stated reason.

## Not in scope
No new hooks or events, no scheduler, no Notion writes, no install, no release commit, no merge, nothing under skills/decisions/. No trailers; the git identity is never set by an agent. Push on green (Ben's rule of Sep 24); merge waits for Ben's word.
