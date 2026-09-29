## Files and symbols
- `hooks/codex-unsupported.test.mjs:27-37` derives Claude `(script,event)` pairs from `hooks/hooks.json`; it correctly reads all groups but ignores matcher identity.
- Its `nativeCommands()` reads the real Codex manifest (`:40-43`), while `assertCoverage()` enforces exact routed-or-unsupported coverage (`:84-103`).
- The premise holds: `nativeRoutes` at `:106-116` is a handwritten list. It is not derived from either manifest, and reverse Codex inventory is only an ad-hoc `Interrupt` allowance at `:131`.
- `hooks/hooks.json:3-120` is the Claude source; `hooks/codex-hooks.json:3-8` has wrapper events plus delete guard. Existing supported and unsupported rows are in `hooks/codex-unsupported.json:2-7`.

## Helpers to reuse
- Reuse `claudePairs`, `key`, `nativeCommands`, and `assertCoverage` from `hooks/codex-unsupported.test.mjs:24-103`; parameterize file/object readers for hermetic manifest copies rather than maintaining an expected list.
- Reuse the production route decision in `nativeRouteForLead` (`hooks/multi-codex-hook.mjs:110-131`). The Lane 37 Opus recommendation is exported `NATIVE_ROUTES`, recorded in `docs/specs/codex-parity-37/L37-opus-review-r1.md:30-32`.
- `scripts/native-package.test.mjs:14-39` owns static native manifest shape only; it is not the parity assertion owner.

## Tests that police this area
- Replace the literal map with inventory from both manifests: every Claude pair must be one observed adapter/shared-command route or one reasoned unsupported row; every Codex wrapper/guard pair must map back to a Claude pair or a documented Codex-only allowance. Validate route commands, not event names alone.
- Add isolated fixture copies with a fake Claude event/pair and a fake Codex adapter event/pair; both must fail the same real parity validator. Keep installed manifests untouched.
- Preserve `:123-131` assertions that the resolved native command is wrapper/delete guard, plus `:134-243` behavioral route evidence. Fake rows must not be hidden by a second typed expected list.

## Open questions for the spec
- Manifests show only `multi-codex-hook.mjs`, not which Claude script the wrapper routes. Adapter equivalence cannot be proven from manifests alone. A production `NATIVE_ROUTES` mapping (used by `nativeRouteForLead`) is the documented bridge, but root must pin that representation before implementation; otherwise no manifest-only test can distinguish a wrapper that silently stops routing backlog.
- How should matchers participate in identity? Current contract is `(script,event)`; `hooks/hooks.json:61-86` has multiple PostToolUse matchers. Preserve the pinned pair identity unless root expands the contract to matcher-aware pairs.
