# Scout — C1 (collector script, test, fixtures, census doc)

Read at base 5f057a3959323bd0fd01231e6fe6d47688991cec (ac9c842+05b9bcc).

## Files and symbols
- `scripts/collect-from-origin.mjs` — does not exist. Build from scratch.
- `scripts/collect-from-origin.test.mjs` — does not exist.
- `scripts/fixtures/collect-from-origin/` — does not exist; `scripts/fixtures/` currently
  holds only a `four-read/` subdir, so this is a fresh sibling, not a shared dir to edit.
- `docs/census.md` (344 lines) — three `##` sections in order: `build-census.mjs`,
  `four-read.mjs`, `work-census.mjs`. No existing collector section; the three required
  sentences (spec item 3 / contracts R2) are a new short subsection, not a rewrite of
  an existing one.
- `docs/sealed-baseline.json` currently `{"files": []}` — no pre-existing sealed-test
  ratchet entries to worry about colliding with.

## Helpers to reuse
- `scripts/janitor.mjs`: `git()` wrapper (`execFileSync("git", args, {cwd, encoding:
  "utf8", stdio: ["ignore","pipe","pipe"]})`, line ~115) and its read-only plumbing
  idioms — `listWorktrees` (for-each-ref/porcelain parsing), `isBranchMerged` /
  `isBranchOnOrigin` (both do a `show-ref --verify` EXISTENCE check on every ref before
  ever using it as a `merge-base --is-ancestor` operand — janitor's own round-2 review
  found a tag-name/DWIM bug from skipping that). Follow the same discipline rather than
  calling `merge-base --is-ancestor` on an unverified ref.
- `scripts/work-record.mjs` exports `parseRecord(text)` → `{fields, workarounds, log,
  census, fourNumbers, errors}`, already parsing `Status:`, `Artifact:`, `Log:` lines
  with the exact header-line regex this repo standardizes on. It takes raw text, not a
  path — feed it the blob text from `git show <ref>:<path>` rather than re-deriving the
  parsing.
- `scripts/janitor.test.mjs` (~line 81) has a reusable bare-remote fixture helper
  (`git init -q --bare -b main`, `remote add origin`, push) — the same shape the spec's
  pinned test (three branches: accepted-unmerged, accepted-merged, owned) needs.

## Tests that police this area
- `scripts/run-tests.mjs`'s `walkTestFiles` auto-discovers any `*.test.mjs` outside
  `node_modules/.claude/.git` — a new `collect-from-origin.test.mjs` needs no wiring.
- No existing test currently references `collect-from-origin` anything (grep clean).

## Open questions for the spec
- R1 says git-plumbing only, listing `diff --name-only`/`ls-tree` as allowed primitives
  for finding changed `docs/work/*.record.md` blobs between a branch and main — pick one
  and say why in the report (both are legal per contracts).
- R1: "any other Status maps to owned unless it is accepted/rejected" — does a record
  whose `Status:` field is entirely absent (parseRecord returns `fields.status`
  undefined) count as `no-record` or `owned`? The state list has a separate `no-record`
  state for a missing FILE; recommend treating a present-but-unparseable/absent Status
  as `owned` (falls under "any other Status"), reserving `no-record` for the file not
  existing on that branch at all — confirm this reading rather than inventing a third
  behavior.
