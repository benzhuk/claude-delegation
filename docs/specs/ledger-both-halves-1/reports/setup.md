VERDICT: PASS

# Setup report — ledger-both-halves-1

## Territory worktree

Ran, from `/home/ben/Code/wt-lbh` (already on `build/ledger-both-halves-1` at the base sha):

```
git worktree add /home/ben/Code/wt-ledger-both-halves-1-L1 -b build/ledger-both-halves-1-L1 026a7a0717964a5bcf3d70a93240f9ff1cfa8004
git -C /home/ben/Code/wt-ledger-both-halves-1-L1 rev-parse HEAD
```

Verbatim `rev-parse HEAD` output (this territory's headSha): `026a7a0717964a5bcf3d70a93240f9ff1cfa8004`
— identical to the given base sha, confirming the worktree was cut exactly there.

The integration worktree named in the task, `/home/ben/Code/wt-lbh` on branch
`build/ledger-both-halves-1`, already existed at this exact base sha before I started (verified with
`git status`, `git worktree list`, and `git rev-parse HEAD` — clean, up to date with
`origin/build/ledger-both-halves-1`); I did not need to create or modify it.

## Scout

Read the base tree at the L1 worktree (`skills/multi/scripts/note-send.mjs`, `transport.mjs`,
`envelope.mjs`, `note-flush.mjs`, `SKILL.md`, `references/envelope.md`, and the existing
`note-send.test.mjs`/`hooks.test.mjs`) per `skills/team-build/references/scout-brief.md`'s four
sections, and wrote
`/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/briefs/scout-L1.md`.

Notable findings folded into the briefs below:
- The exact two SKILL.md locations spec item 6 refers to (the "cross-host paragraph" at :306-308,
  and the "lane thirteen overdue-cross-host sentence" at :140-143) — found by grep, quoted
  verbatim in the scout file and in L1's and the reviewer's briefs.
- An existing, unrelated `ORCA_SENDER_HOST` env var (note-send.mjs:236, pinned by test M4 at
  note-send.test.mjs:240) that is a naming-collision risk against this spec's new sender-host
  concept — flagged so the builder doesn't repurpose or collide with it.
- A landmine: async `execFile` (unlike its sync form) has no `input:` option for piping stdin to a
  child — the builder needs `.child.stdin` on the promisified return, or an equivalent spawn.
- A genuine open question the spec/contracts do not fully resolve: `note-flush.mjs:1512`
  (`runOverdueAsks`) calls `runNoteSend` directly for its own new nudge sends — not a retry — yet
  contracts R3 lists "note-flush" among the paths that must never mirror, and that file is outside
  L1's territory to edit. I did not resolve this myself (per the scout-brief's own ground rule: surface,
  don't resolve); I gave L1 a specific instructed reasoning path (implement with no special-casing,
  since a nudge-sending process has no SSH_CONNECTION/--sender-host in practice) and required L1 to
  state that reasoning explicitly in its report, gave the reviewer an explicit attack-brief item to
  verify it independently, and gave the seam reviewer a dedicated check (point 2) to construct a
  counter-scenario if one exists. This is a judgment call under real ambiguity, not a plain
  transcription of the spec pack — flagging it here for visibility, and named the same way in all three
  briefs it touches.

## Briefs written

All four from the spec pack (spec.md, contracts.md, scout-L1.md) using
`docs/mandate-template.md`'s shape:

- `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/briefs/L1.md` — builder mandate.
- `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/briefs/reviewer.md` — independent
  reviewer, twelve-point attack brief (spec's own three attack scenarios plus contracts' Facts,
  each reproduced and made concrete against this tree).
- `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/briefs/integrator.md` — full-suite gate
  `node scripts/run-tests.mjs`, zero failures on Linux, known `delegation-reminder` flake rerun
  alone, per contracts R4.
- `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/briefs/seam.md` — scoped to
  `note-flush.mjs`'s real caller of `runNoteSend` (the one genuine seam in a single-territory
  build) and to whether the two SKILL.md prose edits match the merged code.

## Not done / out of scope for this setup job

- Did not spawn or run any builder/reviewer/integrator/seam agent — this job was setup only.
- Did not open the `docs/work/` record — that's the next step for whoever runs the build, per
  team-build's own setup sequence (step 7, after scouting).
- Did not touch `docs/work/`, push anything, or set/switch any git identity.

## Verification

- `git worktree list` on `/home/ben/Code/wt-lbh` shows both worktrees at
  `026a7a0` on their respective branches.
- All five brief files (`L1.md`, `reviewer.md`, `integrator.md`, `seam.md`, `scout-L1.md`) exist
  under `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/briefs/`.
