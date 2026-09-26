# one-launch-1 — pinned contracts (lead's rulings on the spec)

Spec: `docs/specs/2026-09-25-build-loop-workflow.md` (lane four). This file pins what the
spec leaves open. Where this file and the spec disagree, this file wins (lead's ruling).
Base sha for every worktree: `fbd7cf6` (origin/main, release 0.20.9).

## R1. What a Workflow script can and cannot do

A Workflow script has no shell, no filesystem and no clock: it can only call `agent()`,
`parallel()`, `pipeline()`, `phase()`, `log()` and read `args`. So every git, file or
CLI step inside the launch is done by an AGENT the script spawns, and the script checks
what that agent returns (schema + sha shape), never trusts prose.

## R2. The args object (new shape, backward compatible)

```
{
  specPath:            string    required
  baseSha:             string    required (40-hex preferred; 7+ hex accepted)
  startedAt:           string    required ISO timestamp (the script has no clock)
  maxRounds?:          number    default 3; also caps seam fix rounds
  territories: [{
    id:          string          required
    gate?:       string          territory-scoped gate command; setup writes one if absent
    briefPath?:  string          \
    worktree?:   string           > all three present = "given" territory (old path)
    branch?:     string          /  all three absent  = "setup" territory (new path)
    startFrom?:  { sha, verdict: 'APPROVE'|'NEEDS_FIXES', findingsPath? }   (R6)
  }]
  reviewerBriefPath?:  string    required when every territory is "given"; setup writes it otherwise
  integratorBriefPath?:string    same rule
  // new, all optional; when integrationWorktree is absent the post-integrate stages
  // (seam, accept-prep) are skipped and the return carries seam: null, acceptance: null —
  // this is the backward-compatible old behaviour, pinned by the test.
  integrationWorktree?: string   absolute path of the integration worktree
  integrationBranch?:   string   branch checked out there (e.g. build/one-launch-1)
  integrationGate?:     string   full-suite gate (e.g. `node scripts/run-tests.mjs`)
  worktreeRoot?:        string   parent dir for setup-created worktrees; default: the
                                 parent directory of integrationWorktree
  leadSession?:         string   path to the lead's session .jsonl, or its session id (R8)
  recordPath?:          string   repo-relative work record the lead opened pre-launch
  censusMarker?:        string   text first seen in this build's opening message
  seam?:                boolean  force (true) or suppress (false) the seam stage; default
                                 = territories.length >= 2
}
```

Mixed territories (some given, some setup) are a launch error: the script returns at once
with `blockers: [{ id: '*', reason: 'mixed-territory-modes' }]` and spawns nothing.
Missing `specPath`/`baseSha`/`startedAt` likewise return `reason: 'missing-args'`.

## R3. Setup stage (phase `Setup`, only when territories are "setup")

Deterministic names computed IN THE SCRIPT (pure JS, pinned by the test), never chosen by
the agent:
- branch   = `${integrationBranch}-${id}`   (fallback `build/${slug}-${id}` where slug is
             the spec file's basename without extension)
- worktree = `${worktreeRoot}/wt-${slug}-${id}`
- briefPath = `${dirname(specPath)}/briefs/${id}.md`, reviewer brief
  `${dirname(specPath)}/briefs/reviewer.md`, integrator brief `.../integrator.md`, seam
  brief `.../seam.md`
where slug = the integration branch's last path segment when given, else the spec basename.

ONE agent: `agentType: 'delegation:runner'`, `model: 'sonnet'`, label `setup`. Its job, in
one pass: (a) `git worktree add <worktree> -b <branch> <baseSha>` per territory and
`git -C <worktree> rev-parse HEAD`; (b) scout every territory (per
`skills/team-build/references/scout-brief.md`) writing `briefs/scout-<id>.md`; (c) write
each territory brief from the spec pack (spec + contracts + scout addendum by path, the
mandate template at `docs/mandate-template.md`), plus reviewer, integrator and seam briefs.
Schema SETUP:
```
{ territories: [{ id, worktree, branch, briefPath, gate, headSha }],
  reviewerBriefPath, integratorBriefPath, seamBriefPath, reportPath }
```
The script then checks, per territory: returned worktree/branch/briefPath equal the
computed ones and `sameSha(headSha, baseSha)`. Any mismatch, or the agent dying twice →
return immediately with `blockers: [{ id, reason: 'setup-failed' }]`, nothing built.

## R4. Seam stage (phase `Seam`, after Integrate)

Runs when `integrationWorktree` is given, the integrator returned PASS, and the seam
default (R2) is true. One `delegation:reviewer`, `model: 'opus'`, label `seam:r<n>`,
prompt carries the seam brief path (setup's, else `reviewerBriefPath`), the integration
worktree, and every approved territory id; it runs `git rev-parse HEAD` itself. Schema is
REVIEW. `NEEDS_FIXES` → one `delegation:builder` (sonnet, label `seam-fix:r<n>`) on the
INTEGRATION worktree with the seam findings path and `integrationGate` as its gate, then a
delta seam re-review (prior findings path + commit range, same rule as reviewPrompt),
up to `maxRounds` seam rounds. Seam sha checked with `sameSha` like territory reviews.
Return field:
```
seam: { verdict: 'APPROVE'|'NEEDS_FIXES'|'BLOCKED'|'SKIPPED', sha, rounds, findingsPath, blocker }
      | null   (null only when integrationWorktree is absent)
```
Blockers reuse the territory vocabulary with a `seam` id: `agent-died`,
`review-sha-mismatch`, `rounds-exhausted`, `build-failed`, `builder-blocked`.

## R5. Accept-prep stage (phase `Accept`, last)

Runs when `integrationWorktree` and `recordPath` are given and seam is APPROVE or SKIPPED
(and integrator PASS). One `delegation:runner`, `model: 'sonnet'`, label `accept-prep`.
Its job:
1. `build-census.mjs --lead <leadSession .jsonl> [--marker <censusMarker>] --out
   docs/work/evidence/<work-id>-census.md` (plugin `scripts/`, documented CLI only).
   If `leadSession` is absent or the census errors, it writes nothing and reports
   `censusPath: null` with the reason — the lead then accepts with `--no-census`.
2. Copy the deciding reports (last territory APPROVE per territory, last seam APPROVE)
   to `docs/work/evidence/<work-id>-<lane>.md` with original bytes.
3. Record lines — work-record.mjs has only `check-acceptance` and `accept`, and
   `scripts/` is frozen this week, so there is no append CLI. RULING: the runner writes
   exactly these header lines of `recordPath` and no others: `Status: reviewed`,
   `Artifact: <integrationBranch>@<40-hex head>`, `Worktree: <integrationBranch>`,
   `Evidence:` (the copied paths), one `Log: <iso> reviewed <owner> seam r<n> APPROVE
   <sha>` line, before the first blank line. It never writes `accepted` and never runs
   `accept`.
4. `work-record.mjs check-acceptance --record <recordPath> --repo <integrationWorktree>
   --delivery-ref <integrationBranch>` (read-only), capturing exit code and output.
Schema ACCEPT_PREP:
```
{ censusPath: string|null, censusNote: string, integrationHead: string,
  evidencePaths: string[], checkAcceptance: { exitCode: number, verdict: 'PASS'|'FAIL', output: string },
  reportPath: string }
```
Return field: `acceptance: ACCEPT_PREP | { skipped: <reason> } | null` (null only when
integrationWorktree is absent). The script NEVER calls `accept`; acceptance is the lead's
one judgment on the return.

## R6. startFrom (resume a territory from a prior run)

`territories[].startFrom = { sha, verdict, findingsPath? }` lets a lead continue a build a
previous launch left mid-loop without re-building approved work:
- `verdict: 'APPROVE'` → no build, no review; the territory row returns `{ verdict:
  'APPROVE', sha, rounds: 0, findingsPath, reportPath: null, blocker: null }` and goes
  straight to Integrate.
- `verdict: 'NEEDS_FIXES'` → the first agent is a fix-round builder (round 2) against
  `findingsPath`, then the normal review/fix loop.
Only valid on "given" territories.

## R7. Return object (superset of today's)

```
{ territories, integrator, seam, acceptance, setup, blockers }
```
`setup` is `{ reportPath, reviewerBriefPath, integratorBriefPath, seamBriefPath }` or null.
Old callers who read only `{ territories, integrator, blockers }` see identical values.

## R8. Lead session

The script cannot learn its lead's session id. The pane passes `leadSession`: the
SessionStart / PostToolUse hook context line `Host: claude; session: <uuid>` names the id;
the file is `~/.claude/projects/<cwd-slug>/<uuid>.jsonl`. The accept-prep runner resolves
an id to that path (it has a shell) and passes the `.jsonl` to `build-census.mjs`.

## R9. Wake discipline

The script sends no notes (no `note-send` in any prompt it renders except as a
prohibition). Every prompt the script renders carries "never send peer notes". The lead's
only outward message after launch is the RESULT after `accept`.

## R10. Codex

Codex has no Workflow tool. The skill states: a Codex lead runs the manual sequence
(Setup through Ship by hand, same stages in the same order, same census definitions), and
its record says `Evidence: Codex-led, manual sequence (no Workflow tool)`. No emulation.

## Territory map

- L1: `skills/team-build/references/build-loop-workflow.js`, `build-loop-workflow.test.mjs`,
  `build-loop-args.example.json` (update to the new shape; may add
  `build-loop-args.legacy.example.json` for the given-worktree shape), `scout-brief.md`
  (only if the setup runner needs a line there). Nothing else.
- L2: `skills/team-build/SKILL.md`. Nothing else.
- Off-limits to both: `scripts/`, `hooks/`, `.codex-plugin/`, `docs/native-use.md`,
  `skills/decisions/`, `skills/bearings/`, `README.md`.
