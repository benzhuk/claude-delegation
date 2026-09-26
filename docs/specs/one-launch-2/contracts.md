# one-launch-2 — lead rulings (win over spec.md where they differ)

Base 33aa023 (origin/build/collect-from-origin-1). Integration worktree /home/ben/Code/wt-olfix on
build/one-launch-2. One territory, id F1.

Territory F1 files: skills/team-build/references/build-loop-workflow.js, build-loop-workflow.test.mjs,
build-loop-args.example.json (and build-loop-args.legacy.example.json if present), skills/team-build/SKILL.md
(sentences only), and ONE NEW FILE ruled in by the lead: skills/team-build/references/accept-prep.mjs
with its test skills/team-build/references/accept-prep.test.mjs (+ fixtures under
skills/team-build/references/fixtures/accept-prep/). Nothing under scripts/, hooks/, .codex-plugin/, README.md.

R1. Why a helper: a Workflow script has no fs or shell, so a test of the loop script can only check
prompt text, and a prompt-order test is a check that passes because it isn't looking. The order and
header-preservation guarantees therefore move into a deterministic Node helper that the accept-prep
runner executes as ONE command, and the helper is tested against real fixture files.

R2. `node skills/team-build/references/accept-prep.mjs --record <repo-relative record> --repo <integration
worktree> --plugin-root <dir holding scripts/work-record.mjs and scripts/build-census.mjs>
--delivery-ref <branch> --artifact-sha <40-hex> --worktree <branch> --owner <slug> --log-note <text>
--evidence <path>[,<path>...] --lead <lead .jsonl> [--from <iso> | --marker <text>] --census-out
<repo-relative .md> [--now <iso>] [--json]`. Steps, in this order, each only after the previous succeeded:
  1. Read the record, change ONLY: `Status:` -> reviewed; `Artifact:` -> `<delivery-ref>@<sha>`;
     `Worktree:` -> value (insert after the last singleton header line if absent); `Evidence:` -> the
     existing list plus new paths, deduped, order kept; append ONE `Log: <now> reviewed <owner>
     <log-note>` line after the last existing header line, before the first blank line. Every other
     byte of the file is preserved (line endings too). Write atomically (temp file + rename in the same dir).
  2. Run the census (`build-census.mjs --lead ... --out <census-out>`, plus --from/--marker) AFTER step 1,
     so the census is not older than the reviewed Log line.
  3. Run `work-record.mjs check-acceptance --record --repo --delivery-ref`, capture exit code and output.
  Prints (and with --json emits) { recordChanged: [fields], censusPath|null, censusError|null,
  checkAcceptance: { exitCode, verdict, output } }. Exit 0 when all three ran; non-zero with a reason
  otherwise. It never runs `accept` and never writes `accepted`.
  A census failure leaves the record edit in place and reports censusPath null + censusError.
R3. Tests (accept-prep.test.mjs, sealed-runner compatible, fixtures via FIXTURE_ROOT/tmp): (a) a record
with Work, Scope, Owner, Authority, Evidence, Lead-session, Base and six Log lines comes out differing
ONLY in the owned fields plus one appended Log line (byte diff); (b) ORDER: using stub
work-record/build-census scripts under a fake --plugin-root that log invocation order and read the
record's mtime/contents, assert the census stub saw the reviewed Log line already present; a variant
where the helper is patched to call census first must fail that test (demonstrate in the report);
(c) census failure path; (d) never writes accepted.
R4. Loop script: accept-prep prompt runs exactly the helper command (rendered from args), states it
must not edit the record any other way; ACCEPT_PREP schema unchanged except it may add recordChanged.
Given-territory mode accepts `seamBriefPath` (same meaning as setup mode's; falls back to
reviewerBriefPath only when absent) — test both. `baseSha` must be ONE sha (7-40 hex); anything else
(e.g. `a+b`) returns at once with blockers [{id:'*', reason:'bad-base-sha'}] and spawns nothing — test.
R5. Base is one sha (spec item 4): SKILL.md one sentence: when a build needs two bases, the lead makes
the merge commit on the integration branch before launch and passes its sha; the record carries
`Base: <merge sha>` and `Base-of: <sha>, <sha>` for humans. Dogfood (four-read on a scratch copy of lane
six's record with Base set to its merge commit 5f057a3) is the LEAD's accept-turn job, not the builder's.
R6. Gates: F1 `node --test skills/team-build/references/build-loop-workflow.test.mjs
skills/team-build/references/accept-prep.test.mjs`; integration `node scripts/run-tests.mjs`, no new
failure vs base by failing test name (H6 note-send and V4 mirror-shim are known on base). Reviewer attack
brief per spec Acceptance. Every agent: never send peer notes, never set a git identity, no destructive
git, never push; a denied command stops the step and is reported, never routed around.

R7 (added by the lead after this build's own first launch, 2026-09-26 ~09:55 NYC). The setup stage's
check compares the setup agent's returned worktree/branch/briefPath to the script-computed values as
exact strings, so a correct but RELATIVE briefPath (`docs/specs/one-launch-2/briefs/F1.md` against the
computed absolute `/home/ben/Code/wt-olfix/docs/specs/one-launch-2/briefs/F1.md`) returned
setup-failed after the setup work had fully succeeded (run wf_bc76a98a-05b). Fix: normalise before
comparing (a relative path is resolved against integrationWorktree; strip trailing slashes; no other
leniency: a different file is still a mismatch), and render the computed ABSOLUTE paths in the setup
prompt as the values to report verbatim. Test: relative-but-same passes, different-file fails,
`../` escapes resolved before compare.
