VERDICT: APPROVE 022ad490429f1cded167ad1d7400916f4faee60c

Independent delta review — September 23, 2026 (America/New_York). This approves the exact source artifact and its reviewed behavior; parent owns the final full sealed suite and rollout gates. Earlier rejected reports remain unchanged.

## Artifact identity

Integration HEAD was clean at 022ad490429f1cded167ad1d7400916f4faee60c. Decisions files match builder 8484dba7ba08cf30d68b745579c085125481bfff exactly (`git diff 8484dba..022ad49 -- skills/decisions` empty). The delta above the previously inspected artifact changes only decisions-pickup implementation and focused tests. Previously reviewed 0.19.0 metadata, privacy contract, legacy/manual availability documentation and packet Details fix remain intact.

SHA-256:
- skills/decisions/scripts/decisions-pickup.mjs: 380518C57C5FDC4E69501F1BCD8FAA5FE980A1A9A31AE190AA3EB52F20A8937F
- skills/decisions/scripts/decisions-pickup.test.mjs: 4D03221C543119A4871E7B7BBE1114C2030B066C50404C0598D2894D7A9EE5AE
- skills/multi/scripts/note-send.mjs: 47574A8871EC243EA29D5671817263703771B4F9F73DC6779F257C9C5F80267A
- skills/multi/scripts/note-send.test.mjs: 0633BDF6B5232272C104E3C70A78868771CCB1467960FE71CEBFC2975CC3B0F1

## Required findings closed

The original corrupt-private-JSON disclosure and missing legacy ACCOUNTED outcome checks were closed in c0e56b0 and independently reverified in the prior follow-up. Their corrected code remains present. This delta closes the remaining diagnostic disclosure paths:
- INVALID page results expose only fixed issue categories, counts and line numbers; warning/shapeless titles are omitted.
- Reader stderr, stdout on failure, arbitrary spawn messages and arbitrary error codes are excluded. Timeout/not-found/access/exit/empty-output classifications remain useful.
- Malformed-page parser messages are replaced with fixed BLIND diagnostics.
- Private/legacy evidence and accounting diagnostics retain fixed classifications. Unknown CLI failures expose only allowlisted codes.
- Transport inspection retains exact envelope comparison internally and emits status/counts; conflicting ledger text is neither returned nor persisted. Successful sender results retain the saved note ID and recorded flag without forwarding external strings.

Reviewed PickupError construction sites, private capture parse/reuse/open/accounting paths, reader/parse paths, transport evidence, filesystem errors, and CLI exception formatting. No remaining blocking raw-content diagnostic path was found in these production flows. Successful explicit open intentionally returns the verified local capture. Existing legacy files/receipts are preserved; this is not a historical-data scrub or migration.

## Independent adverse verification on exact integration

Used disposable makeTempHome({gitIdentity:false}) fixtures with synthetic private canaries. No live private state, source edits, network/provider calls, installed hooks, external sends, or full-suite run.

Passed:
1. Prior missing-default title reproduction: INVALID result contains useful issue metadata and no private canary.
2. Shapeless-title reproduction: same sanitized boundary, with shape issue count preserved.
3. Six reader failure variants (nonzero stderr, unknown spawn message/code, timeout, malformed status, null status, empty successful stdout): no private canary in error text. Successful reader preserves exact page bytes.
4. Successful synthetic sender returns canary ID/envelope: RECORDED keeps saved note identity without those external strings.
5. Explicit local open returns exact submitted bytes; corrupt private capture returns sanitized status and PRIVATE_CAPTURE_UNAVAILABLE.
6. Accounting still succeeds using required selection refs and the owner attestation after the binding/diagnostic changes.
7. Actual fixture ledger with exact envelope yields MATCH; adding same-ID conflicting private body yields CONFLICT with counts only. ABSENT and injected filesystem UNREADABLE remain distinct.
8. Recovery of each evidence result preserves its prior semantics: MATCH -> RECORDED, CONFLICT -> NEEDS_RECONCILIATION, ABSENT/UNREADABLE -> UNKNOWN. Recovery and a subsequent retry send zero messages in all four cases.
9. Actual runCli status on malformed receipt emits INVALID_JSON without parser input snippets.

Transport summarization changes stored diagnostic representation, not the evidence used to determine delivery. Positive exact comparison still happens before MATCH. Removing successful sender ID/envelope does not replace or recompute the fixed intended note identity. UNKNOWN/conflict recovery still never resends. Owner/from verification permits the pre-owner-binding null capture owner while detecting other mismatches.

## Architecture and remaining boundaries

The repair remains within one existing receipt state machine and store: private immutable evidence, sanitized repository pointer, conservative recovery, explicit local open, and explicit legacy refusal. Fixed diagnostic classifications and the shared outcome verifier do not create a parallel work ledger or execution engine. No further redesign is needed for this change.

This approval does not claim unattended activation, automatic continuation, cross-host private evidence access, Windows ACL enforcement, legacy cleanup, or completed owner consequences. The full-suite result must be attached by its owner before integration release.
