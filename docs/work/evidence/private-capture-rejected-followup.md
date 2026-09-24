VERDICT: NEEDS_FIXES 3ffb0042e7ffb92758cc581adcdd04ee2c1c5a6b

Independent follow-up review — September 23, 2026 (America/New_York). Read-only source review plus disposable synthetic probes; no source edit, provider/network call, live private state, or full-suite run.

## Original findings are fixed

The exact final candidate's decisions files match corrected private branch c0e56b07ebbe7425ba6e9430d4cf22497bfeb246 (`git diff c0e56b0..3ffb004 -- skills/decisions` empty).

Independent reruns of the original repros passed:
- Malformed private JSON beginning `PVT_X9` returns INVALID_JSON without input snippets in serialized status. CAPTURE_INTENT recovery returns reconciliation with no canary in result or persisted receipt and no extra send.
- Legacy ACCOUNTED with valid capture and valid outcome returns integrity OK; modifying outcome produces OUTCOME_TAMPERED; deleting it produces OUTCOME_MISSING. Saved ACCOUNTED state and receipt bytes remain unchanged.

The shared verifyAccountingOutcome helper is the correct small simplification. Private/legacy JSON verification, exclusive reuse, receipt parsing, accounting capture reread, and open reread now avoid parser-message forwarding.

## Remaining required privacy diagnostic repair

The requested adjacent error-path inspection found two existing paths still contradict the release's explicit contract that private titles/body/content must not enter error output or diagnostics. These predate the storage change; the earlier parser fix did not cover them.

1. `skills/decisions/scripts/decisions-pickup.mjs:804` returns parser warnings and shapeless objects directly in INVALID results. The parser embeds titles in missing-default warnings (decisions-read.mjs:274), and shapeless entries contain title (line 314).

Independent reproduction through actual pickupOnce with mocked reader:

Input:
<summary>PVT_TITLE_73</summary>
- [x] Keep it
- [x] Done

Returned result:
{"status":"INVALID","reason":"registered page has reader warnings or invisible toggles","warnings":[{"text":"no default or \"No default\" line: PVT_TITLE_73","line":1}],"shapeless":[]}

This object is directly serialized by runCli. Use an allowlisted diagnostic shape containing count, safe category and line number, never raw warning text or title. Apply the same rule to shapeless. The general-purpose reader need not lose its attended contentful output; sanitize at the pickup diagnostic boundary.

2. `skills/decisions/scripts/decisions-pickup.mjs:500` embeds arbitrary reader stderr in a PickupError; CLI forwards it to stderr. Independent readPageWithCli probe with a synthetic spawn result `{status:1,stderr:'PVT_STDERR_81 private page diagnostic'}` throws `reader exited 1: PVT_STDERR_81 private page diagnostic`.

Report a fixed reader-failure description plus numeric exit/safe error code, excluding stdout/stderr and arbitrary child error messages. Add canary tests for stderr, warning titles and shapeless titles. No successful explicit-open behavior needs to change.

## Exact integration checks

- Clean integration HEAD at inspection: 3ffb0042e7ffb92758cc581adcdd04ee2c1c5a6b.
- Decisions implementation SHA-256: FFD5D416FC11AD3A635527071C8F8063A5683B3CD02D5E98990D1EE499B9C6FA.
- Decisions tests: 2E078B3827658B5A649D95AAF6BAAF11AF7180EC928B3049F9D213AE0F3025A7.
- Decisions SKILL: 7C4A06E0B4A14B231C13161B104C905720DF43B6686A24FA211482CDB6B0D3AD.
- note-send.mjs SHA-256 equals prior approved 47574A8871EC243EA29D5671817263703771B4F9F73DC6779F257C9C5F80267A.
- note-send.test.mjs equals prior approved 0633BDF6B5232272C104E3C70A78868771CCB1467960FE71CEBFC2975CC3B0F1.
- Release metadata consistently advances three manifests to 0.19.0; README/multi skill accurately describe private local snapshots, legacy refusal, NO_ACTION, and default packet Details. Architecture contract retains explicit same-host/manual cross-host limits. Work record preserves rejected snapshot and marks current source delivered with independent review/full gate pending rather than accepted.

No architectural rewrite is indicated. The two remaining fixes are local diagnostic-boundary changes. Parent owns the full suite; passing suite evidence does not override these independently reproduced contract failures.
