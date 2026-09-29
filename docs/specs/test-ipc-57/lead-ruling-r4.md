# Lane 57 lead ruling r4: the stop rule fires, ship with the limit documented

Input: docs/specs/test-ipc-57/review-r4.md, NEEDS_FIXES (8) at ae7dfce. The Windows suite at ae7dfce is green: 3043 tests, 3010 pass, 0 fail.

The review found silent passes again (R4-1 is in N2's own class). Under ruling r3's stop rule, this lane ships with the limit documented. There is no further design round, and the lexer gets no new mechanism.

This round is closing work only:
- R4-1: adopt the reviewer's measured patch, with the regex contexts plus the structural desync check. The desync check fails loud, and it keeps the R2 tripwire.
- R4-2: adopt. Only a top-level `env` key seals a call.
- R4-4: adopt. `env: undefined`, `null` and `void 0` in an options variable or inline count as inheriting.
- R4-7: adopt the discriminating fixture. It is the second-to-last assertion of R4-1's unit test.
- R4-8: adopt. Add a "Known limits (text scanner; follow-up: simpler design)" paragraph to the `findEnvLessSpawns` doc comment, one line each for:
  - R4-3: inheritance through a variable, an alias, a helper, or options built on an earlier line;
  - R4-5: node reached through exec/execSync, renamed imports, argv0 or argv[0], a destructured execPath, or 'node' in a variable;
  - R4-6: the remaining shapes the review lists.
  Replace the round-history narration in that region with this paragraph. The history lives in the record and the spec folder.
- R4-3 is NOT patched. It is a documented limit.

The unclassified hit is settled. The lead read hooks/multi-inbox.test.mjs:40: it is a doc comment that names the parent process environment, not a spawn. The naive whole-file rule would false-positive on it. This is noted for the simpler-design follow-up, which must strip comments before its whole-file rule.

Red and green: the new R4-1 test is red at ae7dfce and green after. The real tree is unchanged: 10 files, 15 sites, and 1167b9a still flags :66 and :523.

Gates: the three touched files, then `TMPDIR=/var/tmp node scripts/run-tests.mjs` once.

Territory is unchanged. The expected edit is skills/multi/scripts/hooks.test.mjs only.

Follow-up, opened at close: replace the text scanner with the simpler design (one top-level key-presence rule plus one comment-stripped whole-file rule) after the bearings hold lifts.
