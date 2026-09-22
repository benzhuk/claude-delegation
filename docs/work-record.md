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
| `Scope:` | yes | `<path>@<sha>` — the spec or brief and the commit it was read at |
| `Owner:` | yes | `<slug>` or `none` |
| `Status:` | yes | one of `runnable`, `owned`, `delivered`, `rejected`, `reviewed`, `accepted`, `blocked` |
| `Authority:` | yes | what may happen without Ben, and what may not |
| `Artifact:` | yes | `<branch>@<sha>` or `none` |
| `Evidence:` | yes | comma-separated report paths, or `none`; each path's first line must start `VERDICT:` |
| `Next:` | yes | the next action, or the blocker and its owner |
| `Opened:` | yes | ISO-8601 UTC |
| `Children:` | no | comma-separated child work ids |
| `Builder:` | no | model name |
| `Rounds:` | no | source of truth for round count |
| `Class:` | no | failure-class slug, bug fixes only |
| `WORKAROUND:` | no, repeatable | `<cause> / <blocked by> / <remove when>`; `remove when` is `by <yyyy-mm-dd>` or a worded condition |
| `Log:` | no, repeatable | `<ISO-8601 UTC> <status> <owner> [<note>]`, append-only, one per status or owner change |

### Status meanings

- `runnable` — authorized and unblocked, nobody owns it.
- `owned` — someone is working.
- `delivered` — a builder reported; no reviewer verdict yet.
- `rejected` — a reviewer wrote a non-APPROVE verdict; `Next:` names the fix round.
- `reviewed` — a reviewer wrote APPROVE; not yet integrated or accepted.
- `accepted` — integrated and accepted within `Authority:`, or by Ben's word quoted in a
  `Log:` note.
- `blocked` — cannot move; `Next:` names the blocker and its owner.

### `Log:` notes with fixed meaning

- `artifact <sha>` — `Artifact:` changed in this edit.
- `review-rejected` — a reviewer's non-APPROVE verdict caused this status change.
- `agent-exited` — the prior owner reported, was stopped, or died.
- `ben: "<quoted word>"` — Ben's own word authorized this change.

### Evidence

A path inside the repo is checked: it must exist and its first line must start
`VERDICT:`. A path outside the repo root is never a finding — it is reported as
`evidence-unreachable`, an `info` row, since the validator can't read outside the repo.
`accepted` requires at least one evidence path *inside* the repo; at acceptance the
orchestrator copies the deciding report to
`docs/work/evidence/<work-id>-<lane>.md`.

## Validator (`scripts/work-record.mjs`, `validateRecord`)

`validateRecord(record, opts)` returns `[{ code, level: "finding" | "info", message }]`.
`opts` is `{ fsImpl, now, repoRoot, gitDir, ref }`, all optional — omitting `repoRoot`
skips every evidence-path check entirely (it does not guess in/out); `scope-drift` is
only attempted when both `gitDir` and `ref` are given.

| Code | Level | Fires when |
|---|---|---|
| `missing-field` | finding | a required field's `Label:` line is absent |
| `bad-status` | finding | `Status:` is not one of the seven values |
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
