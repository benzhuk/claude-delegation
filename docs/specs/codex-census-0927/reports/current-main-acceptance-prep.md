VERDICT: PREPARED

# Current-main acceptance preparation

Read-only contract audit of `origin/main@78bf171d247352fbb43601dc48db5ba2f68df631`, September 27, 2026, America/New_York. This is preparation only: it does not modify the record, run `accept`, or assert that the current rejected integration artifact can be accepted.

## Fields and review evidence required for this record

`wr-2026-09-27-codex-census` is strict because its `Opened:` is after `STRICT_FROM` (`2026-09-27T08:32:15Z`). A future acceptance must satisfy all of these against the then-current reconciled delivery artifact:

- `Base:` exactly one 40-hex SHA. The existing pinned base is structurally valid.
- Real non-placeholder `Lead-session:` and `Spec-session:` IDs. The current record supplies both, but this is not a fresh validation.
- `Spec-from:` must be a UTC ISO instant ending in `Z`. The existing `2026-09-27T11:05:00Z` has the required syntax.
- `Worktree:` must identify a worktree containing the future delivery SHA; `Artifact:` and delivery identity must resolve through Git.
- A strict `Log: ... reviewed ...` line dated on/after the cutoff must include a recognized high/top-tier model token and `APPROVE`. There is **no `Reviewer-model:` header field** in current main. The model belongs in the reviewed log note, for example `GPT-6-Astra reviewer APPROVE` if that is the actual reviewer. Every non-`SKIPPED` reviewed log line in scope needs a counted model token.
- In-repository `Evidence:` paths must exist and each evidence file's first line must begin `VERDICT:`. A code-mediated acceptance also needs its exact accepted log line naming the 40-hex artifact.

## Census and four-read inputs

A code-mediated acceptance requires exactly one of `--census <recognized report>` or `--no-census <reason>`, and writes `Census:` lines. This census work should provide the recognized current census rather than inventing a skip reason; its exact final artifact path has not been selected here.

`--four-read <json>` is optional in the generic acceptance command but, if supplied, must contain exactly the current four-number `numbers[]` contract in its fixed order: `topTierTokensPerBuild`, `hoursAskToAccepted`, `reworkAfterAcceptance`, `workLostOrStalled`. It writes four `Four numbers:` lines. The current main’s stall-word rule applies when a dated record log within the acceptance window names `hung`, `stall*`, or `relaunch*`: then the supplied Work lost or stalled value must start with a non-zero integer, or the record body must carry a `Stall:`/`Gap:` explanation. Without a four-read input, the check is visible warning-only, not a fabricated zero.

The Codex census’s model-attribution PARTIAL result remains non-acceptable as a census input; the test-only `ac67a1a` repair confirms that acceptance correctly refuses it. The current lane-12 spec slice is documented partial because its original Spec-from source was non-date; it is not evidence that a final acceptance census is complete. No numerical value is proposed in this preparation.

## Cross-lane limit

The unresolved main refresh combines C3’s Codex adapter with main’s Claude R6/R7 source. A future four-read must preserve both behaviors. Until reconciliation, review, and fresh gates establish the exact JSON output and the final census artifact, the record cannot safely name a current census/four-read path or add acceptance review logs. This is a required cross-lane reconciliation dependency, not a supported Codex exception.
## Evidence header delta

Current main parses `Evidence:` as a comma-separated list and opens **every listed path**. Each listed file must exist inside the repository and its first line must begin `VERDICT:`. A raw `.log` or `.exit` file therefore is permitted as durable repository material but must not itself appear in `Evidence:`: it does not satisfy the first-line verdict rule. A verdict-bearing wrapper may link the raw files in its body. For example, the preserved `docs/work/evidence/wr-2026-09-27-codex-census/sealed-cross-host-f1908a0.md` is a wrapper; its associated raw host logs/exits remain linked evidence, not direct header entries.

For a final acceptance, the record should list only verdict-bearing paths, including a fresh final review report whose first line is `VERDICT: APPROVE <exact reconciled artifact SHA>`. Historical C1 (`a6bd550...`) and C3 (`7d50ab0...`) approvals, and the rejected `f1908a0` sealed wrapper, cannot decide a later reconciliation SHA. The acceptance checker ignores non-deciding verdicts for approval, but every listed path still must meet the `VERDICT:` first-line shape.

## Strict reviewed log preparation

The durable C1/C3 reports name only September 27, America/New_York; their shared preservation commit has author timestamp `2026-09-27T08:36:06-04:00`, which is not proof of either reviewer’s completion instant. `reports/work-record-test-review.md` is an exact `ac67a1a` approval but likewise records no ISO review time or reviewer model. These files do not supply a truthful exact reviewed-log timestamp for a future reconciled artifact.

When the fresh reviewer reports the actual completion instant, the record’s strict log must use that actual UTC instant and the actual high/top model token, for example the shape `Log: <actual-UTC> reviewed <reviewer-owner> GPT-6-Astra APPROVE artifact <reconciled-40-hex>`. This is a format instruction, not a proposed timestamp or a claim that the existing approvals decide the reconciliation.
## Historical verdicts and deciding evidence

`checkAcceptance` reads every listed evidence wrapper and treats a deciding verdict as a blocker only when that wrapper’s revision resolves to the candidate `Artifact:`. A historical `NEEDS_FIXES`, `FAIL`, or `REJECTED` wrapper at a different SHA does not block a later candidate by itself; an `APPROVE` at a different SHA likewise cannot approve it. A deciding wrapper at the final artifact SHA must be a fresh `VERDICT: APPROVE <final-40-hex>` report. Any matching final-artefact `NEEDS_FIXES`/`FAIL`/`REJECTED` is a blocker.

For clarity and low-risk final acceptance, list only fresh verdict wrappers for the exact final artifact in `Evidence:`. Preserve the historical negative reviews, failed gate receipts, and raw logs in the repository as linked attachments from the fresh wrapper/record body; do not drop or relabel them, and do not use their paths as deciding evidence for the new artifact.