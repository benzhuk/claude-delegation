# Peer-note envelope — PINNED CONTRACT (2026-09-12)

One line in chat and in the ledger. Same for Claude and Codex sessions. Fields in this order,
separated by the reserved words shown; a field's text must not contain a reserved word.

```
<from> → <to>, <M.D.YY> <HH:MM> <TZ> [<id>] <KIND>: <substance>. Goal: <why>. Details: <path>. Needs: <need> by <time>
```

Example (Ben's own):

```
taxonomy → nucleus, 9.12.26 13:01 NYC [pr132-review-1] ASK: Please review my PR #132. Goal: faster wall clock, better batch orchestration. Details: docs/notes/pr132-review-1.md. Needs: review by 15:00
```

| Field | Rule |
|---|---|
| `from`, `to` | Pane names as shown in Orca (lowercase slug `[a-z0-9-]+`, e.g. `taxonomy`, `nucleus`, `astra`, `n-astra`). `ben` is a valid recipient for decisions only Ben can make. |
| date, time, `TZ` | Ben's local zone (rule 05-time.md; `NYC` today). Month.Day.YY numeric, 24h clock. If the EVENT time differs from send time, say it in the substance ("ran 11:25"). |
| `[id]` | `<slug>-<n>`: slug `[a-z0-9-]+` names the topic (`pr132-review`), `n` counts notes on it. A reply reuses the slug with the next `n` and adds ` re <parent-id>` inside the brackets: `[pr132-review-2 re pr132-review-1]`. Re-sending the same id is a no-op for the reader (dedup). A correction names the id it supersedes: `supersedes pr132-review-1` in the substance. |
| `KIND` | `ASK` (needs something from the peer) · `ACK` (started on an ASK; exactly one per ASK) · `RESULT` (done; Details points at the deliverable) · `BLOCKED` (cannot proceed; reason; sent once, then move on) · `FYI` (no reply expected). Nothing else. No heartbeats, no "worker_done". |
| substance | ≤ 2 lines. Lead with the ask, the verdict, or the decision. Never a recap of earlier rounds. No secrets, ever. |
| `Goal:` | Why this matters, one clause. Optional on ACK/FYI. |
| `Details:` | Path to the detail file (repo-relative in the recipient's repo, or absolute). Optional on ACK/FYI; required on ASK and RESULT when there is anything beyond two lines to say. |
| `Needs:` | `decision` · `review` · `ack` · `none`, optionally ` by <time>`. Only ASK carries `decision`/`review`; `Needs: decision` addressed to a peer means "your call", addressed to `ben` means Ben's call. Elapsed time is never approval. |

## Where files live (per repo, committed with the next normal commit)

- Ledger: `<repo>/docs/ledger/YYYY-MM-DD.md` — one envelope line per event, appended in send order,
  by BOTH sender and recipient sessions (the sender appends what it sent; the recipient appends
  what it received only if it lands in a different repo). Cross-repo notes: the full note goes to
  the RECIPIENT's repo (the one who must act); the sender's own ledger gets the same one line.
- Detail packet: `<repo>/docs/notes/<id>.md` in the recipient's repo. Template:

```
# <id> — <one-line title>
from: <pane> · to: <pane> · sent: <M.D.YY HH:MM TZ> · event: <time or "same"> · supersedes: <id or none>

## Ask / Decision
## Scope (files, branch/worktree, reviewed revision or content hash)
## Conditions (gates, ownership, budget, "no deploy/DB/flag changes" etc.)
## Evidence (paths, commits, measured numbers — reported vs verified vs pending)
## Next action (owner, by when)
```

## Regex (line-anchored, for tooling and tests)

```
^(?<from>[a-z0-9-]+) → (?<to>[a-z0-9-]+), (?<date>\d{1,2}\.\d{1,2}\.\d{2}) (?<time>\d{2}:\d{2}) (?<tz>[A-Z]{2,5}) \[(?<id>[a-z0-9-]+-\d+)(?: re (?<re>[a-z0-9-]+-\d+))?\] (?<kind>ASK|ACK|RESULT|BLOCKED|FYI): (?<body>.+?)(?: Goal: (?<goal>.+?))?(?: Details: (?<details>\S+?))?(?: Needs: (?<needs>decision|review|ack|none)(?: by (?<by>.+?))?)?\.?$
```

## Transport (pinned)

Notes are TYPED into the recipient pane (`orca terminal send --terminal <handle> --text "<line>" --enter`),
which Claude Code queues mid-turn. Never `orca orchestration dispatch/send`. Before typing, the
sender checks the pane state; while a permission prompt is open it DEFERS and retries; if the pane
cannot be found or the CLI fails, the sender reports it (exit code + message) — a note is never
dropped silently. The ledger line is written BEFORE the delivery attempt, so the record exists
even when delivery is deferred.
