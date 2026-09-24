VERDICT: NEEDS_FIXES 96edf9093e95a68e0b4f851f0e11d20d0eef9373

I only read the source; I ran nothing. I checked the files against the manifest paths. `fixtures/handback/goals-clean.md`, `transport.mjs` and `project-config.mjs` aren't in the packet, so I couldn't check the hand-back `HANDBACK ok` path or whether real `pickupOnce` can resolve a transport repo from a temp fixture directory that isn't a git repo. The parent's executed gate has to settle those.

## Findings

**MEDIUM: an unclosed `<details>` inside Closed hides every later active section.** `skills/decisions/scripts/decisions-read.mjs:178-185`, `:189-192`, `:349`
- **Cause:** `detailsDepth` goes up on `<details>` and down on `</details>`, with a floor at 0. Balance is never checked. If a `<details>` inside the archive is never closed, the depth stays above 0 for the rest of the page. Every later real H1, including `# Waiting on you now`, is then ignored as a scope boundary, so `inArchive` stays true to the end. Every optionless summary after that point drops out of `shapeless`, and both pickup and hand-back pass it. This path is new: before this change nothing could hide an active shapeless summary. A stray `</details>` at depth 0 is also swallowed silently, which can skew the depth the other way.
- **Discriminating check:** `parseDocument('# Closed {toggle="true"}\n<details>\n# Waiting on you now\n<summary>Active</summary>\n- [ ] Done')` should give `shapeless` = `[{title:'Active', line:4}]`. The current code returns `[]`.
- **Fix location:** same lines. Keep a `detailsBalanced` flag. Set it false when a `</details>` arrives at depth 0, and false when `detailsDepth !== 0` after the loop. Then filter with `!(detailsBalanced && archivedTitles.has(t))`. On a page whose structure isn't trusted, this falls back to the pre-fix behaviour: nothing is exempted. It isn't a new blind rule, so pages that parse today still parse. Add the check above to `decisions-read.test.mjs`.
- **Simplification:** this is one boolean. No new state, engine or public key.

**LOW: the SKILL.md wording is looser than the code.** `skills/decisions/SKILL.md:9-11` (diff) says the scope ends at "the next top-level heading". The code ends it only at a column-zero H1 (`#` plus a space) outside details and fences. A top-level `##` does not end it. Suggested wording: "the next top-level level-one (`#`) heading." It would also help to add one clause that optionless summaries under any other top-level section now block both hand-back and pickup, because the kept-sections exemption is gone.

**NIT: the module header is stale.** `decisions-read.mjs:5-6` still says "no other indentation logic". The details-depth tracking now affects archive scope, though not which title a line attaches to.

**NIT: the leak test is weak.** In `decisions-archive.contract.test.mjs:108`, `includes('archiveScope')` only searches for a name the code never uses. The real protection is the `Object.keys` deep-equals at `:104-107` and `decisions-read.test.mjs:428,470`. Also, `.replace('- [ ] Done', '- [ ] Done')` at `:205` replaces the text with itself and does nothing.

## Checked and passing
- **Closed exactness:** `matchTopLevelHeading` (`:73-81`) matches column zero only. It strips the toggle attribute and bold, but not a numeric suffix, so `# Closed (8)` stays active. `##`, indented, fenced and details-nested headings can't open or close scope, and `# closed` or `# Closed {color=...}` fail closed.
- **Nested H1:** an H1 inside `<details>` doesn't end scope (`decisions-read.test.mjs:449-479`, contract `:111-138`).
- **Fence, summary and blind rules:** the fence toggle still runs first. A `<details>` line can't contain `<summary`, so the blind check still sees every summary. A malformed summary or an unterminated fence still throws under Closed.
- **Human signals kept:** archiving only removes entries from the `shapeless` filter. Comments still reach `unattached` through the unchanged R5 loop. Checkbox options still become decisions with the usual statuses and warnings. Which title a line attaches to is unchanged. `archivedTitles` is a local Set and never mutates the title objects.
- **Hand-back vs pickup:** `shapeLines` now reports `doc.shapeless` directly (`decisions-handback.mjs:68-73`). Pickup gates on that same array at `:925` and `:1010`. The old backward heading scan and the `decisionsText` argument are fully removed, and `SHAPE` still counts toward `clean`. The guard that rejects an invalid page before looking at Done is unchanged.
- **Tests:** I found no invented APIs. `makeTempHome` returns `{agentsHome, env, fixtureRoot, cleanup}`. `receiptPaths`, `openPrivateCapture`, `pickupOnce` and handback `run({readGoalsParentPage})` all exist with the signatures used. The fixture line numbers are right (`line 10`, `line 8`). The test cases would fail against the 0.20.5 reader, the old handback filter and a `normalizeTitle`-based heading match, so a pass is meaningful.

Once the `detailsBalanced` fix and its test are in, I'd approve this design. It stays within scope: no new engine, state, or list of allowed titles.