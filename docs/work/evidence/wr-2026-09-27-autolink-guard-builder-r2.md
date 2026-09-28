VERDICT: DONE 72f8b71e0410b55ce5402e5013de6541042f50a0

Lane 32 (autolink-guard), round 2 — applying Opus review r1 (`pack/review-r1.md`) against
3af975a. `git pull` first: branch tip was 963a7f7 (the orchestrator's record commit only,
`docs/work/wr-2026-09-27-autolink-guard.record.md`), fast-forwarded cleanly, no conflict.

## Findings applied

**F1 (blocking)** — `<...>` was exempting every angle-bracket span from all three autolink
rules, not just rule (c). Fixed the actual `.replace()` call in `stripAutolinkExempt`
(`skills/decisions/scripts/decisions-render-core.mjs`) to
`/<(?:https?:\/\/|www\.)[^>\s]*>/gi`, exempting only a real `<http(s)://...>`/`<www....>`
autolink span. Updated the doc comment. Added tests: `a < b, see GOALS.md -> c` refuses,
`<GOALS.md>` refuses, `<~/.agents>` refuses, `<https://example.com/x>` still passes.

**F2 (blocking)** — `checkAutolinkLines(bullets.join('\n'), 'session.md')` numbered lines by
bullet index, dropping line 1 (`since:`) and every blank line, so the reported line was
wrong. Changed to `checkAutolinkLines(text, 'session.md')` (the full file text; line 1 is
already validated by `parseSessionSource` and can never match). Added a render-level test:
a bare filename on session.md's third file line is reported as exactly `session.md:3`.

**F3 (low, in territory)** — the filename regex's lookahead only rejected a following word
char, so `notes.md/x.mjs` wrongly refused on `notes.md` (not the final segment) and
`GOALS.md.bak` wrongly refused (real extension `.bak`). Changed
`AUTOLINK_FILENAME_RE`'s lookahead to
`(?![A-Za-z0-9_-]|[./][A-Za-z0-9_-])`. Added tests for both cases plus confirming
`see GOALS.md.` (sentence-end) still refuses.

**F4 (low, in territory)** — extension list and case-sensitivity were unpinned by any test
(4 extension-drop/add mutants and a case-sensitivity mutant survived). Added the `'i'` flag
to both `AUTOLINK_FILENAME_RE` and `AUTOLINK_WWW_HTTP_RE`, and added a table test asserting
each of `md/sh/io/ai/co/me/so/py` refuses and each of
`mjs/js/json/ts/toml/yaml/yml/txt/html/css` passes, plus a case-insensitivity test
(`README.MD`, `GOALS.Md`, `HTTP://example.com`, `WWW.example.com` all refuse).

**F5 (low, in territory)** — SKILL.md's new sentence said "any bare filename" (overstates:
only the eight TLD-shaped extensions trigger it) and referenced
`` `decisions-render.test.mjs` `` without the `scripts/` prefix the rest of the doc uses.
Reworded to name the eight extensions explicitly and fixed the reference to
`` `scripts/decisions-render.test.mjs` ``.

Also added the one test the review flagged as missing under "Survived: noFence" (a fenced
block's content is exempt end to end, and scanning correctly resumes right after the
closing fence — `` ```\nGOALS.md\n``` `` passes, a bare `GOALS.md` line right after the
closing fence refuses at the correct line).

## Gate
1. `node --test skills/decisions/scripts/decisions-render.test.mjs` — 94/94 pass, 0 fail.
2. `node scripts/run-tests.mjs` (full suite) — `tests 2565`, `pass 2557`, `fail 0`,
   `cancelled 0`, `skipped 8`, exit 0. The runner's own deliberately-failing `✖ probe`
   self-test fired twice mid-log (lines 1089, 1102) and is expected/ignored per the
   coordinator's instruction; it does not count against the aggregate `fail 0`.
3. Live proof, real sources: `node skills/decisions/scripts/decisions-render.mjs render
   --repo .` from the worktree root — exit 0, empty stderr.
4. Live proof, scratch: copied the (fixed) `docs/decisions` into the scratchpad, appended
   `- See GOALS.md for the current goal.` to `session.md` (a 9-line file becomes 10 lines —
   confirmed with `wc -l` and `cat -A` before running). Ran `render --repo <scratch>`:
   exit 2, stderr:
   `decisions-render: session.md:10 carries a bare filename Notion will autolink (GOALS.md) — wrap it in backticks or write it as a link.`
   This is now the TRUE file line (was wrongly `session.md:9` in round 1's proof, per F2).

## Territory
Only `skills/decisions/scripts/decisions-render-core.mjs`,
`skills/decisions/scripts/decisions-render.test.mjs`, and `skills/decisions/SKILL.md`
changed (`git diff --stat` against 963a7f7 confirms three files). `decisions-render.mjs`'s
re-export list was already correct from round 1 and needed no change.
`decisions-render-publish.mjs`, `docs/decisions/**`, `notion.js`, `goals-mirror.mjs`, and
`docs/work/**` are untouched.

## Push
Committed `72f8b71e0410b55ce5402e5013de6541042f50a0` on `build/autolink-guard-1`, pushed
(fast-forward, no force). No `-c user.*`, `--author`, `--no-verify`, or `--no-gpg-sign`
used; no git identity changed. No command was denied.

## Cleanup
No dev server, no background processes left running (the two background `run-tests.mjs`
jobs across both rounds completed and were not manually killed — they exited on their own).
All scratch proof artifacts stay under this session's scratchpad only.
