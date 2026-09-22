# Pane setup — who launches what, and when

The coordinated package's pane model for a build that uses `team-build`'s loop and (if
approved) `delegate`'s ladder. Model tiers referenced here are `docs/model-tiers.md`'s
vocabulary; don't re-derive the tier table here.

## The panes

- **`<project>-fable`** — top tier (Claude Fable / GPT-6-Astra). Writes the spec, reads
  the high-tier red-team's report, renders the merge/ship verdict, and is the only pane
  that writes the decisions page (`delegation:decisions`). Never executes: no builds, no
  file edits outside the spec pack, no direct tool loops over code. Its tokens buy
  judgment, nothing else.
- **`<project>-o`** — an Opus orchestrator pane. Runs `team-build` end to end (Setup
  through Ship, `skills/team-build/SKILL.md`); launches the build-review-fix loop
  (`skills/team-build/references/build-loop-workflow.js`, that file's own new SKILL.md
  section) and, when approved for this build, the ladder
  (`skills/delegate/references/ladder-workflow.js`, `skills/delegate/SKILL.md`'s Ladder
  section). This is the only pane that spawns subagents for execution.
- **Subagents beneath `<project>-o`** — mid tier (Sonnet) writes code and runs tools:
  builders, the scout, the integrator, and any `delegate`-style research/audit fan-out.
  High tier (Opus) reviews: the spec red-team and every territory's independent reviewer.
  Fast tier (Haiku) does mindless bulk sweeps only (`docs/model-tiers.md`'s rule: fast
  tier never touches a number someone will act on) — it does not review, build, or judge.

## Who launches what, and when

1. `<project>-fable` writes the spec and territory map, gets a high-tier red-team read,
   rules on any open questions, and hands the spec pack path to `<project>-o`.
2. `<project>-o` runs `team-build`'s Setup: territory map, contract stubs at t0, the
   Scout step (one Sonnet agent, one file per territory,
   `skills/team-build/references/scout-brief.md`), work records opened, briefs written
   with the scout findings folded in.
3. `<project>-o` launches the build loop (Build → Review → Fix → Integrate, one call per
   territory in parallel, `parallel()` as the barrier) from its own pane — never from
   `<project>-fable`, never from a builder or Sonnet-tier pane.
4. `<project>-o` reads the loop's return (`{ territories, integrator, blockers }`),
   applies Ship (work-record transitions, evidence copies), and reports the merge-ready
   state back to `<project>-fable` for the actual ship decision.
5. If this build also uses the ladder for a bounded research/judge pass, `<project>-o`
   launches it the same way — its own pane, never a subordinate one. Both the ladder and
   the build loop are live as of 2026-09-22, each having had its first real run from an
   Opus orchestrator pane (`wf_4f009ac9-8aa` and `wf_a7f9c859-48a`); see
   `wr-2026-09-22-package-build-p5`.

## Registering a pane's peer-note inbox

The already-shipped `SessionStart` hook (`hooks/hooks.json` → `hooks/multi-inbox.js
SessionStart` → `registerMyInbox`) registers this pane's inbox automatically. The normal
way to give it something to register: name the session — `/rename <slug>` mid-session, or
`claude --name <slug>` at launch. Both write the same sidecar the hook now reads FIRST,
above `NOTE_SLUG` and any `panes.json` binding — so a mid-session `/rename` takes effect at
the very next hook event, even in a pane that was launched with `NOTE_SLUG` already set. It
never guesses a slug from a title. When none of the three resolve, nothing registers and
the pane never appears in `inboxes.json` — it misses peer notes until something sets one;
the `SessionStart` hook says so once, with the `/rename <slug>` fix.

The fallback, for when `/rename`/`--name` were not used: state the slug in the `--command`
string `orca terminal create` already accepts —

```
orca terminal create --worktree <wt> --title <slug> --command 'NOTE_SLUG=<slug> claude' --json
```

On a Windows pane, use the PowerShell assignment in place of the bash-style env prefix:

```
$env:NOTE_SLUG='<slug>'; claude
```

To confirm delivery actually reached this pane (rather than guessing from silence), read
`~/.agents/notes/flush.log`'s own line for the note's id — the two shapes to look for,
quoted exactly from `skills/multi/scripts/note-flush.mjs:483,756,831`:

- Delivered: `<stamp> delivered [<id>] -> <slug> — inbox (claude-socket)`
- Never registered: `<stamp> no-inbox [<id>] -> <slug> — no inbox registered on this
  machine (typing is off; set MULTI_ALLOW_TYPING=1 to nudge by keystroke)`

`scripts/wiring-check.mjs`'s `pane-note-slug` row (`scripts/required-wiring.default.json`)
reports whether `NOTE_SLUG` is set on this pane at the moment the check runs — always
`info`, never `missing`/`stale`. It only inspects `NOTE_SLUG`, so a pane named the new way
(via `/rename`/`--name`) may correctly show "not set" here while still being fully
registered; the row exists to make the silent-miss case visible for the env-only path, not
to flag a session-named pane as wrong.

## Notes between panes

`<project>-fable` and `<project>-o` are peers, not owner/subordinate — a note between
them (a question, a handed-off spec path, a blocker escalation) goes through the `multi`
skill, never Orca orchestration dispatch, even when one pane is "above" the other in this
diagram. Orchestration dispatch is for `<project>-o`'s own subordinates (builders,
reviewers, the integrator); `multi` is for talking to the fable pane.

## Measures, and where each is read from

- **Elapsed per work id** (`opened` → `accepted`, or `opened` → last `reviewed` when no
  `accepted` line exists yet, labeled `(to reviewed)`) — `scripts/work-census.mjs`,
  reading `docs/work/*.record.md`'s `Log:` lines.
- **Rounds per territory** (the `Rounds:` field when present, else a count of `owned` ->
  `delivered` transitions, file order) — `scripts/work-census.mjs`, same source.
- **Lead turns and wall clock per build** (turns total and windowed, turns/hour in the
  window, tokens by model for the lead and for each subagent, and the combined
  lead+subagent split) — `scripts/build-census.mjs`, reading the lead's own transcript
  plus each subagent's task-output directory. Its turn/token counts are de-duplicated per
  request id (Claude Code re-emits the same turn as multiple JSONL lines while a response
  streams); the mechanism lives in `scripts/build-census.mjs`'s own doc and test fixture,
  and is deliberately not restated here.
- **Recurrence of a labelled failure class** — read from the work records' own `Log:`
  notes and findings files across builds; no dedicated script computes this yet, so read
  it by grepping `docs/work/` and past reports rather than expecting a census tool to
  surface it automatically.
- **Workarounds past removal** — same source as above, same caveat: no dedicated script,
  read from `docs/work/` and past reports.

Run both census scripts from `<project>-o`'s pane once a build's Ship step completes
(`skills/team-build/SKILL.md`'s Ship section names the exact moment); the numbers go into
the merge ask `<project>-fable` puts on the decisions page, not into a pane's own
transcript alone.
