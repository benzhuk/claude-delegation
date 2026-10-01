Task: Review the one-sentence prospective recipe candidate and the separate R2 adjudication under the peer's clarified acceptance criterion. No live verification.
Goal: Complete the existing lane without speculative repairs, lost evidence or a weakened preservation contract.
Work: wr-2026-09-29-knowledge-triage.
Inputs: publication-recipe-report.md, acceptance-criterion-ruling.md, live-proof-r2-clarified-adjudication.md, live-proof-r2-report.md, acceptance-boundary-report.md and acceptance-boundary-adjudication.md in docs/specs/knowledge-triage-40. Candidate path and exact sha are in publication-recipe-report.md. Inspect only its SKILL.md and one-file git diff; do not inspect configuration or helper bodies.

JUDGMENT: Approve or reject the exact prospective instruction and the evidence-to-criterion mapping. Guard against a check that passes because it is not looking and an unknown rendered as a confident outcome.

Verify:
- Exact peer sentence, single-file delta, fresh base, no scheduled amendment or unrelated edits. Inspect placement: does the sentence preserve existing mandatory preservation/pre-staged checks, exact-file add, staged verification, hash verification and lock release? If the supplied wording conflicts, report exact text and smallest clarification for the peer; do not rewrite the candidate yourself.
- Original R2 report remains FAIL and unchanged. Later criterion clarification is explicit. Recipe-step PASS is conditional on delivery and distinct from global lane acceptance. One improvisation denial remains recorded, not erased.
- The allowed mapping is only from the inspected recipe/runner and existing nonsecret R2 report. No claims about private user instructions, unknown model intent, guaranteed future zero denials, knowledge quality or cost savings.
- R3 is optional under the new ruling and not being run. No new permissions are inferred.

NOT: no source-helper reads, grep or search for configuration filenames, protected files, user settings/instructions, raw transcript, environment enumeration, guard test/replay, live run, SSH, shell execution of recipe, lock, delivery, Notion, source edit or record edit. Prior reviewer config-filename search was refused; it stays stopped. Use only the explicit plain document paths and git metadata/diff for the named candidate. A refusal stops the operation with no substitution.
Evidence: verdict APPROVE or NEEDS_FIXES first, exact dotfiles candidate sha, literal-diff findings, severity with file:line references and concrete corrections if needed. Report whether clarified R2 evidence supports the proposed conditional adjudication. No bug-fix production fields required: this is a prospective prose/policy clarification review.
Autonomy: plain-file reads and git diff/status/show limited to named candidate/file. Only report write allowed. No tests are necessary for this textual amendment; synthetic or live tests are outside scope.
Un-agent-able steps: peer-owned delivery and later acceptance are outside this review.
ETA: 5 minutes. Termination: write review-run's report and stop.
