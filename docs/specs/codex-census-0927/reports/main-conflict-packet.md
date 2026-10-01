# Main refresh conflict packet

## Verdict

`NEEDS_RECONCILIATION`. The original integration checkout remains in Git's unresolved merge state; this packet neither resolves nor aborts it.

## Exact conflict

- File: `scripts/four-read.mjs`
- Ours: `ac67a1a` (`build/codex-census-1`), containing the approved Codex C3 adapter and host-aware census identity/timeline path.
- Theirs: `origin/main@78bf171d247352fbb43601dc48db5ba2f68df631`, containing Measure Truth Claude R6/R7 agent/task/workflow span and subagent-stall handling.
- Git index stages: base `c540c4e9e075dca1cd35b5510c151c5fe82d6ca1`, ours `dfcca8dba819b33d3979316305d0f2aa0c8e422c`, theirs `54653358c2fa05bb5974b5c6bbc8f2497ce66ea2`.

## Required reconciliation intent

Keep both behaviors in one host-scoped flow:

1. Preserve C3's Codex logical Lead-session validation, verified C1 response timeline, host-specific native-gap wording, and Codex top-tier-message input.
2. Preserve main's Claude R6/R7 span union, waiting-on-agents accounting, and subagent stall scan behavior.
3. Claude transcript semantics must stay intact; Codex must continue consuming C1 census data and must not reread a raw rollout transcript for a parallel discovery/parser mechanism.
4. The existing C3 focused tests and main’s R6/R7 tests need review against the reconciled source before a newly authorized gate.

## Outstanding gates and limits

- The corrected 18-case Codex contract gate passed before the full-suite failure.
- The unchanged sealed full suite failed on Windows and Netcup only because `scripts/work-record.test.mjs` still expected the obsolete `UNSUPPORTED` producer verdict. Its test-only repair is `ac67a1a04cd14f79d0764bc924652738a9fa9d93`, independently APPROVED in `reports/work-record-test-review.md`; it has not been gated.
- No reconciliation source is committed here, no full suite is rerun, and acceptance/main merge remain unauthorized.
- Current `origin/main` is not an ancestor of `ac67a1a`; a reconciled candidate must be produced in the separate C3 checkout, then reviewed and gated. The main-to-lane refresh and reviewed reconciliation are routine authorized work; only a conflict while merging the final candidate into main requires Waiting.