# Scout — O2 (agents/builder.md, skills/team-build/references/build-loop-workflow.js)

Read at base d5d769f8c5a026a20d06a0e8eee3b4bccd9da9ba.

## Files and symbols
- `agents/builder.md` (59 lines) exists. The existing "forbids `rm -rf`" line is line 17: "Never
  discard or overwrite work you did not just write: no `git reset --hard`, `git clean`, `git stash`,
  `git checkout`/`git restore` of paths, any force push (`--force`, `--force-with-lease`), `rm -rf`, or
  `Remove-Item -Recurse -Force`. If the work seems to need one, stop and report." This is inside the
  `<!-- safety-block:start --> ... <!-- safety-block:end -->` fenced block (lines 12-20) — the spec's
  new sentence goes "beside" this line, i.e. as its own bullet immediately after it, still inside the
  safety block.
- `skills/team-build/references/build-loop-workflow.js` (894 lines): the builder mandate is the
  `BUILD_MANDATE` constant. Found via grep — it currently reads (one line): "Report to disk; first
  line of your report is VERDICT: PASS, FAIL, or BLOCKED; never set or switch a git identity; no
  destructive git (reset --hard, clean, stash, force-push, rm -rf). Never send peer notes." This is the
  "builder role rules" the contract (R6) means — confirmed by R6 naming this file's "builder mandate"
  specifically, not any other mandate constant (`REVIEW_MANDATE`, `INTEGRATE_MANDATE`, `SETUP_MANDATE`,
  `ACCEPT_MANDATE` also exist nearby but are not the builder's).
- Neither file currently contains the literal sentence the spec wants added ("A builder never deletes
  a directory, its own scratch included; a recursive delete waits on a permission prompt nobody is
  watching, which is how a lane lost 3.5 hours on 2026-09-26. Removal of worktrees and scratch is the
  lead's own standalone command.") — this is pure addition, no drift to reconcile.

## Helpers to reuse
- None needed — this is a one-sentence text addition to two files, no code/logic.

## Tests that police this area
- `skills/team-build/references/build-loop-workflow.test.mjs` (1753 lines) has test `R9: every mandate
  constant carries the note-send prohibition` (around line 249) which regex-matches each mandate
  constant's declaration block (`const <NAME> =[\s\S]*?(?=\nconst |\n\/\/)`) and asserts it contains
  literally `Never send peer notes.` — adding a new sentence to `BUILD_MANDATE` must not disturb that
  trailing phrase or the regex's ability to capture the whole constant (i.e., don't introduce a `\nconst
  ` or a `\n//` inside the string that would truncate the match early).
- No test in that file appears to pin `BUILD_MANDATE`'s exact wording beyond the note-send-prohibition
  check above (confirmed by grep: no other `BUILD_MANDATE` reference in the test file) — so contract
  R6's "if a test pins the mandate text, update that test too, and only that" is conditional and, on
  this tree, does not currently apply; no test file changes are expected unless the builder's own edit
  breaks the R9 regex above.
- No test file was found for `agents/builder.md`'s prose (it's a markdown agent-definition file, not
  imported/parsed anywhere found in this pass) — confirm with a repo-wide search before assuming none
  exists.

## Open questions for the spec
- The spec says "beside the existing line" for `agents/builder.md` and "the builder role rules" for
  `build-loop-workflow.js" as if both files have an equally clear single insertion point; that holds
  for `agents/builder.md` (line 17, one obvious line) and for `build-loop-workflow.js` (the
  `BUILD_MANDATE` constant, one obvious declaration) — no ambiguity found, but the builder should
  still grep for any *other* prose in `build-loop-workflow.js` that also forbids `rm -rf` (e.g. a
  second mandate or a comment) before picking BUILD_MANDATE as the sole site, since R6 says "the
  builder mandate" (singular) but the spec text says "the builder role rules" (plural-sounding).
