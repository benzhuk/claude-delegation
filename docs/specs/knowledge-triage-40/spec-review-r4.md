VERDICT: APPROVE 6fa1b4d5aab800ae51b7e37141217bc382a1f7f7

# Lane40 rev4 delta spec review, round 4 (Opus)

Reviewed SHA: 6fa1b4d5aab800ae51b7e37141217bc382a1f7f7, directory docs/specs/knowledge-triage-40.

Scope: this review covers only the three round-3 corrections (N1–N3), the refreshed builder and tests briefs, and whether the remaining gates are stated honestly. The broad review closed in round 3 is not repeated.

**Inputs read (Read/Glob only):**
- spec-review-r3.md, spec-r3-adjudication.md, spec-r1-adjudication.md
- contracts.d.ts, rev4.md
- builder-brief.md, tests-brief.md, lock-owner-delivery.md
- probe-r3-report.md (grepped for the verdict, the digest line and the scope-of-proof lines)
- spec-review-r4-brief.md

**What I did not do:**
- No Bash, Git, SSH, nested agents, config or secret reads.
- I did not read the live skill or the original false-positive brief.
- I made no searches that were denied before, and none of my calls were denied.
- My only write is this report.

## Answer to the JUDGMENT

Yes. All three corrections were adopted in the exact form proposed in round 3, or in a form that is stricter. Each one closes its failure case. None adds a mechanism, and none weakens a guard. I found no blocking defects.

## N1 (no-change remote mismatch): CLOSED

The correction is at spec-r1-adjudication.md:23, and it matches the round-3 replacement word for word.

- **The deferral is limited in scope.** It applies only "In a run with no DIGEST change". It covers a HEAD/remote-ref mismatch or a failed remote-ref read. The run sets `publication.verified=false` with the reason, makes no note eligible, moves no origin, is "not ATTENTION", and "the next run retries".
  - `RunReceipt.publication.{verified, reason}` (contracts.d.ts:61-64) carries this without a new field.
  - A sync window between machines therefore delays reconciliation by one run. It does not halt the job.
- **Escalation for a changed DIGEST is preserved.** Each of these still records ATTENTION plus one outer BLOCKED to Ben:
  - a changed DIGEST without its source-path commit;
  - a remote ref mismatch after that publication;
  - a secret-check failure;
  - a push failure.

  "Subsequent runs skip while ATTENTION remains" now applies only to those cases.
- **The fail-safe direction is intact.** Per-note eligibility still requires HEAD to match a fresh remote ref (:21). So neither branch can reconcile a note falsely.
- **The tests brief carries it.** tests-brief.md:8 names "no-change remote mismatch deferring reconciliation without ATTENTION".

## N2 (terminal, residue and token shapes): CLOSED

contracts.d.ts matches the round-3 patch exactly:

- **Terminal count.** `HostResult.terminal: number`, defined as superseded plus origin missing first reported this run (:14). This matches the "once in the receipt's terminal list and host row" rule at spec-r1-adjudication.md:33 and the receipt's `terminal` list at :72.
- **Host on every residue entry.** Every residue entry is now `{host, name}`, and `unresolved` also has a reason (:66-70). `managed` also allows `'local'`, which fits F1, where managed names come from the local chezmoi source listing.
- **Token formula.** It is explicit: `total = input + output + cacheRead + cacheCreation` (:44). The `{unavailable}` branch is unchanged, so no zero is ever invented.
- **Result.** T1 and T2 now share one shape for every per-host item and one token formula.
- **Tests brief.** tests-brief.md:8 names terminal outcomes, named oversize residue and `digest entry missing` residue.

## N3 (slug pin proven by the probe): CLOSED, and stricter than proposed

spec-r1-adjudication.md:19 now requires two things:

1. **The exact sentence.** Both the production nested prompt and the next diagnostic prompt must carry: "For each selected note, use its exact filename without `.md` as the skill's note-slug."
2. **A literal match.** The diagnostic passes this point only if its quoted DIGEST line matches the literal matcher `· <filename-without-.md> →` for the selected filename. A mismatch is probe failure evidence and is adjudicated before the builder starts.

