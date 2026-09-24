Work: wr-2026-09-23-native-instruction-review
Scope: shipped0.20.0 instructions at8b4ea6f1d376ab90271bc6f80a3a523a7aa746cf
Owner: skills-a
Status: rejected
Authority: Ben authorizes useful native project work; disposable review only, no production configuration or external publication
Artifact: none
Evidence: docs/work/evidence/native-instruction-review-partial.md
Next: original native review failed and is not retried for a green result; verified Codex source leads are handled in instruction-consistency, whose new artifact receives its own independent review
Opened: 2026-09-24T03:18:26Z
Builder: Claude Sonnet native provider
Rounds: 1

Predicts: One corrected native run supplies a useful instruction review and directly observed binding/accounting without identity injection or out-of-band repair.
Observed: Prediction falsified. The persistent session emitted current identity on PostToolUse, but the disposable prompt wrongly limited admission to UserPromptSubmit. No bind occurred. At180.046seconds the runner terminated active work with SIGTERM before Write, verdict, account or Stop. The placeholder is unchanged. One actual Bash denial exists despite an empty incomplete summary list. Completed blocks report8input,20,263cachecreation,46,595cacheread and6,288output tokens; an unfinished request has no completed usage or final cost. These are partial usage, not a full price or zero-cost result. No Claude review verdict is claimed. Separate Codex source leads were independently inspected and admitted as finite correction work.
