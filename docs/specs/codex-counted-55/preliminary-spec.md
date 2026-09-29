# Lane55 preliminary specification and territory map

Authority: pickup.md, skills-fable-lane-55-1. Base72f1dfc1c026c0e410bf6e74d910550e1fe0f843. This is scout input, not permission to implement unresolved contracts. Goal measure: feed exact top-tier token and lead-turn counts for the Codex half of DONE, without converting unknowns to estimates. Codex-led manual team-build sequence; no Workflow tool.

Preserve the existing census mechanism. Resolve a Codex lead from the work record's Lead-session identity, verify the file's own session_meta identity, and bypass the default time horizon only for positively verified identity. A filename match alone is not identity proof. Preserve Claude discovery unchanged and the no-id fallback horizon. Reject ambiguity, mismatched identity, missing files, unreadable/truncated input explicitly. Discover relevant actual children through verified parent relationships rather than treating arbitrary supplied paths as coverage proof.

Pin from source evidence which native fields can be exactly counted: model, uncached/cached input, output, turn boundaries and hook-marker events. Preserve missing fields individually as UNSUPPORTED with reasons, never zero or guessed defaults. COUNTED describes supported fields for a verified, temporally complete requested window, not universal coverage. PARTIAL is for temporal incompleteness, not merely the age of a verified session or an unsupported native field. A historical window in a still-running file can be complete only with concrete boundary evidence beyond that window; pin the exact rule after the scout. Truncation and rotation must not become COUNTED silently.

The scout must identify current CLI/API contracts and downstream census consumers before root freezes additive changes. No four-read.mjs changes or alternative reader. Prefer additive metadata compatible with existing consumers; identify any impossible scope constraint rather than weakening identity or counters to satisfy a label. Conditional Opus spec red-team is mandatory if the fix crosses beyond Codex discovery/coverage, and appropriate for ambiguous number provenance.

## Territory map

- T1: scripts/build-census.mjs Codex discovery/coverage code only. Any imported native helper discovered outside this file requires root scope ruling before edits. docs/census.md Codex section only. No Claude discovery changes.
- T2: independent build-census Codex regression tests and synthetic fixtures, paths to be pinned by scout. Own source-independent contract tests, red-before-green fixtures and Lane37 exact-base failure evidence. No production source edits.
- T3: measured five-row reread report docs/reports/census-0928/codex-rows.md, one pointer line in four-read.md DONE section, and produced census artifacts only. No records from prior lanes may be edited. Prepare actual record/log/window inputs independently; final reads consume reviewed candidate code from a fresh detached current-main checkout with exact implementation provenance stated. Root will resolve the premerge/live-main sequencing from scout evidence before execution.
- Root only: this spec pack, admission/acceptance/closure record docs/work/wr-2026-09-28-codex-counted.record.md, review briefs and evidence decisions. Builders write their own reports, never docs/work records.

## Required evidence

1. Known-id fixture found and internally verified outside horizon; no-id fallback retains horizon.
2. Missing one supported native field is UNSUPPORTED for that field only, other supported counters remain COUNTED; malformed/truncated log is PARTIAL with exact reason.
3. Identity spoof, duplicate ambiguous id, missing parent linkage and out-of-window data cannot produce confident aggregate numbers.
4. Lane37 current PARTIAL reproduced on exact base, new behavior discriminated with two checkouts and no stash. Preserve commands, native exits, source hashes and original artifacts.
5. Five rereads (31,37,48,49,52) retain commands, source file paths, verified ids, windows and per-field limitations. Same table columns as census-0928/four-read.md, including tokens per model/top tier, lead turns, elapsed acceptance, rework, wakes, Stop-blocks, nudges and stalls. State whether49or52 satisfies fewer than20lead turns. Do not infer mixed-handoff completion or improved quality from counts alone.

One independent high-tier review after focused green, then sealed Windows and second-host gates, strict root acceptance, normal main merge/history bullet, normal guarded publish and code-mediated close. No recovery flags, installs, live hook modifications, identity changes, destructive git commands or unsupported-field estimates. Gate runners use process-owned Global\\claude-verify and shared regular /tmp/claude-verify.lock. One full gate per candidate per host; rerun only after material source/environment change with prior receipts retained.