This is stricter than my round-3 text in one way: the sentence itself is pinned, so production and the probe cannot drift apart in wording.

**R3's PASS is scoped honestly:**
- spec-r1-adjudication.md:57 says R3's prompt lacked the instruction, so R4 must carry it and pass the matcher before the main builder starts.
- spec-r3-adjudication.md:9 says R3's matching digest line (probe-r3-report.md:37, `2026-09-29 · 2026-09-01-selected-finch-r3 → …`) must not be relabeled as proof of the instruction.
- It also requires R4 to use a distinctive host/hash-prefixed selected filename. This matters because a plain dated filename is exactly the kind of slug the skill might produce anyway, so a match on it could be coincidence.

**Both briefs gate on R4:** builder-brief.md:4 and tests-brief.md:4 name probe-r4-report.md, which "must pass the explicit slug-pin matcher gate".

## Refreshed briefs: verified

These are the round-3 stale items, each checked at this SHA:
- **Deciding probe.** Both briefs now name R3 plus R4. The old R2 reference is gone.
- **Retired reason.** tests-brief.md:8 says "no-alias versus pending reasons". The retired `denied` reason is gone.
- **Missing test cases.** tests-brief.md:8 now lists terminal outcomes, oversize residue, `digest entry missing`, PT2H and the N1 no-change mismatch.
- **Start signal.** builder-brief.md:1 and tests-brief.md:1 both say they are prepared mandates, not start signals.

## Remaining gates, stated honestly (not findings)

1. **R4 diagnostic PASS, before the main builder starts.** It runs independently, and its report is absent at this SHA. That is an execution gate, not a spec defect. PASS requires the exact sentence in the prompt AND a literal matcher hit on the distinctive selected filename.
2. **G2: one-file dotfiles delivery before G1.**
   - Owner: skills-a (spec-r3-adjudication.md:13, lock-owner-delivery.md).
   - Candidate: 727e60d, one file, source hash 967b3d….
   - Scope: no whole-tree apply, and no claim that it is installed.
   - lock-owner-delivery.md:7 correctly states that R3 performed no live apply, push or Git publication.
   - The owner gap I raised in round 3 is now closed with a named owner and a concrete request.
3. **Main code, then focused gates, then Opus source review.**
4. **G1: manual desktop live proof**, the first real test of Git and chezmoi publication.
5. **G3: host gates.** Mac stays `'pending'`.
6. **G4: post-release install sequence (F8).**

## Non-blocking observations (no failure that loses data; optional)

- **O1: a persistent no-change mismatch is visible but never escalated.** If the local dotfiles HEAD stays ahead of the remote (for example, Ben has unpushed dotfiles work), N1 defers every run. Each receipt shows `publication.verified=false` with a reason, and the origins stay pending. Nothing is lost, and the pending counts make it visible. Real publication failures still escalate through the changed-DIGEST branch. If a census later shows long deferral streaks, a streak escalation could reuse the existing `deferredConsecutive` pattern. That is not needed now, and adding it now would be a new mechanism without a measured need.
- **O2: a failed remote-ref read in a changed-DIGEST run is not named explicitly.** Read literally, :23 lists "remote ref mismatch after that publication" for ATTENTION. A read failure is not a mismatch, so a literal builder treats it as unverified and retries. Either reading is fail-safe, because eligibility still needs a fresh match (:21). No note is ever falsely reconciled, and the next run re-verifies. No change is required. If the builder is unsure, it should choose retry, which matches N1's intent.

## Verified absences (first-class)

- **No new mechanism.** N1 reuses `publication.{verified, reason}`. N2 adds one count field and qualifies existing residue entries with the host that is already known where each entry is found. N3 reuses the diagnostic that was already scheduled.
- **No weakened guard.** Nothing adds allowed tools, changes the permission mode, copies config, discovers aliases or reruns a denied search. Escalation for real publication failures is unchanged.
- **No overclaim.** R3's PASS is explicitly narrowed. R4, G2, the live proof and installation are each stated as open gates, and nothing claims they are done.
