# Preserve unknown wiring evidence

Base: released 0.20.0 at8b4ea6f. This is a finite repair to the existing diagnostic, not a new health service or an expansion of required installation. Owner: skills-a. Source changes and merges are authorized; no live configuration or activation.

## Goal and hypothesis

The harness must not report green when it could not inspect a required condition. `scripts/wiring-check.mjs` currently converts malformed/unreadable check lists to an empty list, evaluation exceptions and unknown types to informational success, and then returns `ok:true`. This is the previously identified false-green failure class. Keeping uncertainty distinct from intentionally informational switches will make diagnostic failures visible without failing or waking an agent session.

Discriminating observations: malformed/unreadable required input and throwing/unsupported checks produce `unknown`, `ok:false`, and one bounded `--line` notice; valid switch/env informational rows remain non-failures; valid applicable checks retain their existing results. No exception escapes, no file is written, and neither secrets nor raw error contents appear in the diagnostic. CLI keeps exit0 for diagnostic findings, with usage errors unchanged. `ok` is a scoped result for declared checks, never proof of installed execution or whole-host health.

## Territory and boundaries

Builder owns scripts/wiring-check.mjs and scripts/wiring-check.test.mjs only. Parent owns docs/work/spec/release metadata. Preserve the existing JSON shape `{ok,results}` and row shape; add `unknown` to state vocabulary rather than a parallel status store. Preserve list override precedence and platform selection. Absence of the optional private check file is normal; malformed/present-but-unreadable private input is unknown. Missing/unreadable/malformed shipped default input is unknown. Explicit empty override lists and all-platform-excluded lists mean no applicable checks, and must be described as that rather than inventing a missing installation; no new host requirements or warning for deliberately inapplicable scopes. Unsupported/missing type on a selected valid-id row, selected refused protected-ledger target, and evaluation/read/stat errors are unknown. Invalid list rows must not silently erase a required check: retain bounded input-level uncertainty with fixed diagnostic IDs rather than printing raw row content.

Keep intentional `info` for switches, env visibility, and the established `whenMissing:info` option. Do not collapse genuine ENOENT, permission errors, corrupt JSON and unsupported type into one healthy absence. Reuse existing readers/evaluation paths; no hook invocation, process spawn, polling, scheduler, installation repair, provider call or private registry read. Avoid raw error messages and actual secret-shaped values in diagnostics. Preserve off-switch silence and bounded single-line output. Do not add new config switches or a new doctor executable.

## Review and gates

Mid-tier builder; independent Astra review targeted at false-green and privacy counterexamples. Focused meaningful failure tests and CLI behavior, then one full sealed integration gate under its own owner. Check existing janitor consumer of results; do not enlarge its territory without a demonstrated required change. Reviewer must distinguish known missing/stale from unknown and intentional info. Ship separately from accepted 0.20 so diagnostic follow-through does not delay that usable release.
