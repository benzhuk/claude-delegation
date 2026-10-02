# Work records (C1)

A work record is the single durable fact about one piece of admitted work: who owns it,
at which revision, with what evidence, and what happens next. It lives at
`docs/work/<work-id>.record.md` on the workstream's integration branch.

`docs/work/` is the **orchestrator's** territory. Only the orchestrator's own checkout
ever writes a record. Builders and reviewers keep their own state file
(`<report-dir>/<territory>-state.md`) and report to the path their brief gives them —
they never touch `docs/work/`. Ownership of a record returns to the orchestrator the
moment an agent reports, is stopped, or dies; that handoff is itself recorded as a
`Log:` line.

## Shape

Header lines first, one blank line, then free prose. Every header line is `Label:
value` and matches, with flags `m` and `i`:

```
^[ \t*+-]{0,20}<Label>:\**[ \t]{0,20}(.+)$
```

That is a `[ \t]`-only class with explicit `{0,20}` bounds — never `\s`, and never an
unbounded quantifier before the capture — the same shape the dispatch guard's regexes
use (`hooks/agent-dispatch-guard.mjs`) to stay ReDoS-safe. Values are right-trimmed of
`\r` and trailing whitespace before use.

## Fields

| Label | Required | Meaning |
|---|---|---|
| `Work:` | yes | `wr-<yyyy-mm-dd>-<slug>`, unique, lowercase, `[a-z0-9-]` |
| `Scope:` | yes | For Git-backed work, `<path>@<sha>` — the spec or brief and the commit it was read at; the path uses forward slashes, always. For non-code work, an attributable stable file or URI reference; record the reviewed snapshot, digest, or source/read time in the body. |
| `Owner:` | yes | `<slug>` or `none` |
| `Status:` | yes | one of `open`, `NEEDS BEN`, `NEEDS <peer slug>`, `FAILED`, `accepted`, `closed` (lane 73), or an older word still readable: `runnable`, `owned`, `delivered`, `rejected`, `reviewed`, `blocked`, `withdrawn` |
| `Now:` | conditional (see below) | `<one line> | To finish: <one line> | Est: <duration>`, the same line a progress report carries as line 2; where the work is, what must still happen, how much longer |
| `Authority:` | yes | what may happen without Ben, and what may not |
| `Artifact:` | yes | For Git-backed work, `<branch>@<sha>`; for non-code work, an attributable stable file or URI reference; or `none` before an artifact exists. |
| `Artifact-repo:` | no | an absolute path to a directory inside a git worktree of the repository that holds `Artifact:`, for cross-repo work only — see "Artifacts in another repository" below |
| `Evidence:` | yes | comma-separated report paths, or `none`; each path's first line must start `VERDICT:` |
| `Next:` | yes | the next action, or the blocker and its owner |
| `Opened:` | yes | ISO-8601 UTC |
| `Children:` | no | comma-separated child work ids |
| `Builder:` | no | model name |
| `Rounds:` | no | source of truth for round count |
| `Class:` | no | failure-class slug, bug fixes only |
| `WORKAROUND:` | no, repeatable | `<cause> / <blocked by> / <remove when>`; `remove when` is `by <yyyy-mm-dd>` or a worded condition |
| `Log:` | no, repeatable | `<ISO-8601 UTC> <status> <owner> [<note>]`, append-only, one per status or owner change |
| `Superseded-by:` | no | the work id of the record that made this one moot; written by `withdraw` (below) |
| `Scratch:` | conditional (see below) | an absolute directory: `<scratch root>/<lead session id>/<lane>/` — the one place temp files this build wrote may live; removed by `close --closeout` |
| `Workflow:` | conditional (see below) | how the build ran: the build-loop Workflow's run id, or `none, <reason>` when it was not used (for example `none, Codex-led: no Workflow tool`) |
| `Measure:` | no | the one census measure this build is expected to move: top-tier tokens per build, hours ask to accepted, rework after acceptance, or work lost or stalled |

### Status meanings

Lane 73 words (the set accept and merge-check accept, plus `reviewed`, below):

- `open` - someone is working; not waiting on anyone.
- `NEEDS BEN` / `NEEDS <peer slug>` - cannot move until that person acts; the `Now:` line says on what.
- `FAILED` - the work failed; `Now:` says why and `To finish:` what a retry needs.
- `accepted` and `closed` - as below.
- `PARTIAL` is not a word anywhere: a long-running goal sits in it for weeks.

