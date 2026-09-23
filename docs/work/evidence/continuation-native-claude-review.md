VERDICT: APPROVE bcbf4660e4d3c833ab549c86580e59324fc1cb18

## 1. Scope and source revision

- **Revision:** The packet covers the diff `99fc5cc..bcbf4660e4d3c833ab549c86580e59324fc1cb18` and the full post-change text of the three files. The session's git snapshot matches this: HEAD commit `bcbf466` ("fix: continue ongoing authorized work") with parent `99fc5cc`. As the packet instructed, I read only the packet. I did not check the repository tree, rerun `quick_validate.py`, or rerun `git diff --check`. The builder's validation claims are reported, not checked by me.
- **Territory:** The diff changes only `skills/continue/SKILL.md`, `skills/team-build/SKILL.md` and `skills/delegate/SKILL.md`. It adds no scripts, scheduler, hooks, framework, goal store, records or metadata. This matches the contract.
- **Frontmatter quoting:** The only change beyond the contract text is quoting in the team-build and delegate descriptions. In delegate, the inner `"…"` phrases also became `'…'`. The meaning is unchanged, it is inside owned files, and it was needed to pass the required validator. Acceptable.
- **Contract coverage:**
  - The `continue` description now covers "pauses, wave closeout, and status turns", so discovery is no longer limited to resuming.
  - The old four steps were rewritten in place, and the old stop paragraph was replaced rather than followed by a second one. There is no duplicate policy.
  - Step 1 lists every reconciliation input the contract asks for: goal and acceptance evidence, owned work, pending review or integration, unmet requirements, and external blockers.
  - The three stop conditions match the contract.
  - The two caller skills each add three lines that point to `continue` without copying it.
  - There is no wake promise and no per-tool-call reporting ceremony.

## 2. Scenario routing under the changed skills

1. **Source wave shipped, native-host review ready → start the native review now.** The team-build closeout paragraph sends the orchestrator to `continue` before it declares the wave complete. `continue` step 1 says a shipped release or exhausted wave does not complete the goal. Step 2 says to start independent ready work. A shipped wave has integrated records, so the team-build "no new wave" gate doesn't block the review. Other free, disjoint capacity also gets refilled.
2. **One native trial denied, independent source gap ready → start the source gap.** Step 2 says "a decision blocks only its dependent item," and step 1 lists a failed trial as not a stopping point. The delegate addition adds that "one blocked lane does not end the goal." Only the denied trial waits: the orchestrator prepares reversible work and asks for authority. Step 3 says an unanswered request grants nothing, so the trial is not retried without new authority.
3. **Status request during a running build → reply briefly, keep working.** Step 4: "Answer a status question concisely, then continue active work unless the user pauses, stops, or changes scope." The build keeps running and review spawns and refills continue. The reply is not a closeout, which the delegate status-closeout line also covers.
4. **Empty ready queue, scoped goal outcomes unmet → investigate the outcomes' dependencies.** Step 3 says to inspect the dependencies of the unmet outcomes, then either open finite useful work (step 2 prefers existing records, a bearings next action, or a scoped goal item) or record concrete blockers. If there is still no credible work, the Bearings seam applies. Step 2's "never fabricate activity or recursively expand scope" keeps this bounded.
5. **Every remaining item blocked externally → stop, with evidence.** The stop evidence is the step 1 reconciliation showing:
   - no owned work is in flight, in review or awaiting integration;
   - each remaining useful item maps to a specific external decision or unavailable dependency;
   - the authority request has been made (step 3).

   Those blockers, plus the session and work identity, go into existing records for a later resume.
6. **Finite one-off request completed → continuation does not apply; stop.** The skill is scoped to "authorized ongoing project work" and "ongoing-goal" turns. The delegate and team-build hooks are both gated on "in an ongoing goal". Completion evidence for the requested objective is a valid stop condition, and "no … new objective" plus "never … recursively expand scope" block stretching the request into the project goal. This routes correctly, though only through the "ongoing" qualifier (see ambiguity A).
7. **User explicitly stops → stop.** "Stop only when the user requests it" is the first stop condition, and step 4 treats pause, stop or scope change as ending continuation. No new work starts. Record updates follow team-build's existing rule of updating each record in the same turn as the event.

All seven scenarios reach a clear next action.

## 3. Ambiguity, overreach, duplication, conflict

None of these block approval.

- **A. One-off vs. standing project goal.** `continue` tells the agent to "Read the project's current goal". In a repo with a standing goal, an agent finishing a one-off request might treat that goal as authorized ongoing work. The contract excludes this explicitly ("not to expanding a finite one-off request"). The skill excludes it only through the word "ongoing", with no explicit sentence.
- **B. Team-build's new-wave gate vs. "without waiting for unrelated work".** The Scheduling rule blocks a new wave while any record is `delivered`, `rejected` or `reviewed`, unless a workstream's own record says its prerequisite is met. The new closeout paragraph says to start independent ready work "without waiting for unrelated work to finish." These fit together through the exception clause, but the new paragraph doesn't mention it. A reader could take either rule as overriding the other.
- **C. "Resumption inputs" wording.** The contract asks for "specific dependencies and resumption inputs". The skill says "specific blockers and the session/work identity". It doesn't explicitly ask for the decision or input that would unblock each item. This is probably implied by "specific blockers".
- **D. Dropped sentence.** The old sentence "An empty ready queue is not a completed goal when owned work is still running, awaiting review, or integration is pending" was removed. Its meaning survives in the step 1 reconciliation plus the stop condition (in-flight owned work is not an external dependency), but the explicit link is gone.
- **E. Pause vs. stop.** The skill doesn't say whether an explicit stop ends in-flight subagents or only stops new starts. The user's own wording should decide, and the existing TaskStop hygiene covers the mechanics. This is acceptable to leave as it is.
- **Overreach:** None found. No runtime claims, no authority is granted, and the discovery surface isn't widened beyond ongoing work.
- **Duplication:** None. The caller additions only point to `continue`, and the Bearings seam complements step 3 rather than repeating it.

## 4. Required fixes

None. These optional one-clause changes would reduce the ambiguities above:

- **For A:** In `continue`'s intro, add: "A completed finite request is not an ongoing goal; do not extend it into the project goal without authorization."
- **For B:** In team-build's new paragraph, change "start independent ready work" to "start independent ready work that meets the Scheduling new-wave exception".
- **For C:** In the stop paragraph, change "Record those specific blockers" to "Record each specific blocker, the input that would unblock it,".

This is behavioral review of the instruction text. It is not evidence that the runtime will always comply, not evidence of native write permission, and not evidence of installed discovery.