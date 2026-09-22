APPROVE eada62c

# T4 review, round 2 (delta only: 8498f22..eada62c, branch feat/next-build-T4)

All three round-1 patches landed verbatim, plus both tests I required. Delta touches only
`scripts/janitor.mjs` and `scripts/janitor.test.mjs`; worktree clean, no stray files.

- MAJOR 1 (bounded regex) — `scripts/janitor.mjs:475` is now
  `/^(?:by[ \t]{1,20})?(\d{4}-\d{2}-\d{2})\b/i`, bounded, `by` optional, trailing words allowed.
  Probed: `2020-01-01` and `by 2020-01-01 at the latest` → `(overdue)`; `T3 merges` → `(open)`;
  `by2020-01-01` and `2020-13-45` → not overdue (NaN guard at :478). No new unbounded run, no `\s`.
- MAJOR 2 (blind-on-unreadable) — `scripts/janitor.mjs:495-504`: try/catch around `listRecords`,
  one stderr line, `return []`. New test at `janitor.test.mjs:1374-1395` builds a DIRECTORY named
  `x.record.md` and asserts the rest of the report still prints.
- MAJOR 3 (wiring leak) — the three sites (`janitor.test.mjs:1227`, `:1260`, `:1338`) are now
  wrapped in the same console.log suppression as every other `main()` call in the file, each with
  a `finally` restore. `grep "main(\["` shows no unwrapped call left in the T4 block.

Both new assertions are real, confirmed by mutation on scratchpad copies (worktree untouched):
reverting the regex to the strict `^by …$` form fails the bare-date assertion; removing the
try/catch fails the MAJOR 2 test. Round-1 mutations M1/M2/M3 still hold.

Gates rerun by me in wt-T4: `node --test scripts/janitor.test.mjs` → **43 pass / 0 fail**;
full `node --test` → **894 pass / 0 fail**. No regression in the delta: the reason-string format,
print order, `--apply` behaviour (`applySafe` still touches only `state.safe.*`) and the
open-rows-never-change-the-exit-code rule are all unchanged.

Carried Note for the integrator (not T4's to fix): these tests do not seal `AGENTS_HOME`, so on a
machine with `~/.agents/ws-off` the exit-0 assertions pass vacuously — T7's sealed runner covers it.
