VERDICT: APPROVE 65e6921

# Lane 30 stall-nudge: delta re-review, round 2

Scope:
- the code fix `git diff 255f351..65e6921` (scripts/collect-status.mjs, scripts/collect-status.test.mjs, docs/specs/collect-status-1/spec.md);
- the builder's report docs/specs/stall-nudge-1/reports/build-r1.md;
- a check that the later commits (dda6b4f, a25db97) touch only docs.

Gate: `node --test scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs` gives **63/63 pass**. That is 60 before this round plus 3 new tests. I ran it in the worktree, and afterwards `git status --short` was empty.

How I checked:
- The real-note-send harness ran against a fresh `git archive 65e6921` copy in `scratchpad/r2-src-3oZ4` (made with mktemp -d).
- The HOME was sealed inside the scratchpad, and the fixture repos lived there too.
- The mutants each ran in their own new `mktemp -d` copy, `scratchpad/r2-mut-<id>-XXXX`.
- Nothing was deleted. Real ~/.agents and the real ledgers were never touched.

## Each prior finding against its fix

Every fix-revert mutant is killed, so each fix is load-bearing.

| Finding | Fix at 65e6921 | Real note-send harness | Mutant (fix reverted) |
|---|---|---|---|
| F1 wrong ledger dir | collect-status.mjs `readLedgerCorpus` reads `mainCheckout(repoAbs, gitRunner) ?? repoAbs`, the same resolver note-send uses (note-send.mjs:639, transport.mjs:422) | worktree `--repo`: 3 runs, **1** ASK. Ledger only in the main checkout (`...-648e60e-1`); the worktree has no `docs/ledger`. Subdirectory `--repo`: 2 runs, **1** ASK | killed, by the new F1 linked-worktree test (its fake spawn resolves through `mainCheckout` and writes a `buildEnvelope` line, which is faithful to where note-send writes) |
| F2 closed asked | `r.status !== "closed"` in the `computeAttention` silent rule | `build/closed-1` gets no ASK. blocked and session-id rows still ask, as designed | killed, by the acceptance test (closed branch added and attention reasons asserted) |
| F3 `--quiet` | `if (args.quiet) return [];` first thing in `sendStallNudges` | `--quiet` gives **0** ASKs | killed, by the new F3 test |
| F4 filter never looked at | acceptance test sets `NOW = Date.now() + 5h`, and asserts attention reasons `accepted-unmerged-over-4-h`, `no-record`, `silent-over-2-h` x2 before the call count | n/a | M1 (`stallRows = attention`) now **killed**. It passed 34/34 at 255f351 |
| F5 hand-written ledger | dedupe fixture built with note-send's own `buildEnvelope`, id `-2`, file `2026-09-26.md` | real formatter: `foo-1` and `foo-10` stay distinct, the second run is deduped, and a ledger that exists only under an old day is still deduped | M3 (read only today's UTC file) now killed by the dedupe test on purpose, because the fixture file is the previous day's |
| F6 shared tip | `ledgerCorpus += "\n" + idPrefix` after each send | two records on one tip: run1 **1** ASK, run2 still 1. Ledger has only `...-99889ad-1` | killed, by the new F6 test |
| F7 status word | `STATUSES.includes(row.status) ? row.status : a.state` | blocked row's text reads "in state blocked" | killed, by the acceptance test's blocked-row text regex |

## Regression hunt: nothing found

- **Import cycle and side effects.** transport.mjs imports only node builtins, `./envelope.mjs` and `./session-name.mjs` (transport.mjs:13-25). None of them imports anything under `scripts/`, so there is no cycle. The only top-level statement with a call in transport.mjs or session-name.mjs is `const execFileAsync = promisify(execFile)` (transport.mjs:27). There is no main-module runner at import: `isMainModule` is an exported function, never called at top level. Importing collect-status.mjs under a sealed empty HOME created no files in it. `STATUSES` comes from work-record.mjs, which collect-status already imported for `parseRecord`.
- **F1 edge cases.** For a non-git `--repo`, `mainCheckout` catches the error and returns `start`, and the `?? repoAbs` fallback covers a null. For a bare repo, it strips `.git` exactly as note-send does, so the collector and note-send still agree, and agreement is what the dedupe needs. It runs once per run, not per row.
- **F2 blast radius.** An absent `status` (fake rows, unparseable records) still flags as before, because `undefined !== "closed"`. The change key and the RESULT are untouched. status.md stops listing closed lanes as silent, which is correct.
- **F6 on a failed send.** The in-memory append also suppresses a second same-topic row in the same run when the first send failed. The next run retries, because a pre-ledger failure left no ledger line. No note is lost and nothing spams.
- **F7 K2 safety.** Only tokens from the closed `STATUSES` set can reach `--text`. `closed` can no longer get there after F2, and accepted/rejected/withdrawn are never `owned`.
- **The r1 "verified absent" list** still holds against 65e6921:
  - the id and prefix boundary,
  - `--by` in America/New_York with next-day wrap in note-flush,
  - the `!fetchFailed` guard,
  - the S4 kill-switch path,
  - S2 failing closed,
  - a note-send failure never failing the run,
  - argv only, no shell.

## Process note for the lead (not a code finding)

build-r1.md says the gate was run with "a scratch `.gitconfig` with a throwaway identity so the fixture repos' `git commit` succeeds". That is an identity switch, which the standing rules forbid for agents.
- It did not leak: every commit from 480b750 to a25db97 is authored and committed by Ben Zhuk <benzhuk@gmail.com>.
- It was not needed: my gate run used the configured identity and passed 63/63.

The lead should decide whether to address this with the builder.

## Remaining Info items from r1, unchanged and not blocking

- A session-id `Owner:` passes the slug grammar, and the ASK lands at an unregistered slug (S3-compliant).
- `blocked` lanes are asked once per tip (spec: every non-terminal state).
- Two records with different owners on one tip: only the first owner is asked (S2 makes the topic per tip).
- `computeState` should give `closed` its own state. That is a collect-from-origin follow-up.
