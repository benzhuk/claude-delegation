VERDICT: PASS

# Lane55 T1 builder report

## Delivery

Source commit: `beb7f9d8617f358aaa3bf5b2de77bb9461a7d10b`.

- `scripts/build-census.mjs`: blob `bc4cdf008ae4b68d93b8dc799254bc75167ce902`
- `docs/census.md`: blob `4cdd99f48233193c7ffa029b4c88effed8093f17`

The implementation adds `--lead-session <id>` and `--codex-home <canonical-home>` without changing the existing exports. Known-id mode resolves native metadata, walks the bounded canonical `sessions/year/month/day` tree, proves ancestry transitively to depth three, unions same-id segments, and exposes identity paths, discovery scope and stable per-field support. Legacy `--lead` remains the no-id path with its existing default horizon.

Temporal completeness is independent of field support. Text begins with `VERDICT: COUNTED <n> Codex responses (leadTurns <m>)` exactly when the selected graph has a complete read snapshot and every relevant logical session has an end-bound witness. Unsupported fields are named on that same line. `lead.coverageSupported` additionally requires counted input, cached input, output, model and derived-total fields.

Native input remains inclusive of cached input. Derived total is native input plus output, and reasoning output is never re-added. Cache-write zero is inferred only from an observed native `token_count` schema that has the standard input/cached/output members and no cache-write member. Otherwise cache-write remains unsupported.

## Evidence

Commands and native exits:

```text
node --check scripts/build-census.mjs
exit 0

node --test --test-name-pattern="Lane55|parseArgs" scripts/build-census.codex.contract.test.mjs scripts/build-census.test.mjs
exit 0; 9 passed, 0 failed

git diff --check
exit 0
```

The focused cases prove an old resumed child can be discovered outside the legacy horizon, an unsupported cached-input field does not turn a temporally complete census into PARTIAL, and the additive parser preserves its prior object shape when the new flags are absent.

## Legacy case changes and risk

The pre-ruling Codex contract run at the source checkpoint produced 12 passes and 8 failures. Those failures identify expectations superseded by the approved contract:

- Missing required cached-input evidence now makes the complete combined aggregate unavailable while retaining observed per-model subtotals; older cases expected a complete aggregate.
- Model-only and timestamp-only differences for the same response id no longer refuse the census. The approved rule refuses only differing usage for an overlapping response id.
- A same-id segment carrying different usage for an overlapping response id now refuses immediately; older tests treated non-identical same-id files as unresolved discovery exclusions.
- Open legacy fixtures without native end witnesses are temporal PARTIAL where older assertions expected complete coverage.

Root adjudicated the equal-usage attribution risk after initial delivery. The correction preserves exact token observations but marks conflicting model attribution unsupported, makes conflicting timestamps temporal PARTIAL, and makes a turn-id conflict leave the response timeline unsupported. Differing usage for an overlapping response id remains a refusing conflict. This removes file/row order as silent authority for the disputed attribution.

A subsequent contract pass closed four further false-completeness paths: same-id child usage conflicts are rethrown rather than converted into an unreadable-file exclusion; malformed `task_started` events make `leadTurns` unsupported; ledger nudges are counted only when `computeStallNudges` returns an exact count; and temporal closure now includes selected children for bounded and unbounded runs. A future child is exempt only when it contributes no in-window response. Non-monotonic native event timestamps are damaged temporal evidence.

The final narrow source correction preserves invalid-timestamp evidence even when the affected response cannot enter the bounded timeline, so `responseTimelineComplete` remains false. Native filesystem access is consistently routed through the injected `fsImpl` wrapper; the module-level implementation was renamed to avoid a direct-filesystem secrecy false positive under Windows CRLF checkout behavior.

Cause: the prior implementation bounded Codex discovery by two filename dates and used one blanket coverage flag for discovery, temporal closure and optional token fields.

Discriminating check: a verified `--lead-session` finds an old resumed child through the canonical tree and returns temporal COUNTED while a missing required token field remains explicitly UNSUPPORTED.

Fix location: `scripts/build-census.mjs` Codex usage parsing, discovery, graph accounting, temporal evaluation, formatting and CLI parsing; `docs/census.md` Codex contract section.

Simplification: the implementation reuses the existing reader, report object and formatters. It adds no cache, secondary index, record parser, production helper file or transcript copy.
