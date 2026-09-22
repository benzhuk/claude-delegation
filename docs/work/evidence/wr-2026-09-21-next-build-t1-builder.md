VERDICT: PASS

## Territory T1 — record and fields

Worktree: `.../scratchpad/next-build/wt-T1`, branch `feat/next-build-T1`, base
`95d54535e1d6deb3ed242a95a23beb8b43c11d7c`. Commit: `3ac30e3 feat(work-record): harden
validateRecord and land T1 docs/agent text`.

Addenda applied: A3 (spec-addendum-r3.md) — the scope-drift fixture repo is built with
`fs.mkdtempSync(path.join(os.tmpdir(), "work-record-scope-"))`, never in the repo or
scratch. A4 — pinned "owner-change Log line" as owner differs from the immediately
preceding Log line's owner (first line always counts, `scripts/work-record.mjs:139`);
`formatLogLine` (already correct at the stub, `scripts/work-record.mjs:184-187`) is now
pinned by a dedicated test never emitting a trailing space or the word "undefined";
`validateRecord` called without `repoRoot` skips every evidence-path check rather than
guessing in/out (`scripts/work-record.mjs:97-99`, tested at
`scripts/work-record.test.mjs` "without repoRoot, every evidence-path check is
skipped").

## Files changed
- `scripts/work-record.mjs` — implemented `validateRecord` (was `throw new Error("not
  implemented")` at the base commit); `parseRecord`, `listRecords`, `formatLogLine`
  unchanged from the working stub.
- `scripts/work-record.test.mjs` — kept all 8 base smoke tests; added 22 more (30
  total): one per finding code, plus the three named failure cases.
- `docs/work-record.md` (new) — C1 in prose, full field table, validator table, one
  complete example record with a full Log:.
- `docs/mandate-template.md` — added `Work:` line, the C4 bug-fix block (`Fix kind:
  bug`, `Class:`, `Regression test:`, `Base sha:`), and a reviewer-fields paragraph
  naming the four C4 review lines.
- `agents/builder.md` — state-file bullet now states builders never write the work
  record.
- `agents/reviewer.md` — added: a bug-fix review carries the four C4 fields; reviewers
  never write the work record either.
- `agents/agents.test.mjs` — two new tests pinning the builder.md/reviewer.md text
  above.
- Safety block: untouched. Verified with `git diff -- agents/builder.md
  agents/reviewer.md | grep safety-block` → no output (no hunk touches the marker
  lines).

## Gate
`node --test scripts/work-record.test.mjs agents/agents.test.mjs` → **54 pass, 0
fail**. Log: `.../scratchpad/next-build/reports/T1-gate.log`.

## The three named failure-case tests (by name in scripts/work-record.test.mjs)
1. "validateRecord: old worker finishes after replacement -> stale-result-candidate" —
   `Log:` sequence owned t1 (09:00) → delivered t1 artifact abc1111 (10:00) → owned t2
   agent-exited (11:00, an owner-change since owner differs from the prior line, per
   A4). Newest owner-change (11:00) is newer than the newest `artifact` note (10:00) →
   fires.
2. "validateRecord: effect landed but result lost -> accepted is refused
   (accepted-without-evidence)" — `Status: accepted`, `Artifact:` set to a real sha,
   `Evidence: none` → `accepted-without-evidence` fires, `accepted-without-artifact`
   does not.
3. "validateRecord: fresh worker on an obsolete fact -> scope-drift on a fixture repo"
   — a real git repo under `os.tmpdir()` with two commits touching `target.txt`; a
   record whose `Scope:` cites the first (stale) sha fires `scope-drift` against
   `ref: "HEAD"`; a record citing the current sha does not.

## Deviations / assumptions
- `bad-work-id` checks format only (`^wr-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$`), not
  uniqueness across a directory — `validateRecord` takes one record, and C2's signature
  has no directory argument to check uniqueness against. Noted as an open question in
  the state file rather than silently assumed.
- `scope-drift`'s git subprocess failure (bad path, git missing, not a repo) fails open
  with no finding — spec names no code for "could not determine" and this avoids a
  false positive; noted in state file.
- Used the machine's ambient/already-configured git identity for the scope-drift
  fixture repo's two commits (plain `git init` + `git commit`, no `-c user.*`, no
  `GIT_AUTHOR_*`/`GIT_COMMITTER_*`, no login/switch) — this is not "setting or
  switching" an identity, just using the one already configured, and the repo lives
  entirely under `os.tmpdir()` per A3.
- Read-only files respected: `scripts/project-config.mjs`, `scripts/wiring-check.mjs`,
  `hooks/agent-dispatch-guard.mjs`, `hooks/delegation-reminder.js` not touched; `git
  status --porcelain` shows only T1 territory files changed.

## Needs
None — no cross-territory file change was required. T2/T4 can import
`scripts/work-record.mjs`'s four exports as-is; nothing about their contract changed
beyond `validateRecord` moving from throwing to fully implemented.

## Open questions
See state file (`.../scratchpad/next-build/reports/T1-state.md`, "Open questions"):
`Work:` uniqueness is not validator-checked; scope-drift git-failure handling choice.

## Round 2

Reviewer findings: `.../scratchpad/next-build/reports/T1-review.md` — NEEDS_FIXES (7:
3 MAJOR, 4 MINOR). Fix commit: `6b28563 fix(work-record): round-2 review fixes
(MAJOR 1-3, MINOR 4-6, notes)`.

