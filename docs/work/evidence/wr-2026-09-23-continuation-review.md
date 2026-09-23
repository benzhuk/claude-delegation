VERDICT: APPROVE bcbf4660e4d3c833ab549c86580e59324fc1cb18

Work: wr-2026-09-23-continuation-correction
Independent behavioral review of source diff 99fc5cc..bcbf4660e4d3c833ab549c86580e59324fc1cb18. Release metadata inspected separately at 7998e62e1617a717ffb3fb2f914383c48aefcd45. Read-only inspection and one read-only collectSources import; no suites, model calls, installation, configuration changes, or source edits. The failed native Claude capture provides no verdict and is not evidence for this judgment.

Judgment

The changed instructions support the correct next-work decisions in all seven required scenarios. Canonical policy remains in skills/continue/SKILL.md; callers only route to it. No blocking source findings or required fixes.

Scenario decisions

1. A wave ships while independent native work is ready: start the finite authorized native work, subject to identified host capability, ownership, and capacity. Shipping alone cannot establish goal completion (continue:12-13); team-build:252-254 explicitly routes release/review closeout back to this decision. A native trial remains bounded by continue:19, so source shipping does not prove native restart capability.
2. One trial is denied or blocked, while an independent source gap is ready: record the denied trial and work the independent gap. continue:13 makes a decision local to its dependent item; delegate:87-89 explicitly prevents one blocked lane ending the goal. continue:14 prohibits treating elapsed time or silence as permission. Do not retry the denied action merely to fill capacity.
3. A status question arrives during a running build: answer concisely, then continue the build and any authorized independent ready work. continue:8,12,15 explicitly cover status turns. A status question is not a cancellation; a status request that also says stop is governed by the stop exception instead.
4. Ready queue empty, scoped required outcomes unmet: inspect those outcomes and dependencies, then open/select finite work if available or establish concrete external blockers (continue:12-14). Empty queue alone cannot justify success. If no credible work emerges, continue:25 routes to bounded bearings reassessment; continue:13 forbids fabricated activity and recursive scope expansion. Internal pending review/integration is owned work to reconcile, not automatically an external blocker.
5. Every useful remaining authorized item has a real external blocker: stop with the specific blockers and session/work resumption identity (continue:21). Do not invent cleanup, extra investigations, or repeated permission requests merely to remain active. The criterion is every useful authorized item, not one failed lane.
6. Completed finite one-off request: finish and report completion, without enlarging the task into an ongoing project. The discovery description and caller conditions explicitly target ongoing goals (continue:3,8; delegate:87; team-build:252). Even if consulted, continue:21 permits stopping on completion evidence and continue:13 prohibits recursive expansion. A broader project aspiration does not enlarge the user's finite authorization.
7. Explicit user stop: stop, even if ready work remains (continue:15,21). This is an independent stop condition, not conditional on goal completion or blockers. A pause also stops active work via continue:15. No continuation clause overrides the user's scope or authority.

Adversarial seams

- team-build:158-161 retains its existing no-new-wave rule but explicitly exempts a workstream with met prerequisites recorded on its own record. This is compatible with continue:13 and team-build:254: continue independent work while recording prerequisites; do not launch dependent work on unintegrated changes.
- continue:14 requires preparing reversible work before a permission boundary, but still requires finite authorized usefulness through steps 1-2. It grants no new external authority. The permission clause is not a blanket instruction to re-ask for authority already granted.
- continue:8 and 19 explicitly disclaim scheduler/wake-up capability. These prose changes improve active-turn decisions; they do not guarantee model compliance or automatic resumption.

Discovery and mirrored layout

Source name/description at continue:2-3 expose ongoing execution, wave closeout, and status turns. Both callers reference the same skill name rather than duplicating a second algorithm. In the plugin repository, skills/continue/SKILL.md is present and README:63 identifies /delegation:continue.

scripts/mirror-shared-skills.mjs:77 includes continue, delegate, and team-build. Its collectSources function at lines 277-282 resolves all three from repository skills/<name> to ~/.agents/skills/<name>. A read-only import independently confirmed all three source files exist and the expected sibling destinations resolve. Thus the package's mirrored layout preserves canonical named routing without a repository-only path.

Deployment limitation: this machine's current ~/.agents/skills/continue/SKILL.md is absent, while delegate and team-build exist. This review approves the source artifact and mirror mapping, NOT successful installation or installed-host discovery. A release claiming installed behavior must mirror/install and verify the applicable host separately; no installation was authorized within this review.

Release metadata

7998e62 changes only .claude-plugin/plugin.json, .claude-plugin/marketplace.json, and README.md. Both manifest versions agree at 0.17.1, both descriptions accurately add ongoing continuation through wave/status closeout, and both retain the no-scheduler/no-two-host-validation qualification. README's skill summary matches the source behavior. README's changelog still begins at 0.17.0; adding a 0.17.1 entry would be a useful optional documentation polish, not a behavioral or version-consistency blocker.

Validation limits

The builder reports skill-validator and diff checks passing; I did not rerun those gates or treat them as behavioral proof. This verdict derives from the actual source instructions, caller interactions, independent scenario decisions, and read-only mirror mapping inspection.

