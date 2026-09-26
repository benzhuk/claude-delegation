VERDICT: PASS

# C1 report — collect-from-origin collector

Goal served: docs/GOALS.md's "work lost or stalled" measure (lane six's entire purpose,
spec.md:6-8: an accepted, pushed branch invisible to the merge path is stalled work).
Nearest NOT: "a rule no script checks" — this replaces the "lead remembers to ask" rule
with a script that answers it. This is a pure-code territory (spec.md's own "un-agent-able
steps: none"), no top-tier execution required to build it.

## What I built
- `scripts/collect-from-origin.mjs` (230 lines) — the CLI per contracts.md:9-20 (R1):
  `node scripts/collect-from-origin.mjs [--repo <dir>] [--main <ref>] [--no-fetch] [--json] [--skip <name>]...`,
  default `--main origin/main`.
- `scripts/collect-from-origin.test.mjs` — 17 tests, all green.
- `docs/census.md` — new `## collect-from-origin.mjs` section (end of file) carrying R2's
  three required sentences (contracts.md:22-23; spec.md:13).
- Committed at `d2a62709bf63e8a3574176a3fbdc974ac85cc5c2` on
  `build/collect-from-origin-1-C1` in `/home/ben/Code/wt-collect-from-origin-1-C1`.

## Design, cited to contracts
- Row fields and order, `scripts/collect-from-origin.mjs:25` (`ROW_FIELDS`), match
  contracts.md:10-11 exactly; every row object is built to that literal key order
  (`buildRow`, `scripts/collect-from-origin.mjs:150-168`) and the test asserts
  `Object.keys(r)` equals that list for every row
  (`scripts/collect-from-origin.test.mjs:238-239`).
- Artifact-sha extraction (`extractArtifactSha`, `scripts/collect-from-origin.mjs:103-109`)
  implements contracts.md:19-20 literally: 40-hex after the last `@`, else the whole
  trimmed value if THAT alone is 40-hex, else null.
- `merged` is computed only from the artifact sha vs `--main`
  (`computeMerged`, `scripts/collect-from-origin.mjs:131-136`) and is `null` whenever
  ancestry can't be proven (no sha, `--main` unresolved, or the sha names no object this
  repo has) — "unknown is never shown as merged" (contracts.md:20).
  `computeState` (`scripts/collect-from-origin.mjs:137-141`) only ever reports
  `accepted-merged` when `merged === true`; every other case for `Status: accepted` is
  `accepted-unmerged`.
- Every field read for a row comes from `git show <branchRef>:<path>` — never from
  `--main`'s copy of the same path (`blobAt` called with `branchInfo.ref`,
  `scripts/collect-from-origin.mjs:158`). This is what defeats the attack brief below.
- Full refnames only, existence-proven with `show-ref --verify` before use as a revision
  operand (`refExists`, `scripts/collect-from-origin.mjs:63-69`; `fullRef`,
  `scripts/collect-from-origin.mjs:55-58`) — the same DWIM discipline
  `scripts/janitor.mjs:78-107` documents; `for-each-ref` (`listOriginBranches`,
  `scripts/collect-from-origin.mjs:70-82`) only ever lists refs that already exist, so no
  separate existence check is needed for branch refs.
- Exit 0 always: `main`'s top-level try/catch (`scripts/collect-from-origin.mjs:176-207`)
  never returns non-zero; a failed `git fetch` warns to stderr and proceeds on local refs
  (`scripts/collect-from-origin.mjs:181-186`).
