# Consistent scheduling, review and pacing instructions

Goal: faster useful delivery with evidence-based acceptance. A failed native policy-review attempt left concrete Codex source leads; do not call them Claude findings. Root adjudication accepts the scheduling, review-tier, environment-ownership and ETA conflicts below. This is a bounded in-place instruction repair, not another runtime mechanism or provider trial.

## Territory and exact changes

One mid-tier builder owns only `skills/team-build/SKILL.md`, `docs/agent-pacing.md`, `docs/subagent-contract.md`.

- Replace the global new-wave barrier with dependency-specific admission: work consuming delivered/rejected/unintegrated prerequisites waits for those exact prerequisites; disjoint ready work proceeds under the continue skill. Keep work records current and named dependencies explicit. No new queue or scheduler.
- State that high-tier-authored risky work receives top-tier adjudication, consistent with the existing tier table. Default mid builder/high reviewer remains; low-risk exceptions remain explicit. Do not bulk-upgrade every reviewer or change model IDs.
- Separate orchestrator ownership/authorization of environment changes from routine command execution by an authorized scoped executor. Preserve user authority and credentials/access boundaries; this change creates no grants.
- Remove the unconditional instruction to kill a reviewer merely because no report exists at ETA. ETA triggers a bounded progress check; real progress can justify a recorded extension under the shared pacing ladder. A hard user/project budget remains binding. Wrong approach, documented stall or exceeded hard limit permits stopping/recovery. Never infer dead from silence alone when native work is observably in progress. Preserve one check per ETA window, no polling/wake loop.
- Resolve contradictory report-reading advice: inspect load-bearing verdict/evidence even on success, with deeper detail proportional to the decision. No requirement to read every raw green log.
- Prefix normalization at copy time must never manufacture an approval. Preserve original report bytes/provenance. A wrapper may format an already explicit verdict and exact artifact, with attribution; it cannot infer missing verdict/identity from a chat reply, tests, or parent judgment. If approval is actually absent or ambiguous, get the author’s explicit verdict. Do not impose ceremonial retries for harmless report formatting.

## Boundaries and acceptance

No new scripts, tests that mirror prose, benchmark, state store, installer, native runner or goal changes. Edit conflicting clauses in place rather than append another policy layer. Retain existing inline-report fallback and role-specific cleanup. The earlier failure to bind was a disposable brief's UserPromptSubmit-only restriction; the shipped continue skill permits native hook context and does not need a new callback workaround.

Builder runs the available skill validator for team-build and `git diff --check`, captures actual exits and commits only its territory. Independent high-tier review exercises written scenarios: unrelated work during another lane's rejected fix; dependent work held; progressing reviewer past ETA; a real hard budget; missing verdict versus format-only normalization; high-tier builder adjudication; authorized mechanical environment step. Preserve existing user/model authorization rules. Root owns version, records, release, mirror and publication. Since executable bytes are unchanged, focused instruction validation and scenario review are the relevant gate; no repeat full source suite solely for prose.

Prediction: each scenario has one consistent next action across the caller skill and shared contract without waiting for unrelated work, killing observed progress at an estimate, or inventing approval evidence. This is instruction consistency, not proof of live model compliance or a speed comparison.