`accept` and `merge-check` refuse a record whose `Status:` is any word outside `open`, `NEEDS BEN`,
`NEEDS <peer slug>`, `FAILED`, `accepted`, `closed` and `reviewed` (error code `status-word-refused`); `reviewed`
stays because it is the one state accept consumes (accept still requires `Status: reviewed`, merge-check
still requires `accepted`). The older words below stay readable so no existing record is rewritten.

### The `Now:` line (lane 73)

Every non-terminal record opened on or after `2026-10-02T04:00:00Z` (`PROGRESS_LINE_FROM`) carries one
`Now:` header line, refreshed by whoever writes the record; `validateRecord` reports a missing one as
`missing-field` and `accept` refuses it (`progress-line-missing`). A `Now:` line that is present must
always have the exact three-field shape, at any date. Earlier records and `accepted`, `closed` and `withdrawn`
ones are exempt.

### Older Status words (still readable)

- `runnable` — authorized and unblocked, nobody owns it.
- `owned` — someone is working.
- `delivered` — a builder reported; no reviewer verdict yet.
- `rejected` — a reviewer wrote a non-APPROVE verdict; `Next:` names the fix round.
- `reviewed` — a reviewer wrote APPROVE; not yet integrated or accepted.
- `accepted` — integrated and accepted within `Authority:`, or by Ben's word quoted in a
  `Log:` note.
- `closed` — terminal: an accepted record whose merge commit is an ancestor of main; only
  `work-record.mjs close` moves a record here and appends `closed <Owner> merge <40-hex>`.
- `blocked` — cannot move; `Next:` names the blocker and its owner.
- `withdrawn` — terminal, closed without a fix round; only `work-record.mjs withdraw` moves a
  record here, from `rejected`, `blocked`, `runnable` or `owned` (never `accepted`, never a
  second time).

### The `Scratch:` field, and where temp files live

> Temp files go only under the directory named by the record's `Scratch:` line
> (`<scratch root>/<lead session id>/<lane>/`); never write temp files into the repo and
> never delete them yourself: the lead's `work-record.mjs close --closeout` removes that
> directory.

`Scratch:` is a singleton header field, `Scratch: <absolute directory>`. The lead creates
that directory and names it in the brief; agents never delete it themselves. Two checks apply,
in `validateRecord`, `checkAcceptance`, and `acceptRecord` alike:

- A `Scratch:` value that is present but **not absolute** is refused (`scratch-invalid`),
  at any date.
- A record with **no** `Scratch:` line is refused (`scratch-missing`) only when `Spec-from:`
  is parseable *and* on or after `SCRATCH_FROM` — the lane-closeout lane's own merge time,
  set by the lead in that lane's merge commit (`export const SCRATCH_FROM` in
  `scripts/work-record.mjs`). Any other record missing `Scratch:` gets a warning only,
  never a refusal — `checkAcceptance`/`acceptRecord` surface it in the `"warnings":[...]`
  array, `validateRecord` as an `info`-level `scratch-missing` finding.

`checkScratchField(record, opts)` takes `opts.scratchFrom` the same way the strict-cutoff
check above takes `opts.strictFrom` — for tests only; there is no CLI flag to move it.

### The `Workflow:` field, and the one route

