# Lane 52 preliminary specification

Work: wr-2026-09-28-readback-escapes. Owner skills-a. Root alone writes its work record.
Authority: pickup.md, skills-fable-lane-52-1; scratch-page probe and archive explicitly authorized. Base bb77a1d97f8dae420917bcaa3e82385451db0662 or later origin/main at branch creation. Spec-from 2026-09-29T01:38:40Z; Opened 2026-09-29T01:39:00Z. Lead 01a0df4c-2809-7520-b1d7-876cc51a87ee; spec session 9c61c35a-82dd-4aef-8eca-c99bb0e72e31.

Measure: rework after acceptance, specifically publish recovery count. The comparison must accept only observed literal-character escape equivalences and must reject substantive text or structural changes. No new guard, recovery path, state, service, or production timeout.

Contract: existing exported normalize(text) returns a string, consumed on both comparison sides by all renderer checks. Preserve this committed interface. New equivalence set is UNRESOLVED until the scratch-page probe. Backslash before an evidenced member can become insignificant only within the ruled context; all other characters, meaningful formatting, line order, bullets, and ticks remain significant. Existing whitespace normalization remains intact.

Territory T1: skills/decisions/scripts/decisions-render-core.mjs, normalize function and its directly explanatory comment only. T2: its relevant existing test file(s), Lane52 snapshot/probe fixtures and fixture-local attributes. Root: docs/work record, docs/specs/readback-escapes-52 briefs/evidence. docs/census.md one line only if a marker actually changes. Exclude decisions-render.mjs except an unavoidable import approved by root, all guards, adopt-live semantics, notion.js, all waiting items, and skills/notion-writing/**. Lane39 has a renderer import/call: inspect latest origin/main before merge and incorporate normally without rewriting published ancestry.

Evidence: preserve the two supplied snapshot files byte-for-byte, hash them, and retain raw probe request/readback plus page creation/archive receipts. Determine whether the noted cleared-timestamp difference contradicts whole-file verbatim equality; surface it to root before changing fixtures or normalization. Required negative cases: removed bullet, changed tick, moved line, changed word, and build/x instead of escaped star. Red on base for the escape defect, green after fix, with narrow escaped-character set pinned from actual readback.

Pipeline: scout and probe first; root pins final spec and record; independent mid builder and tests, one Opus review from skills-fable, sealed full suites on Windows and Netcup, normal merge with one daily-history bullet, exact-merge Windows gate, normal guarded publish exit0, code-mediated close and one RESULT. Prior failures stay visible. No unchanged full-suite retries.

One scratch root on this host: C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/readback-escapes-52. Remote if needed: /tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/52. No other throwaway roots.
