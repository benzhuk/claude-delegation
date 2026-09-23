VERDICT: APPROVE 6625865bc0f9c9ac6a5d739f348f4b6e03e82ff7

Independent prose review of `skills/notion-writing/SKILL.md` only.

The addition at lines 98–103 fills the scout's audience-routing seam with the existing canonical pair: the Goals-page template for current goal/subgoals and the Decisions skill for decisions, `To Decide`, `Done`, and comment accounting. It also routes multiple-choice items to the existing decision-item template. This does not create a parallel policy, state page, or decision store.

All three relative targets resolve from the source skill directory and are present in the pinned commit: `../decisions/templates/goals-page.md`, `../decisions/SKILL.md`, and `../decisions/templates/decision-item.md`. The mirror publishes `notion-writing` and `decisions` as sibling skill directories, preserving the same relative layout in the copied Windows installation.

The pre-existing advisor-facing direct-content rule remains unchanged at lines 94–97. The new text explicitly limits itself to writing and hand-back conventions and rejects an automatic update or pickup claim. The diff changes no other file; `git diff --check` is clean. No tests were run and no source was edited during this review.
