MIRROR SEAM: ADD INTERRUPT; NO UNCONDITIONAL CAPABILITY GATE JUSTIFIED

Read-only source assessment at75c1dafaabfc87efeb711cebbe5f443b121d226b, September 23, 2026, America/New_York.

scripts/codex-hook-trust.mjs CODEX_EVENTS has only SessionStart, UserPromptSubmit, PostToolUse and Stop. The mirror installer uses this list for hook configuration and trust, so it does not install the native package's new Interrupt handler. Both routes execute the same now-enabled adapter.

Core consequence: Interrupt is the explicit transition setting phase stopped, clearing binding and incrementing generation. Without that event, cancelled scope can remain active/pending in the local state until a new prompt or SessionStart. Old-epoch CLI bind/account can still satisfy epoch/phase checks during that interval. This is a state-lifecycle mismatch inferred directly from core branches; no claim of a native unauthorized continuation is made here.

Automatic correction consequence is narrower: native cancellation bypasses Stop under the qualified host contract, no core scheduler exists, Stop/PostToolUse require exact current native episode identity, and the next new prompt replaces binding/epoch. Thus missing Interrupt alone does not establish an automatic stale correction on normal cancellation. There is no reason to invent a new unconditional capability flag or disable both routes solely for this configuration difference. Native cancellation races remain controlled by host behavior and existing atomic state transitions, not a guessed route field.

Required source parity: add Interrupt timeout3 to mirror CODEX_EVENTS and update exact event/trust expectations, including non-destructive merge/idempotence. Use the shared adapter; no per-hook platform workaround. This makes immediate cancellation disarm behavior consistent with the native package. An existing four-event installation must receive its normal authorized mirror configuration refresh to obtain the handler; a source adapter update alone cannot rewrite existing hooks.json. Do not automatically edit production configuration as part of this read-only review.
