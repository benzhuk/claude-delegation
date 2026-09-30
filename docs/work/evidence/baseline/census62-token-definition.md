VERDICT: PASS (all five published scalars reproduce exactly from retained census JSON; scope mismatch recorded below)

Source: Scratch of wr-2026-09-29-baseline (docs/work/wr-2026-09-29-baseline.record.md:13), subdirectory out/. Files hashed before extraction (SHA256):
- N3.json e2cd3d3e5ef155782770740700e1f01c1a28aefc1d8e905fc6a878affa8f56ca
- N4.json a1144692de7ae42b8a9d912cca881b5a8e38d86e4b0fcc06b503bc952ceb1f52
- N2.json 3838eec84f1841c19c97fe621a7ca93ba7d6d6d08c0eb3f09fa115c0a893e31c
- W1.json 32e42c67dd1106e8d35619605697a5bcbe0936232e2d20e5284893e135024dc0
- W2.json 9b75b98cd0392b7109fcd93e392ad1c6969fa6fd2991f07ccb71150ed122d6ca
- (command lists, hashed, not copied) cmds.txt e32a173e...cf887, cmds2.txt 5d5d72d6...975c
Output: docs/work/evidence/baseline/census62-token-vectors.json (numbers, model ids, session-uuid basenames, window bounds, hashes only; no transcript text, prompts, tool data, env values).

Extraction: top tier = model id contains fable or opus; processed tokens = input + cache_creation + cache_read + output; primary source lead.windowByModel, secondary `combined`. Mapping to the baseline table: N3=row 1 (97a20911), N4=row 2 (1a1af44b), N2=row 3 (caee6158), W1=row 4 and W2=row 5 (both 59c7d404).

Scalar comparisons (published -> lead.windowByModel top tier -> combined top tier):
- N3: 132,533,844 -> 132,533,844 EXACT -> 248,462,538 DIFFERS (+115,928,694 claude-opus-5 subagent tokens)
- N4: 46,706,274 -> 46,706,274 EXACT -> 50,649,619 DIFFERS (+3,943,345 claude-opus-5 subagents)
- N2: 17,298,421 -> 17,298,421 EXACT -> 17,298,421 EXACT (subagent tokens are claude-sonnet-5 only)
- W1: 8,446,104 -> 8,446,104 EXACT -> 8,446,104 EXACT (no subagent top tier)
- W2: 11,407,524 -> 11,407,524 EXACT -> 11,407,524 EXACT
Cache-read is 97 to 98 percent of each scalar (N2 16,818,182 of 17,298,421; N3 127,303,184 of 132,533,844).

Scope limitations (evidenced, not assumed):
1. The published scalars are LEAD-ONLY (lead.windowByModel). Current four-read sums `combined` (lead plus native subagents). The formulas match, but the scopes do not: for N3 and N4 the in-window top-tier subagent (opus) tokens were NOT in the published numbers, so an all-role current read is a SCOPE MISMATCH against builds 1 and 2, not a comparable figure. For builds 3 to 5 lead-only equals combined, so scope agrees there. The 5-build median (17,298,421, build 3) is unchanged under either scope (combined values sort 8.4M, 11.4M, 17.3M, 50.6M, 248.5M).
2. Detached high-tier roles: the old census JSON carries only the lead file plus native subagent files (N3/N4 subagents: 91 and 12 files, roleFileCounts unassigned 13/11; N2 6 files). Nothing in these files shows a shell-launched or detached Claude session being counted, so they were not included, only as evidenced by absence; I cannot prove none existed in those builds.
3. Window: bounds are lead.windowStartAt/EndAt from --from/--to (no marker); N3 2026-09-15T00:55:07Z to 13:21:30Z, N4 2026-09-08T13:28:12Z to 22:08:41Z, N2 2026-08-31T18:44:40Z to 20:19:39Z, W1 2026-09-02T22:01:33Z to 2026-09-03T02:43:44Z, W2 2026-09-03T21:55:53Z to 2026-09-04T01:55:04Z. Known caveats in hand-run-baseline.md (builds 2 and 3 windows also hold unrelated session work; build 2 window starts 29 s after the used ask line) remain.
4. Only Claude hosts; no Codex baseline. Dedup is build-census's (last-seen per requestId); sidecar/out command provenance is by cmds file hash, not stored in the JSONs.
5. No baseline scalar was rewritten. Root preserved the sanitized vectors beside this report; the source scratch path is volatile.
