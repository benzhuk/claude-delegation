STATUS: DONE 65e6921cf28c2879f3ee31d6c982c63354cc0000

# Lane 30 stall-nudge: fix round 1

Recovery of a stalled builder that ran `rm -rf` and stopped at a permission prompt mid-task. Verified
the disk before trusting anything: `git status`/`git diff -- scripts/` in `wt-sn` showed only the
expected uncommitted edits (`scripts/collect-status.mjs`, `scripts/collect-status.test.mjs`) plus the
lead's own uncommitted `docs/work/wr-2026-09-28-stall-nudge.record.md`, which I never staged or edited.

## What the stopped builder had already done

Its uncommitted diff already applied F1, F2, F3, F6, F7 in `scripts/collect-status.mjs` and F2/F4/F6/F7
tests plus a partial F1/F3 test pass in `scripts/collect-status.test.mjs`, matching review-r1.md's
patches exactly (readLedgerCorpus via `mainCheckout`/`gitRunner`; `r.status !== "closed"` guard;
`if (args.quiet) return []`; `ledgerCorpus += `\n${idPrefix}`` after each send; `STATUSES.includes(row.status)
? row.status : a.state` in the ASK text). I read every line against contracts.md and the findings
and kept it as-is — no defects found in the applied code.

What was still missing when I took over:
- The F1 test (linked-worktree dedupe) and the F3 test (`--quiet` sends no ASK) were both present in
  the diff already, complete — the stopped builder had in fact finished F1/F3/F6 tests too, contrary
  to the recovery brief's "partway through F1, F3, F6" note. I re-verified all of them rather than
  trusting that memory.
- `docs/specs/collect-status-1/spec.md`'s "Lane thirty addendum" section still described the OLD
  behavior (dedupe reading `--recipient-repo` directly, no mention of closed exclusion, `--quiet`,
  the record's own Status word, or the per-run in-memory ledger append). I rewrote that section to
  match the applied fixes.

## Verification

Gate (sealed HOME, a scratch `.gitconfig` with a throwaway identity so the fixture repos' `git commit`
succeeds without touching any real git identity): `node --test scripts/collect-status.test.mjs
skills/multi/scripts/hooks.test.mjs` → 63/63 pass. Log at
`docs/specs/stall-nudge-1/reports/build-r1-gate.log`.

Discriminating checks, each in a fresh `mktemp -d .../scratchpad/sn-rec-XXXX` copy of the worktree
(never reused, never cleaned):
- F1 mutant (revert `readLedgerCorpus` to the old `path.join(repoAbs, "docs", "ledger")`): the F1
  linked-worktree test fails, 2 sends instead of 1.
- F4 mutant (`const stallRows = attention;`, no filter): the rewritten acceptance test fails at 3
  calls instead of 2, with `accepted-unmerged` visibly sneaking an ASK through — confirms the
  attention-reasons-before-call-count ordering actually catches the regression, not just the count.
- F3 mutant (drop the `if (args.quiet) return [];` guard): the F3 test fails, 1 call instead of 0.

All three real fixes are load-bearing per the recovery brief's discriminating checks.

## Files changed

- `scripts/collect-status.mjs` — F1 (read the main checkout's ledger via `mainCheckout`/`gitRunner`,
  read-only import from `skills/multi/scripts/transport.mjs`), F2 (`closed` excluded from the silent
  guard), F3 (`--quiet` returns `[]` before any send), F6 (append the sent id prefix to the in-memory
  ledger corpus so two records on one tip get one ASK per run), F7 (`STATUSES.includes(row.status) ?
  row.status : a.state` in the ASK text, importing the read-only `STATUSES` constant from
  `scripts/work-record.mjs`).
- `scripts/collect-status.test.mjs` — F2 test additions (closed record excluded, blocked record named
  by its own Status word), F4 (fixed the test clock to `Date.now() + 5h` so `accepted-unmerged` and
  `no-record` actually exercise the filter; assert `status.summary.attention` reasons before the call
  count), F5 (dedupe fixture built with `buildEnvelope` at id counter `-2`, filed under the previous
  day), new tests for F1 (linked-worktree `--repo`, a `fakeSpawnWritingLedger` helper that resolves
  through the same `mainCheckout` note-send uses and appends a real `buildEnvelope` line), F3
  (`--quiet` sends 0 ASKs, attention row still present), F6 (two records sharing one tip → one ASK).
- `docs/specs/collect-status-1/spec.md` — rewrote the "Lane thirty addendum" section to match: closed
  exclusion, `--quiet` suppresses the ASK, dedupe reads the main checkout (not `--recipient-repo`
  directly), the shared-tip one-ASK-per-run behavior, and the record's own `Status:` word in the text.

## Deviations / judgment calls

None beyond what review-r1.md already specified; every patch matches its suggested diff verbatim
(matching what the stopped builder had already written, which I independently checked against
contracts.md rather than trusting its own claims).

## Cleanup

No processes started, nothing to kill. Scratch copies under `scratchpad/sn-rec-*` and
`scratchpad/gitcfg-path.txt` left in place per the no-delete rule (leftovers are fine, never cleaned
mid-task).