- **MAJOR 1** (`accepted-without-evidence` fired on a correct record with no
  `repoRoot`, violating A4) — applied verbatim. `scripts/work-record.mjs`:
  `hasInRepoEvidence` now starts `opts.repoRoot === undefined && evidence.length > 0`
  instead of always `false`, so an absent `repoRoot` no longer treats every evidence
  path as "outside the repo." Verified: the reviewer's repro (`Status: accepted` +
  a declared evidence path, no `repoRoot`) now returns `[]`.
- **MAJOR 2** (nothing pinned A4's owner-change definition; a "everything is an
  owner-change" mutant stayed green) — applied verbatim, including the new test
  "validateRecord: a later Log line with the SAME owner is not an owner change (A4)"
  in `scripts/work-record.test.mjs`. It fails if `ownerChangeLogs` is replaced with
  `log.slice()`, confirming the mutant is now caught.
- **MAJOR 3** (scope-drift's gitDir/ref guard was unobservable — dropping either one
  left the suite green because the bare `catch` swallowed git's own failure) — applied
  verbatim: added an `execImpl` opt (`opts.execImpl ?? execFileSync`) mirroring the
  existing `fsImpl` opt, wired into the git call in place of the bare `execFileSync`
  reference, plus the new test "validateRecord: scope-drift never invokes git unless
  BOTH gitDir and ref are given" asserting zero calls for `{}`, `{gitDir}`, `{ref}` and
  exactly one call (with the exact argv) for both given. **`execImpl` is additive and
  optional, the same shape as `fsImpl` in C2's existing `opts` list — it does not
  change any existing call site or any other territory's usage** (flagging for the seam
  review per the coordinator's note).
- **MINOR 4** (mandate-template's `Fix kind:` line folded trailing prose into the
  label's own value) — applied verbatim: replaced with a plain parenthetical note above
  the four bug-fix lines, so `Fix kind:`'s value is now just `bug`.
- **MINOR 5** (WORKAROUND splitter lost the date when the cause itself contained
  `" / "`) — applied verbatim: when a WORKAROUND line splits into more than 3 parts on
  `" / "`, the last two segments are taken as `blockedBy`/`removeWhen` and everything
  before them rejoins as `cause`. Verified by hand:
  `WORKAROUND: flaky CI / CD runner / upstream bug / by 2020-01-01` now parses to
  `{ cause: "flaky CI / CD runner", blockedBy: "upstream bug", removeWhen: "by
  2020-01-01" }` and correctly fires `workaround-overdue`.
- **MINOR 6** (two internal regexes contradicted the doc's own "never an unbounded
  quantifier before the capture" claim) — applied verbatim: `HEADER_LINE_RE`'s label
  group is now `[A-Za-z ]{0,40}` and the `Log:` line splitter's three `\S+`/`[ \t]+`
  runs are now `\S{1,64}`/`[ \t]{1,20}`.
- **MINOR 7** — orchestrator ruling followed: no implementation change. Documented the
  convention at `docs/work-record.md`'s `artifact <sha>` note definition: the
  ownership-return line (e.g. `delivered orchestrator agent-exited`, or a plain
  `reviewed reviewer`) restates `artifact <sha>` for the still-current artifact even
  though it did not change in that edit, so a normal hand-back is not misread as a
  stale result by `stale-result-candidate`.
- From the **Notes**, applied: (1) a one-line `try`/`catch` around `listRecords`'s
  `fsImpl.readFileSync`, so a file removed between `readdirSync` and the read no longer
  throws through T2's hook or T4's janitor — it now yields an unparseable/empty record
  entry instead of an uncaught exception. (2) Renamed the test at
  `scripts/work-record.test.mjs` from "every code in FINDING_CODES is reachable by at
  least one test in this file" to "FINDING_CODES is exactly C2's twelve codes" (it only
  ever asserted the constant's contents, not reachability). (3) Added one line to
  `docs/work-record.md`'s `Scope:` field-table row noting the path always uses forward
  slashes (a backslash silently resolves to nothing when `scope-drift` runs `git log`
  on macOS/Linux). Skipped the rest of the Notes per the coordinator's instruction
  (Date.parse/NaN comment, bare-date fallback for `by <date>`, end-of-day semantics,
  `accepted` + missing evidence file nuance, `agents/agents.test.mjs`'s `\s+` usage).

Gate rerun: `node --test scripts/work-record.test.mjs agents/agents.test.mjs` →
**56 pass, 0 fail** (was 54; +2 from MAJOR 2 and MAJOR 3's new tests). Log rewritten at
the same path: `.../scratchpad/next-build/reports/T1-gate.log`.

Files touched this round (all within T1's territory, `git status --porcelain` shows
only these four): `scripts/work-record.mjs`, `scripts/work-record.test.mjs`,
`docs/mandate-template.md`, `docs/work-record.md`. `agents/builder.md`,
`agents/reviewer.md`, `agents/agents.test.mjs` untouched this round (no finding named
them).

## Round 3

Reviewer found MAJOR 1's round-2 fix landed without its own regression test
(reverting `work-record.mjs`'s `hasInRepoEvidence` line stayed green). Appended the
reviewer's test verbatim to `scripts/work-record.test.mjs`. Gate:
`node --test scripts/work-record.test.mjs agents/agents.test.mjs` → **57 pass, 0
fail** (was 56). Commit: `8500d9a test(work-record): pin A4 accepted-without-evidence
without repoRoot`.