The build-loop Workflow (`skills/team-build/references/build-loop-workflow.js`) is the only
route for a build on a host that has the Workflow tool, one territory included. `Workflow:` is
a singleton header field naming the run: `Workflow: <run id>`, or `Workflow: none, <reason>`
for a build that did not use it (a Codex-led build has no Workflow tool). Checked at accept
time, by `checkAcceptance` and `acceptRecord` (and so by accept-prep's check-acceptance step):

- A record with **no** `Workflow:` line is refused (`workflow-missing`) only when `Spec-from:`
  is parseable *and* on or after `WORKFLOW_FROM` (`export const WORKFLOW_FROM` in
  `scripts/work-record.mjs`, `2026-10-01T00:00:00Z`). Any other record missing `Workflow:`
  gets a warning only, in the `"warnings":[...]` array.
- A `Workflow:` value that is a bare `none` with no reason is refused (`workflow-invalid`) at
  any date.

`checkWorkflowField(record, opts)` takes `opts.workflowFrom` the way `checkScratchField` takes
`opts.scratchFrom`: for tests only, there is no CLI flag to move it. `Workflow:` and `Measure:`
are known labels, so a record carrying them never trips the unknown-label check. The census
(`scripts/work-census.mjs`) prints each record's `Workflow:` value as a `workflow` field on its row and in a
`## Workflow` table, `(none)` when the line is absent.

### Migration debt

Five historical records currently say `Status: closed` with prose merge notes rather than the
required machine-readable close receipt: `wr-2026-09-27-collect-status`,
`wr-2026-09-27-delete-deny`, `wr-2026-09-27-knowledge-counted`,
`wr-2026-09-27-measure-truth`, and `wr-2026-09-27-pickup-complete`. They remain invalid under
this contract and require a separately authorized record migration; this lane does not edit them.

### `Log:` notes with fixed meaning

- `artifact <reference>` — `Artifact:` changed in this edit. Convention: the ownership-return
  line written when an agent reports, is stopped, or dies (e.g. `delivered orchestrator
  agent-exited`, or a plain `reviewed reviewer`) restates `artifact <reference>` for the
  artifact that is still current, even though it did not change in that edit — so a
  normal hand-back is not misread by `stale-result-candidate` as a result from a
  superseded owner.
- `review-rejected` — a reviewer's non-APPROVE verdict caused this status change.
- `agent-exited` — the prior owner reported, was stopped, or died.
- `ben: "<quoted word>"` — Ben's own word authorized this change.

### Model tokens on `reviewed`/`APPROVE` lines (measure-truth-1)

On a **strict** record (Opened at or after this lane's `STRICT_FROM`, see "Strict
Git-backed acceptance check" below), a `Log:` line's *note* — never a new token in the
fixed `<ISO-8601 UTC> <status> <owner> [<note>]` grammar above — must name a model when
the line either has `Status: reviewed`, or names the whole word `APPROVE` regardless of
status (the shape tonight's own fixes used: `D1 APPROVE b7a3fef (4 rounds, Opus
reviewer)`). The model tokens are the tiers table's own names (`docs/model-tiers.md`),
matched case-insensitively as a whole word (`claude-opus-5-5` counts as `Opus`); a `no`,
`not`, or `without` in the two words before the token means no model is named (`no Opus
reviewer was used` names none). A `reviewed` line whose note contains the whole word
`SKIPPED` (the loop's `seam SKIPPED`) needs no model. Such a line still satisfies the
at-least-one rule below when it also names a high- or top-tier token and `APPROVE`; the
build loop writes `seam SKIPPED; territory reviews APPROVE (Opus reviewer)`. At least one
`reviewed` line must name both a high- or top-tier token and `APPROVE`. Lines dated before
`STRICT_FROM`, and every rule on a non-strict record, are never re-judged.

### The `hung`/`stall`/`relaunch` check (measure-truth-1)

Every record, strict or not: if any `Log:` line dated inside `[Opened:, the accept
instant]` names `hung`, a form of `stall` (`stalled`/`stalls`/`stalling` — never
`installed`/`install`), or a form of `relaunch`, the record is refused unless the leading
integer of its `Four numbers: Work lost or stalled:` line is non-zero, or an unindented
body paragraph starts `Stall:` or `Gap:` and gives the reason. With no `Four numbers:`
line at all (no `--four-read` was run), the check is skipped and says so in a warning.
This is a coarse, one-regex check meant only to stop a zero from being written next to a
Log: line that visibly contradicts it.

### Evidence

A path inside the repo is checked: it must exist and its first line must start
`VERDICT:`. A path outside the repo root is never a finding — it is reported as
`evidence-unreachable`, an `info` row, since the validator can't read outside the repo.
`accepted` requires at least one evidence path *inside* the repo; at acceptance the
orchestrator copies the deciding report to
`docs/work/evidence/<work-id>-<lane>.md`.

A builder's or reviewer's report file already satisfies this at the source, with no
orchestrator-side rewrite: `agents/builder.md` and `agents/reviewer.md` both pin the
report/findings FILE's first line as `VERDICT: <word>` (builders: `VERDICT: PASS` /
`VERDICT: FAIL` / `VERDICT: PARTIAL` / `VERDICT: BLOCKED`; reviewers: `VERDICT: APPROVE`
/ `VERDICT: NEEDS_FIXES (<n>)`) — the `VERDICT: ` prefix belongs to the file only. The
agent's own REPLY still leads with the bare verdict word, no prefix; that word is what
the orchestrator reads to update `Status:`, not what the validator checks.

### Non-code outcomes

For research, documents, or other non-code work, use stable in-repository files or URIs in
`Scope:` and `Artifact:` rather than fabricating a Git revision. In the existing body prose,
state the reviewed snapshot or digest, source/read time when relevant, the project-defined
acceptance evidence, and the owner's judgment. For example:

```
Scope: https://example.invalid/brief (read 2026-09-23T16:00:00Z)
Artifact: docs/reports/native-review.md#sha256:<digest>

Observed: owner reviewed this snapshot against the cited sources and report evidence.
```

Structural validation checks the record shape and in-repository verdict evidence; it does not
prove that a non-code outcome is good or manage remote artifact history. Keep the deciding report
under `docs/work/evidence/` for this harness, and retain independent review when the task requires it.

### Strict Git-backed acceptance check

Historical structural validation remains permissive, but the owner never flips a reviewed
record to `accepted` by hand for code delivery or other Git-backed team builds: the `accept`
CLI command runs `checkAcceptance` itself and refuses to write the record when the check
fails, printing the finding list. `check-acceptance` stays available for a manual, read-only
run of the same check before calling `accept`:

```
node <verified-plugin-root>/scripts/work-record.mjs check-acceptance \
  --record <repo-relative-record> --repo <target-root> \
  (--delivery-ref <actual-live-ref> | --pinned-artifact <explicit-sha>)

node <verified-plugin-root>/scripts/work-record.mjs accept \
  --record <repo-relative-record> --repo <target-root> \
  (--delivery-ref <actual-live-ref> | --pinned-artifact <explicit-sha>)
```

Exactly one delivery mode is required. Live mode resolves the current ref tip and compares it
with `Artifact:`; pinned mode is an explicit choice for a deliberately fixed artifact and is
never inferred after a live ref moves. Short revisions work only when Git resolves them
unambiguously to commit objects. The check also requires every singleton header exactly once,
all required fields, and a nonempty top-level body `Observed:` metadata paragraph. `Observed:`
is unindented and begins at body start, after a blank line, or immediately after an unindented
`Predicts:` line in the same metadata paragraph. Quoted, fenced, list-contained, and otherwise
indented examples do not count. Every evidence path must be a readable regular file whose real
path stays within the repository.

The record must also carry a `Worktree:` field: an absolute path, a repo-relative path, or a
local branch name naming the git worktree or branch that produced `Artifact:`. The check
resolves that path's (or branch's) own live HEAD directly with git — never a value any agent
self-reports — and a mismatch, or a `Worktree:` that does not resolve at all, is a failing
finding named `sha-not-in-git`, the same code a SHA git does not have at all uses. In pinned
mode the artifact only has to be an ancestor of the worktree's HEAD (a pinned artifact may be
historical); live mode requires exact equality.

#### Artifacts in another repository

`Artifact-repo:` names, by absolute path, a git worktree of the repository that actually holds
`Artifact:` when it does not live in `--repo` — the plugin repo and the artifact's repo need not
be the same one. It must be absolute and must not resolve to the same repository as `--repo`
(compared by realpath of `git rev-parse --git-common-dir`); a relative value refuses
(`artifact-repo-not-absolute`), and one that names `--repo` itself refuses
(`artifact-repo-same`). Absent, behavior is byte-for-byte unchanged — every record without this
field is still read as naming an "unrelated repository" the ancestry guards above refuse.

When it is present, `accept` and `check-acceptance` resolve `Artifact:`,
`--pinned-artifact`/`--delivery-ref`, and `Worktree:` with `git -C <Artifact-repo>` instead of
`--repo` — `Worktree:` must then be an absolute directory or a branch name in that repo. The
record itself, its evidence, its census, and its four-read all stay confined to `--repo`, as
always. A missing or unreadable `Artifact-repo:` directory fails closed as `sha-not-in-git`.

`close --closeout`'s merge proof checks the artifact's ancestry against `origin/main` of the
`Artifact-repo:` repository, after a `git fetch origin` there — a fetch failure is
`UNVERIFIABLE`, exactly as it is for `--repo`. The record's own `--merge <sha>` given to `close`
is always the plugin-repo merge commit, checked in `--repo`, unchanged. Cleanup never deletes a
branch or worktree in the `Artifact-repo:` repository: the worktree, branch, and origin-branch
steps all refuse with `artifact-repo: cleanup is manual` instead; only the scratch-directory step
still runs.

`four-read.mjs` and `collect-from-origin.mjs` read `Artifact-repo:` from the record's own header
too: wherever either turns `Artifact:` into a sha it then looks up in git, it uses
`Artifact-repo:` when present. Where that lookup is only informational (`collect-from-origin.mjs`'s
`merged` column, `four-read.mjs`'s rework-after-acceptance number), a missing or unreadable
`Artifact-repo:` renders that value unknown, never a confident guess.

At least one evidence file must begin exactly `VERDICT: APPROVE <sha>` or `VERDICT: APPROVE —
<sha>` for the current artifact. A current `NEEDS_FIXES`, `FAIL`, or `REJECTED` refuses
acceptance. Supporting verdicts and verdicts for other revisions remain history. Success prints
`{"ok":true,"work":"...","artifact":"<full-sha>","delivery":"<full-sha>"}`, plus a
`"warnings":[...]` array when there is one to report (see below); failure is nonzero with a
diagnostic (`check-acceptance` never writes anything; `accept` writes the record only on
success, appending an `accepted` `Log:` line and flipping `Status:` in one edit).

#### Strict cutoff, and the `Base`/`Spec-session`/`Spec-from` refusals (measure-truth-1)

`Base:` is refused on **every** record, strict or not, unless it is exactly one 40-hex sha —
nothing is exempt. Beyond that, the check has two modes, decided by a record's *effective
opened instant*: the later of its `Opened:` and the author time of the first git commit that
added the record file (`Opened:` alone when the file has no commit yet — still strict for any
new work). A record whose effective opened instant is at or after this lane's frozen
`STRICT_FROM` (`2026-09-27T08:32:15Z`) is **strict**; backdating `Opened:` buys nothing once the
file is committed, since the commit's own author time still counts. A **non-strict** record
(effective opened instant before `STRICT_FROM`) prints one warning line naming the rule —
`strict-exempt: Opened before <STRICT_FROM>; Spec-session/Spec-from/model rules are warnings for
this record` — and keeps the older, warning-only behavior for `Spec-session:`/`Spec-from:`
below.

On a **strict** record, `accept` refuses — naming the first failing field, in the order Base,
Spec-session, Spec-from, and its fix — a record with: no `Spec-session:`, or a placeholder; no
`Spec-from:`, or a `Spec-from:`
that is not an ISO-8601 UTC instant ending in `Z` (an offset such as `-04:00` is refused, with
the fix line saying to convert it to UTC and write the `Z` form — the census reads `Spec-from:`
as a window start and needs a fixed zone). See "Model tokens on `reviewed`/`APPROVE` lines" and
"The `hung`/`stall`/`relaunch` check" above, in the `Log:` section, for the two other rules a
strict (or, for the second, every) record must also pass.

This command proves local record, review, and delivery identity only. The owner still verifies
integration gates, authority, goal satisfaction, and installed behavior. A merge that preserves
reviewed source needs no ceremonial re-review; content changes or conflict resolution require
independent review. Non-code work does not invent a Git commit to use this Git-specific gate;
an Artifact URI is not a way to bypass it for code.

## Validator (`scripts/work-record.mjs`, `validateRecord`)

`validateRecord(record, opts)` returns `[{ code, level: "finding" | "info", message }]`.
`opts` is `{ fsImpl, now, repoRoot, gitDir, ref }`, all optional — omitting `repoRoot`
skips every evidence-path check entirely (it does not guess in/out); `scope-drift` is
only attempted when both `gitDir` and `ref` are given.

| Code | Level | Fires when |
|---|---|---|
| `missing-field` | finding | a required field's `Label:` line is absent |
| `bad-status` | finding | `Status:` is not one of the older words or the lane 73 words (`open`, `NEEDS BEN`, `NEEDS <peer slug>`, `FAILED`) |
| `bad-work-id` | finding | `Work:` doesn't match `wr-<yyyy-mm-dd>-<slug>` |
| `accepted-without-artifact` | finding | `Status: accepted` and `Artifact:` is `none` or missing |
| `accepted-without-evidence` | finding | `Status: accepted` and no evidence path resolves inside the repo |
| `evidence-missing` | finding | an in-repo evidence path does not exist on disk |
| `evidence-no-verdict` | finding | an in-repo evidence file's first line does not start `VERDICT:` |
| `evidence-unreachable` | info | an evidence path resolves outside the repo root |
| `stale-result-candidate` | finding | the newest owner-change `Log:` line is newer than the newest `artifact <sha>` `Log:` line (an owner-change line is one whose owner differs from the line before it; the first line always counts). Does not fire when no `artifact <sha>` note exists yet, or when `Artifact:` is `none`. |
| `scope-drift` | finding | `git log -1 --format=%H <ref> -- <scope path>` on the given ref differs from the `Scope:` sha; only attempted when `gitDir` and `ref` are both given |
| `workaround-overdue` | finding | any `WORKAROUND:`'s `remove when` is `by <yyyy-mm-dd>` and that date is in the past, in any status |
| `bugfix-gate-missing` | finding | `Class:` is set, `Status: accepted`, and no evidence path's basename contains `prefix-test` |
| `runnable-with-owner` | finding | `Status: runnable` and `Owner:` is present and not `none` |
| `scratch-missing` | finding, or `info` | see "The `Scratch:` field" above — finding when `Spec-from:` is on/after `SCRATCH_FROM`, info (a warning) otherwise |
| `scratch-invalid` | finding | `Scratch:` is present but not an absolute directory path |
| `workflow-missing` | refusal (accept), or warning | no `Workflow:` line; a refusal when `Spec-from:` is on/after `WORKFLOW_FROM`, a warning otherwise (see "The `Workflow:` field" above) |
| `workflow-invalid` | refusal (accept) | `Workflow:` is a bare `none` with no reason |
| `artifact-repo-not-absolute` | finding | `Artifact-repo:` is present but not an absolute directory path |

`scope-drift`'s git check can also emit `scope-unresolvable`, level `info` — when
`gitDir` and `ref` are both given but `git log -1` for the `Scope:` path returns no
commit at all (never tracked at that ref, or the path itself is wrong). This is not one
of `FINDING_CODES`'s pinned thirteen codes (that list is fixed); it exists so an
unresolvable scope is distinguishable from an agreeing one instead of silently producing
zero rows either way. A `git` invocation that fails outright (bad `gitDir`, not a
repository) still produces neither a finding nor this info row — that failure mode is
"could not run the check," not "ran the check and found nothing."

## Set-level check (`checkRecordSet`)

`validateRecord` looks at one record at a time; some problems only show up across the
whole set. `checkRecordSet(records)` takes `listRecords`'s own return shape (`[{ path,
record }]`), groups by `record.fields.work` (a record with no `work` field is skipped —
that is `missing-field`'s job at the single-record level), and for every `work` id held
by more than one record returns `{ code: 'duplicate-work-id', level: 'finding', work,
paths: [...] }` — deliberately a different shape from `validateRecord`'s findings
(`work`/`paths`, not `message`), and not one of `FINDING_CODES`'s codes either: it is a
set-level finding, not a per-record one. `hooks/backlog-notice.js` calls it once per
scan and prints a duplicate-id id list on stderr when it returns anything; a duplicated
work id does not change which bucket its records fall into.

## Closing out: `close --closeout`, and `sweep-origin`

Plain `close` (no `--closeout`) behaves exactly as documented elsewhere in this file — it
writes the `closed` receipt and nothing more. `--closeout` adds five cleanup steps after
that close (or after accepting a record whose `Status:` is already `closed`): a merge
proof against `origin/main`, the worktree and its local branch, the branch on origin, and
the record's own `Scratch:` directory. This is the plugin's one file-delete path
(`fs.rmSync`, scratch directories only) and its one branch-delete paths (local `git branch
-d`, and ``git push --force-with-lease=refs/heads/<name>:<tip> origin :refs/heads/<name>``)
— every other command in this repo only ever reads.

```
node <verified-plugin-root>/scripts/work-record.mjs close \
  --record <repo-relative-record> --repo <target-root> --by <lead-session-id> \
  --closeout [--dry-run]
```

Each of the five steps prints exactly one line: `removed`, `refused <reason>`, `absent`,
or `dirty`. `--dry-run` prints the same lines prefixed `would ` and changes nothing on
disk — including the close write itself and the `Log:` line below — EXCEPT that it still
runs `git fetch`, same as a live run: the local `refs/remotes/origin/*` tracking refs can
move, since nothing here can prove a merge safe without a fresh fetch, dry run or not;
nothing else changes. Exit 0 only when every step is `removed` or `absent`; otherwise exit
2. On a real (non-dry-run) run, one `Log:`
line is appended: `closeout <Owner> by <lead-session-id> <step>=<result> <step>=<result> ...` — the
`Log:` owner slot is the record's own `Owner:` slug (never the closeout session id: a session id
there reads as an owner CHANGE after the newest artifact note, which trips `validateRecord`'s
own `stale-result-candidate` finding on every closed-out record); the session id that ran the
closeout is still recorded, in the note text.

`--by` gates the WHOLE closeout, not only the scratch step: when it does not equal the
record's own `Lead-session:`, every one of the four cleanup steps is refused before any of
them runs — including step 1 (close) itself, and the dry run's own `would` lines — and
`--by` itself must be a single token of 1-64 non-space characters, or the call throws
before that (a `--by` containing whitespace would otherwise write a malformed `Log:` line).

A failed merge proof — `git fetch origin` fails, or the record's `Artifact:` sha is not an
ancestor of `origin/main` — refuses every one of the four cleanup steps with that one
reason (`UNVERIFIABLE: fetch failed`, or the ancestry failure), rather than attempting any
of them. The worktree step first requires `git status --porcelain --ignored` (run inside
that worktree) to print nothing — untracked, modified, OR ignored files all make it
`dirty` and leave the worktree exactly in place, because an unforced `git worktree remove`
deletes ignored files itself without asking or reporting it, and the dry run reports this
same check so the two never disagree. The local branch is deleted with `-d`, never `-D`,
so it too is merely refused (not forced) when git's own checkout-local merge judgment
disagrees. The main worktree, whichever worktree contains `process.cwd()`, and whichever
worktree IS or CONTAINS `--repo` itself, are always refused (realpath-normalized, and
case-folded on win32, so this holds across platforms and past a symlinked ancestor). The
origin branch (`build/<...>`, taken from `Worktree:` or the `Artifact:` ref, every name
form normalized — `origin/`, `refs/heads/`, `refs/remotes/origin/` prefixes and a trailing
`/` all compare equal) is deleted with a lease, never a plain force: `git push
--force-with-lease=refs/heads/<name>:<tip> origin :refs/heads/<name>`, where `<tip>` is
the exact sha this run evaluated, immediately after its own fetch. A branch that lost that
lease (git's own ` ! [rejected] ... (stale info)`) is reported `refused moved` — never
silently deleting whatever the name now points at — and the printed restore command
(`git push origin <sha>:refs/heads/<name>`) always names that same evaluated sha; any OTHER
push rejection (a denied delete, a hook veto, ...) is reported by its own real reason, never
mislabeled `moved`. The branch is refused when it is not under `build/`, not this record's
own (checked against every name form a record can claim: `Worktree:` as a bare name,
`Artifact:`'s own ref, or — when `Worktree:` is a path — whichever branch `git worktree
list` reports checked out there), named by another record under `docs/work/` whose
`Status:` is neither `closed` nor `withdrawn`, or its tip fails any of the three
merge-safety proofs (ancestor of `origin/main`, not equal to `origin/main`'s own tip,
reachable only through a `--no-ff` merge commit's second parent). An open record whose
`Worktree:` is a path `git worktree list` cannot resolve (a Windows path read on Linux, a
missing directory, ...) still protects every branch whose own last path segment equals
that path's basename, compared case-insensitively, reported `keep open-record-unresolved
<record>` — the only signal left once the path itself can't be read. A registered-worktree
list that cannot itself be read fails CLOSED for the whole origin-branch step (`refused
UNVERIFIABLE: could not read git worktree list`, exit 2), never silently claiming no open
record protects anything. The worktree step of `close --closeout` uses the same
realpath-normalized, win32-case-folded match for `Worktree:` against `git worktree list`,
and reports an unmatched value `refused worktree-unresolved` (exit 2) when it names a
directory that exists but is not a registered worktree, a value written on the other OS,
or a path whose record branch a registered worktree still holds. A value naming a path
that no longer exists, with no registered worktree holding the record's branch, is
`absent` (round 4: closeout is safe to re-run); if that branch still exists locally it is
deleted with `-d` as usual. A second closeout of a fully cleaned-up record exits 0 with
every step `absent`, and appends one more `Log:` line. The scratch directory is removed only after the full set of
path-safety checks named in the pinned scratch sentence's own contract: a `Scratch:` value
must be absolute on THIS host's own path convention (a value recorded on the other OS is
refused, not resolved against this host's cwd); the session id from `--by` must be a whole
path segment strictly between a scratch root and the target, at ANY depth (matching the
real `/tmp/claude-<uid>/<project>/<session-id>/scratchpad/<lane>` layout); no symlink
anywhere in the resolved path; the target must never be a drive/filesystem root or the
home directory; and it must never be, contain, or (round 3 ruling) LIE INSIDE the repo root
or a path in `git worktree list` — checked in both directions, so a `Scratch:` a few levels below a linked
worktree's own root is refused too, not just the reverse. There is deliberately no walk for
a `.git` entry anywhere below the target: lanes keep fixture git repos in their own scratch
directories, so that walk refused almost every real closeout; an unregistered git repo
inside the lead's own session scratch is throwaway by construction and is removed WITH the
directory. A registered-worktree list that cannot be read fails CLOSED (refused), never
open.

`sweep-origin` runs a standing, repo-wide version of the same origin-branch rule, useful
for a batch cleanup outside any one record's own closeout:

```
node <verified-plugin-root>/scripts/work-record.mjs sweep-origin \
  --repo <target-root> [--exclude <name,name,...>] [--apply]
```

Dry run by default: lists every `origin/build/*` branch with its tip sha and a verdict,
`delete <name> <sha>` or `keep <name> <sha> <reason>`. It applies the same rules as
`close --closeout`'s origin-branch step, with two changes: "not this record's own" is
dropped (there is no one record to be the owner of here — sweep-origin only ever keeps a
branch that some *other*, still-active record names), and branches listed in `--exclude`
are added to the keep list outright. A repeated `--exclude` accumulates (each one is
appended, comma-joined, to the ones already given), never the last flag silently
overwriting the earlier ones; every `--exclude` name is normalized the same way an
origin/build/* name and a record's claimed name are, so `origin/build/x`, `build/x/`, and
`build/x` are all the same entry; an `--exclude` name matching no `origin/build/*` branch
prints `warn exclude <name> matches no origin/build/* branch` rather than being silently
accepted as if it had done its job. `sweep-origin` fetches (`git fetch --prune origin`)
before evaluating anything, in dry-run mode too — a fetch failure refuses every branch
outright (`refused UNVERIFIABLE: fetch failed`, exit 2) rather than falling back to
whatever refs happen to be on disk; a `for-each-ref` that itself fails is reported the
same way, never silently read as "no branches". `--apply` deletes only the branches
marked `delete`, against origin, with the same lease (never a plain force) `close
--closeout`'s origin-branch step uses, printing each name and sha plus its own restore
command — a dry run deletes nothing. Exit code is 2 whenever any delete fails (including a
lease that lost its race, `delete-failed <name> moved`) or the fetch/list itself failed;
0 otherwise.

## Full example record

```
Work: wr-2026-09-21-work-record-hardening
Scope: next-build/spec.md@95d5453
Owner: none
Status: reviewed
Authority: may edit its own territory's files only; may not touch the shared safety block or any other territory
Artifact: feat/next-build-T1@9c1a2b3
Evidence: docs/work/evidence/wr-2026-09-21-work-record-hardening-review.md
Next: integrator merges T1 and runs the full suite
Opened: 2026-09-21T14:00:00Z
Builder: sonnet
Rounds: 1
Log: 2026-09-21T14:00:00Z owned t1
Log: 2026-09-21T15:10:00Z delivered t1 artifact 9c1a2b3
Log: 2026-09-21T15:40:00Z reviewed reviewer artifact 9c1a2b3

T1 hardened all four `scripts/work-record.mjs` exports against the C1/C2 contract,
added the three named failure-case tests (stale-result-candidate, accepted-without-
evidence, scope-drift), wrote this doc, and updated the mandate template and the
builder/reviewer agent text. Reviewer verified the validator against every finding
code and APPROVEd on the first round.
```