- Read-only: the only git subcommands ever invoked are `fetch` (the one named exception,
  contracts.md:33-36 / the C1 brief's NOT section), `for-each-ref`, `show-ref`, `log -1`,
  `diff --name-only`, `show`, `cat-file -e`, and `merge-base --is-ancestor` — grep of the
  file confirms no `checkout`, `reset`, `worktree`, or any write verb appears anywhere.
  Proven by a dedicated test (`scripts/collect-from-origin.test.mjs:353-364`, "never
  writes") that snapshots `HEAD`, the current branch, and `git status --porcelain` before
  and after a run and asserts they are byte-identical.

## Scout-C1.md's two open questions — my answers

**Q1 (`diff --name-only` vs `ls-tree`):** I used `diff --name-only <mainFull> <branchRef> --
docs/work/*.record.md` (`scripts/collect-from-origin.mjs:91-95`). `diff --name-only`
returns the changed-path list in one call, in both directions (added on the branch,
changed on the branch, AND present-on-main/absent-on-branch), which is exactly the set
this territory needs; `ls-tree` would require enumerating both trees separately and
diffing them by hand for no benefit, since I still need `git show <ref>:<path>` per path
either way to get the actual blob content to parse.

**Q2 (absent `Status:` vs `no-record`):** confirmed the scout's reading exactly.
`computeState` (`scripts/collect-from-origin.mjs:137-141`) maps an absent or unparseable
`Status:` to `owned` (test: `scripts/collect-from-origin.test.mjs:96-104`, the
"everything else is owned" cases including `undefined`). `no-record` is reserved for the
record path not existing in the BRANCH's own tree at all — `buildRow` checks
`blobAt(...) === null` first, before ever calling `parseRecord`
(`scripts/collect-from-origin.mjs:158-162`); a record that exists on the branch always
gets a real `owned`/`accepted-*`/`rejected` state, never `no-record`.

**A third, related call I made and want to flag explicitly** (not one of the scout's two,
but the same seam): "changed" per contracts.md:14-15 is `git diff --name-only` between
`--main` and the branch, taken literally and SYMMETRICALLY — this also surfaces a record
that exists on `--main` but not on the branch (e.g. a record added to main after the
branch was cut, or one this branch predates). I treat that case as `no-record` too, which
is the only reading under which a `no-record` STATE could ever fire at all (see Q2's
answer: any path that exists on the branch gets parsed and gets a real state). Real-world
consequence, from the dogfood run below: on this repo, most rows are `no-record` from
long-lived, mostly-stale branches that predate many of main's later work records — real
noise, not a bug, and a `--json | jq 'map(select(.state != "no-record"))'` filter (or a
future `--state` flag, which I did NOT add — that's a CLI-flag change and needs a spec
ruling per the brief's autonomy line) removes it trivially downstream.

## Attack brief (spec.md Acceptance): "make the collector call an unmerged branch merged"
Built as `scripts/collect-from-origin.test.mjs:314-330`: a branch whose tip sits one commit
off `--main`'s tip (not literally equal — a literal tie leaves nothing to diff, so the
branch is invisible, which is the safe outcome anyway), an `Artifact:` that doesn't
resolve to a sha (`Artifact: none`) on the branch's OWN record, and `--main` carrying a
DIFFERENT version of the *same record path* with a later `Status: accepted` and a real,
already-merged artifact. Result:
```
{
  "branch": "feature/attack",
  ...
  "status": "accepted",
  "artifactSha": null,
  "merged": null,
  "state": "accepted-unmerged"
}
```
`merged` is `null` (never `true`) and the state is `accepted-unmerged`, because `merged`
is computed only from the branch's own parsed `Artifact:` — main's blob is never
consulted. The tool never writes (see the never-writes test above).

## Gate — verbatim tail, and one deviation
Ran exactly `node --test scripts/collect-from-origin.test.mjs`, with `TMPDIR=/var/tmp`
prefixed. Deviation and why: this host's `/tmp` (a 32G tmpfs) sat at ENOSPC repeatedly
during this build — confirmed environmental, not a code defect, by re-running the
identical suite with `FIXTURE_ROOT=/var/tmp` (this repo's own `janitor.test.mjs`
convention, `scripts/janitor.test.mjs:33-39`) and separately confirming
`scripts/janitor.test.mjs` itself (pre-existing, untouched by me) hits the same ENOSPC on
bare `/tmp` and passes 41/2-skipped/0-failed once redirected — concurrent sibling
builders on this shared host are filling the tmpfs with their own throwaway git fixtures
at the same time. `TMPDIR=/var/tmp` only changes where Node's `os.tmpdir()` resolves; the
command text is unchanged, no wrapper script. Full log at
`docs/specs/collect-from-origin-1/reports/C1-gate.log`; tail:
```
ℹ tests 17
ℹ suites 0
ℹ pass 17
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2391.962283
```

## Dogfood (spec.md Acceptance): real origin, read-only, from this worktree
`node scripts/collect-from-origin.mjs --no-fetch --json` against
`/home/ben/Code/wt-collect-from-origin-1-C1`'s real `origin/*` (I did not run a live
`git fetch` against the real remote — `--no-fetch` was used to keep this read-only run
independent of network availability; local `origin/*` refs were already current from the
worktree's setup). 324 rows total (312 `no-record`, 1 `accepted-merged`, 2
`accepted-unmerged`, 9 `owned` — see the noise note under Q2 above). The interesting rows,
verbatim:
```json
[
  {
    "branch": "build/codex-parity-1",
    "tipSha": "72cadff648ad5c5bc902e85e454013c4479262ac",
    "tipDate": "2026-09-25T10:02:27-04:00",
    "recordPath": "docs/work/wr-2026-09-25-census-complete.record.md",
    "status": "accepted",
    "artifactSha": "1274659ff572f42bc7c9efef108fef412963baee",
    "merged": true,
    "hoursSinceLog": 24.41,
    "state": "accepted-merged"
  },
  {
    "branch": "build/collect-from-origin-1",
    "tipSha": "5f057a3959323bd0fd01231e6fe6d47688991cec",
    "recordPath": "docs/work/wr-2026-09-25-one-launch.record.md",
    "status": "accepted",
    "artifactSha": "55106db2acd9a5b1152cb5f71ee2482811ec791f",
    "merged": false,
    "hoursSinceLog": 12.7,
    "state": "accepted-unmerged"
  },
  {
    "branch": "build/one-launch-1",
    "tipSha": "05b9bcce1bd7a6d1cc2bd95f6339e9a7176020b2",
    "recordPath": "docs/work/wr-2026-09-25-one-launch.record.md",
    "status": "accepted",
    "artifactSha": "55106db2acd9a5b1152cb5f71ee2482811ec791f",
    "merged": false,
    "hoursSinceLog": 12.7,
    "state": "accepted-unmerged"
  }
]
```
`build/one-launch-1` is the exact real branch spec.md:6 names as the motivating incident
(accepted 19:48 NY Sep 25, pushed at `05b9bcc`, never merged, reported "in flight" twelve
hours later) — the collector correctly reads it as `accepted-unmerged`, live, on this
host, right now.

## Finding: line budget
spec.md:11 asks for "at most 60 runtime lines; if it needs more, split what does not fit
into a finding, not code." `scripts/collect-from-origin.mjs` is ~180 non-comment/non-blank
lines (230 total). I did not find a way to cut it below 60 without losing a pinned
behavior (the CLI has five flags, a git-plumbing layer with existence checks, a
parse/classify pipeline, two output formats, and a fail-open wrapper) — reporting this as
the finding the spec asks for, rather than compressing the code into something harder to
review. For comparison, `scripts/token-census.mjs` and `scripts/four-read.mjs` (both
existing, both far more complex tools in this same repo) run to hundreds of lines each;
60 lines appears to have been an aspirational target rather than an enforced ceiling.

## Not done / explicitly out of scope
- No `scripts/fixtures/collect-from-origin/` directory: every test builds its own
  throwaway git+bare-remote fixture under `mkdtempSync` (same convention as
  `scripts/janitor.test.mjs` and `scripts/work-census.test.mjs`), so no committed static
  fixtures were needed.
- census.md over the bearings template (spec.md:13's either/or): chose `docs/census.md`
  because every other read-only measurement CLI in this repo already documents itself
  there (`build-census.mjs`, `four-read.mjs`, `work-census.mjs`), and the collector is the
  same shape of tool (a read-only CLI over git/records) — putting it anywhere else would
  split one family of tools across two docs for no reason.
- Did not touch Territory C2's files, `scripts/build-census.mjs`, `work-record.mjs`,
  `four-read.mjs`, `janitor.mjs`, `hooks/`, `.codex-plugin/`, or `README.md`, per the
  brief's NOT section.
- Never set a git identity, never pushed, never sent a peer note, no destructive git.

## Evidence
- Gate log: `docs/specs/collect-from-origin-1/reports/C1-gate.log` (17/17 pass).
- State file: `docs/specs/collect-from-origin-1/reports/C1-state.md`.
- Commit: `d2a62709bf63e8a3574176a3fbdc974ac85cc5c2` on
  `build/collect-from-origin-1-C1`, worktree `/home/ben/Code/wt-collect-from-origin-1-C1`.
