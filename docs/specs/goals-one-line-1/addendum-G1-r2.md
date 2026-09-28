# G1 round 2 addendum (lead rulings on reports/G1-review.md)

You are a fresh builder. Read, in order: brief-G1.md (the base mandate, all its rules apply), spec.md, reports/G1-state.md (the previous builder's state), reports/G1-review.md (the ONLY source of what to fix). First commit the review file: git add it, commit "docs(specs): G1 review r1".
- M1: apply the reviewer's RECOMMENDED fix verbatim (the latest standalone ISO date, file-name dates excluded), add its test, and regenerate fixtures/goals-page.expected.md. Check that the regenerated rows match the reviewer's predicted dates, and list them in your report. Also re-run the render on the real docs/GOALS.md and list the 12 rows' dates.
- M2, L1, L2, L4, L5: apply each ready patch verbatim, with its test.
- L3: add the reviewer's three sentences to the "Releasing" paragraph of docs/pane-setup.md (only that paragraph).
- No shell scripts, no rm or any deletion, no sed -i or perl -i. Edit with the Edit/Write tools.
Gate: goals-mirror + decisions-read tests, then the full suite once into reports/G1-r2-gate.log, 0 fail. Commit (code and docs separate from the gate log), push.
Report: reports/G1-r2-report.md, line 1 `DONE <sha of the last code commit>` or `BLOCKED <reason>`, then a per-finding table (finding, disposition, file:line, test name) and the 12 real rows. State: reports/G1-r2-state.md. ETA 40 minutes.
