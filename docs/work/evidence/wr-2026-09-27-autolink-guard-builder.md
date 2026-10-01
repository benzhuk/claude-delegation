VERDICT: DONE 3af975a553f35a0099c6c9195d4d645a9c56694d

## Goal line served
GOAL: "work lost or stalled" — this lane closes the observed defect (a bare `GOALS.md` got
silently autolinked by Notion on the way back, the readback compare then failed, and a
publish round was lost to `--adopt-live` recovery). Nearest NOT: "a rule no script checks" —
this is now enforced by `render()` itself, before any Notion write, not left as a written-down
convention.

## What changed (territory only)
- `skills/decisions/scripts/decisions-render-core.mjs`: added `stripAutolinkExempt(text)`
  (blanks inline code spans, whole `[text](url)` links, fenced code blocks, and `<...>`
  spans, whole-text aware so a fenced block's own fence lines carry the exemption across
  lines) and `checkAutolinkLines(text, sourceLabel)` (throws `RefusedError` naming
  `sourceLabel:line` for a bare `word.TLD` filename on its final path segment, a bare `~`,
  or a bare `www.`/`http(s)://` span). Wired next to every existing `checkProseLines` call
  site (`buildWaitingSection`, `buildNowSection`, `buildSessionSection`, the history
  Summary-line check in `buildHistorySection`) plus one new call on `doneLine` inside
  `render()`, labeled `--done-line`. `stripExempt` (the hex-rule helper) is untouched.
- `skills/decisions/scripts/decisions-render.mjs`: re-exports `checkAutolinkLines` and
  `stripAutolinkExempt` alongside the existing core re-exports.
- `skills/decisions/scripts/decisions-render.test.mjs`: every unit test from Acceptance,
  plus a handful of render-level wiring tests (now.md/session.md/waiting-item refusals,
  history-body-not-scanned, `--done-line` labeling).
- `skills/decisions/SKILL.md`: one new sentence after line 42 (see ambiguity note below).

## Gate
1. `node --test skills/decisions/scripts/decisions-render.test.mjs` — 83/83 pass, 0 fail.
2. `node scripts/run-tests.mjs` (full suite) — `tests 2554`, `pass 2546`, `fail 0`,
   `cancelled 0`, `skipped 8`, exit 0. The runner's own deliberately-failing "probe"
   self-test (visible mid-log as `✖ probe`) fired and was ignored per the brief; it does not
   count against the aggregate `fail 0`.
3. `node skills/decisions/scripts/decisions-render.mjs render --repo .` from the worktree
   root — exit 0, empty stderr: the current `docs/decisions` sources (now.md, session.md,
   the one waiting item, all eight history Summary lines) give zero autolink hits, matching
   the spec's "the first publish after merge is not blocked" claim.
4. Scratch live proof: copied `docs/decisions` into the scratchpad
   (`.../scratchpad/proof-repo/docs/decisions`), appended one line to `session.md`:
   `- See GOALS.md for the current goal.` (line 9). Ran
   `node skills/decisions/scripts/decisions-render.mjs render --repo <scratch>/proof-repo`:
   exit 2, stderr:
   `decisions-render: session.md:9 carries a bare filename Notion will autolink (GOALS.md) — wrap it in backticks or write it as a link.`
   stdout empty (never partially wrote a page). Names the file and line, says how to fix,
   exactly per the pinned rule.

## Spec ambiguity resolved
"SKILL.md gains one sentence after line 42" — the base file's line 42 sits mid-sentence
(`` `\*\*` Notion produces from the owner's typed asterisks — plain agent bold `` continues
onto line 43's `` (`**like this**`) is never one (checked by...) ``). Inserting a literal new
line between raw lines 42 and 43 would have split that sentence mid-clause. I resolved this
by inserting the new sentence at the nearest sentence boundary at or after line 42 — i.e.
right after that sentence finishes (which happens on line 43) — so the new sentence is the
first text to appear after everything on line 42, without breaking the existing grammar. The
new sentence: "The decisions-page renderer refuses, before publishing, any bare filename,
`~`, or unwrapped `www.`/`http(s)://` span that Notion would otherwise autolink on the way
back, with no exemption for a quoted owner line (Lane 32, checked by
`decisions-render.test.mjs`)."

No other assumptions or deviations. All four in-territory files are the only ones touched
(`git diff --stat` against `a43d96e` confirms). Nothing outside territory was read for
contracts other than `pack/spec.md` and the current `docs/decisions/**` content (read-only,
for the live-proof step).

## Push
Committed `3af975a` on `build/autolink-guard-1`, pushed to
`origin/build/autolink-guard-1` (fast-forward, no force). No `-c user.*`, `--author`,
`--no-verify`, or `--no-gpg-sign` used; no git identity changed.

## Cleanup
No dev server, no background processes left running. Scratch proof artifacts live under
this session's scratchpad only (`.../scratchpad/proof-repo/`, `render-out.md`,
`render-err.txt`, `proof-out.txt`, `proof-err.txt`, `full-run.log`) — never written into the
repo or worktree.
