# Explain optional source omissions without changing installation policy

Outcome: an installer dry run exposes which optional source skills it could not use, while preserving successful optional installation and avoiding false claims about installed capabilities.

Scout: the existing `collectSources()` silently omits knowledge/triage/learn when `isSkillDir()` fails. Existing JSON `actions` is the diagnostic channel; `refusals` determines failure. Source inspection and an isolated empty-home reproduction are recorded in the September24 reassessment report.

Territory: builder owns only `scripts/mirror-shared-skills.mjs` and `skills/multi/scripts/mirror-shim.test.mjs`. Parent owns records, evidence, version/release files. Reuse existing functions/logging; no API, manifest or capability registry changes. This small low-risk diagnostic needs no contract stubs or separate architecture review.

Contract: each unusable optional source yields an informational actions entry naming the skill and filesystem-supported reason. Missing source, missing SKILL.md, wrong file type and other filesystem inspection errors must not be confused with missing installed destination. Optional omissions remain nonfatal. Existing bundled-source failures, usable sources, install ownership, uninstall, dry-run no-write behavior, and JSON shape remain unchanged. Do not add broad reads or permission changes simply to classify an optional source. Report inspection failures precisely rather than asserting an unobserved cause.

Acceptance: existing isolated fakeEnv tests exercise absent sources and a directory without SKILL.md; verify named diagnostics, ok:true, no refusals and no dry-run writes. A usable optional source must remain selected. Tests must fail against prior silent behavior. Run focused mirror tests only; parent owns the sealed full gate. No production writes by builder.

Builder ETA3min/cap8min, independent review after builder completion. Parent may run an independent adversarial CLI test instead of duplicating builder assertions. Hypothesis: an operator can explain optional-source omissions from the existing JSON response without interpreting successful installation as coverage of every skill. This diagnostic is not evidence of improved delivery throughput.
