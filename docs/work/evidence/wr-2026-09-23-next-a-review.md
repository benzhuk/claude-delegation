VERDICT: APPROVE d8209924c3f93691c53c600c4671921d44238031

Independent source acceptance review for wr-2026-09-23-next-a. Exact checkout HEAD verified. Inspected the final implementation delta and its regression; reran the external adversarial harness against this exact commit. All 38 independent checks pass. No remaining material contract failure found within the reviewed scope.

Cause: prior gate could count a lazy list continuation as top-level metadata because a preceding Predicts label lacked its own paragraph-start requirement.
Discriminating check: '- Example paragraph\nPredicts: example only\nObserved: example only' now rejects; valid body-start and postblank Predicts/Observed paragraphs and postblank Observed remain accepted.
Fix location: scripts/work-record.mjs:416, predictsStartsParagraph requires Predicts at body start or after a blank; scripts/work-record.test.mjs adds the exact regression.
Simplification: a paragraph-boundary predicate completes the documented narrow metadata contract without adding a Markdown parser or further special-case machinery.

Independent validation: 38/38 external synthetic checks passed under makeTempHome({gitIdentity:false}) with checkSeal; one sequential Node harness; disposable target repository separate from the plugin source. Controls cover fenced/quoted/list/indented examples, metadata placement, empty and populated duplicate/unknown headers, missing required fields, end-anchored deciding verdicts, contradictory current evidence, historical/supporting PASS/FAIL reports, abbreviated SHA and em-dash approval, explicit pin vs moved live ref, mutable pin refusal, named-ref ambiguity with warnings disabled, noncommit/missing revisions, unavailable Git, injected unreadable evidence, lexical/realpath junction escape, directory evidence, normal import, historical validator compatibility, and actual CLI invocation against the distinct target. Gate input record/report bytes remained unchanged. No full suite run and no reliance on builder test counts.

Probe source: C:/Users/benzh/AppData/Local/Temp/astra-build-0923/next-A-final-probes.mjs
Results: C:/Users/benzh/AppData/Local/Temp/astra-build-0923/next-A-probe-results.json

Caller inspection retained: team-build Ship invokes the plugin-root executable with explicit target root after authorized integration and successful gates, immediately before accepted; refreshed check required after changes. Source-versus-merge review responsibilities and non-code evidence remain explicit. This approval establishes source gate behavior, not integration authority, installed behavior, host runtime support or goal satisfaction.

Limits: named-ref ambiguity exercised with real divergent branch/tag refs; a cryptographic SHA-prefix collision was not synthesized. Unreadability used injected EACCES rather than modifying platform ACLs. The owner-approved narrowed Observed paragraph contract is the review boundary.

Cleanup: scratch repositories and sealed homes removed, checkout git status clean. No source edits, live-home changes, commits or identity mutation by reviewer; only requested temp probe/report artifacts retained.
