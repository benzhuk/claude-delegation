VERDICT: APPROVE 7b2cfd2

# T6 Ladder — round-2 delta re-review

Gate in wt-T6: `node --test skills/delegate/references/ladder-workflow.test.mjs`
→ **tests 13, pass 13, fail 0** (was 11/11). Delta `50cb7ad..7b2cfd2` is one commit,
3 files, all in territory; tree clean; author `Ben Zhuk <benzhuk@gmail.com>` == configured
identity. SKILL.md change is confined to the new section.

**Finding 1 (cap fail-open) — fixed as patched.** `ladder-workflow.js:27-28` is now
`const capArg = Number(a.maxAgents)` / `a.maxAgents != null && Number.isFinite(capArg) ?
capArg : 12`, verbatim. I probed 12 arg shapes: nothing widens the cap past 12 —
`undefined/null/NaN/Infinity/{}/'abc'` → 12, `'2'` → 2, and `0/true/-3/''` fail *closed*.

**Finding 2 (ultracode scoping) — fixed as patched**, SKILL.md:93-94, my exact wording.

**New tests are real, not decorative.** Reverting the coercion to the old `typeof` form on
a scratchpad copy fails the numeric-string test and only that one; changing
`reserve(readPairs.length)` to `reserve(targets.length)` fails the runtime-faithful
null-drop test and only that one. The faithful stubs (test.mjs:92-119) now match the
documented `parallel`/`pipeline` semantics and assert what I measured by hand in round 1:
3 reads, 2 research (the dropped read is never carried forward), 1 judge, `cost.agents` 6.

**Regressions: none found.** `runScript`'s third parameter is defaulted, so all ten
pre-existing callers are unchanged; no new `Date`/`Math`/import/global appears (`Number`
is a plain built-in); meta is untouched and still a pure literal; no label regex added.

Round-1 Notes items (the `/\w\s*\(/` paren false-red, a rejecting judge taking the run
down, the unpinned `{scriptPath: ...}` invocation shape) remain open by design — none
blocks merge while the template is "approved, not live".
