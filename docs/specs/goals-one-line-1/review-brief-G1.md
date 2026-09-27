# Review brief G1 (lane 27), Opus, read-only

Worktree /home/ben/Code/claude-delegation-wt/goals-one-line-1, artifact cb555e65cc2d70b2e845a2d90e3c55a98d146117 (diff 06eb093..cb555e6). Spec: docs/specs/goals-one-line-1/spec.md (pinned text wins; spec-full.md for context). Builder report: reports/G1-report.md. Live page snapshot: goals-page-live-before.md.

Attack brief:
1. Marker callout: is it still the FIRST callout and does its first text line carry the sha exactly as decisions-handback.mjs:99-113 parses it? Run handback's parser (read-only) on a rendered fixture to prove it.
2. Table: one row per `## ` goal of docs/GOALS.md; state word = the Status line's leading token with the existing colored-span style; sentence = text after the state word up to the first `. ` (try "0.20.6 release", "e.g. x", a Status with no `. `, a missing Status line, a `|` inside the sentence that would break the table, a trailing period); date or "undated" — where does the date come from and is it right for every real goal?
3. Refusals (exit 2): hex 7-40 with a letter and a digit, `\d+ of \d+` / `\d+/\d+`, a session id. Hunt false negatives (uppercase hex, a sha in backticks, "3 of 4" vs "3of4") and false positives on the REAL GOALS.md (e.g. a date 2026-09-25, "0.8.0", a word like "deadbeef1"? decide). Does it refuse only table sentences, not Detail text?
4. Detail: `# Detail {toggle="true"}` with today's per-goal sections byte-for-byte after one tab, `<empty-block/>` at the bottom. Compare against goals-page-live-before.md's shape: will an anchored edit of the live page actually produce this, and does nothing Ben wrote get moved or rewritten? No callout inside the table.
5. decisions-read.mjs on the rendered page: every goal heading seen, zero shapeless — is the test real (runs the real reader on the real render) or a check that passes because it isn't looking? Mutate the render (drop a heading, add a callout in the table) and confirm a test fails; revert via git checkout of that one file only.
6. pane-setup.md: only the "Releasing" paragraph changed (diff it); its procedure (render, fresh read, anchored edits one tab deeper, verify) is executable as written.
7. publish stays disabled.

Run the territory tests only (goals-mirror + decisions-read), not the full suite. No deletion commands, no notion.js calls, never touch docs/work/, never send a note, never commit.
Findings: severity, file:line, concrete fix, ready patch for mechanical ones. Report: docs/specs/goals-one-line-1/reports/G1-review.md, line 1 exactly `VERDICT: APPROVE <full sha>` or `VERDICT: NEEDS_FIXES <full sha>`.
