VERDICT: PASS

# toggles72 fix round 3

Applied every reviewer finding from review-toggles72.md (round 2, head 4aaa8329).

- B3: skills/notion-writing/SKILL.md rule 9 (line 89), rule 10 (line 90) and section 7 (line 139) now say `# Waiting on you now {toggle="true"}`; section 7's two leading callouts became `# 🎯 Goals {toggle="true"}` and `# How to read {toggle="true"}`; Done is last inside the Waiting on you now toggle. Line 104 ("TOP of ...") also says "Waiting on you now" for one name.
- B3 optional test: page-lint.test.mjs gains a case that lints the section-7 shape (Goals, How to read, Waiting on you now with Done last, Decided, Parked, Closed without a decision, Information only, Standing asks) and expects `[]`.
- N5: decisions-render-sections.mjs: a Decision line containing `|` is not a verdict; a bracketed `[...]` prediction counts as a pointer. Test added in decisions-render.test.mjs (both unfilled-template probes refuse).
- N6: not changed (safe refusal, as the reviewer said); recorded here with the lead's open question on whether a Bearings refusal should block --clear-done. Known: `- Prediction, check 10/7 3:00 PM: text` in a response without a "Check on" line is refused by the fallback regex.
- N4 stands for the lead (live publish readback).

Gate (focused, 11 files): tests 698, pass 698, fail 0, cancelled 0, leak check 0. Log: toggles72-gate.log.
