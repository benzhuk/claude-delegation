VERDICT: NEEDS_FIXES (13) 5441aac5e0344bcadc6ef38bd1e1340fa76dbc95

# Lane62 spec red-team, round 1 (the only authorized round)

Reviewed: docs/specs/census-completeness-62/{spec.md, contracts.d.ts, scout-T1.md, scout-T2.md, scout-followup.md, metadata-witnesses.json} at 5441aac5, against the source seams they name (scripts/build-census.mjs, four-read.mjs, work-record.mjs, jsonl-lines.mjs), docs/census.md, docs/model-tiers.md, docs/work/evidence/baseline/hand-run-baseline.md and the retained census JSONs. Read-only. No transcripts, config or env read. No suite run.

Overall: the design is the right size: one record manifest, one parent link, one shared helper, additive JSON, and existing parsers reused. Prior 40b LF framing survives: spec L31 keeps the corrected lfLines evidence, and four-read scanTimestamps splits on `/\r?\n/`, which is LF/CRLF-only, so it is safe. Codex corrupt-child PARTIAL (docs/census.md:56-59, 75) is untouched. But there are three ways it can return a false green or a false zero, and all three hit the headline numbers: Claude tokens silently drop out of a Codex-led census (F1), the stall cell does not match the baseline rule (F2), and a stale open turn inflates stalls (F3). Several smaller problems make the no-false-zero claim untrue in practice. Each finding below comes with a minimal correction. None needs a new mechanism.

C4 summary (whole review)
Cause: the spec pins what to count but, at several seams, not how the new data enters the existing reducers: four-read's host-split tier list and its derived-total guard, listRecords swallowing errors, censusSubFile skipping lines silently, and the Four-numbers copy path. The existing code then turns the new evidence into a silent zero or a silent exclusion.
Discriminating check: the per-finding test contracts below. Each fails on the base and on a plausible literal reading of the current spec, and passes only with the correction.
Fix location: spec.md L24-L28 rulings and contracts.d.ts (root, before build). Implementation lands in build-census.mjs (runCensus/runCodexCensus/censusSubFile), four-read.mjs (topTierModels, codexModelTotalsReason, rework cell), work-record.mjs (FIELD_LABELS/OPTIONAL_FIELDS) and census-measures.mjs.
Simplification: every fix reuses an existing reducer (`combined`, `numbers[]`, FIELD_LABELS, gaps()' strict rule, docs/model-tiers.md's tier default). No new file, CLI verb or chronology is added.

---

## F1 — HIGH — Declared Claude roles in a Codex-led build are dropped from, or blank out, the top-tier cell (false zero / false unavailable)

Evidence:
- four-read.mjs:55-58 `topTierModels`: for a Codex census the default is `'gpt-6-astra,gpt-5.6-sol'`, so a declared Claude Opus/Fable reviewer in a Codex-led build never matches `sumTopTier` (four-read.mjs:138, substring match). Spec L27 pins "Shared default top-tier families are the existing four-read defaults", which carries the defect forward. Plan section A item 1 is exactly the Codex-led case.
- four-read.mjs:74-80 `codexModelTotalsReason` requires a finite `derived_total_tokens` on every `combined` model. A Claude vector {input, cache_creation, cache_read, output} has none, so the whole cell becomes `unavailable`, or it is summed as `undefined` → NaN through sumTopTier L145 with `useDerivedTotals=true`.
- contracts.d.ts:10-13 `RoleResult` carries only status/reasons: no requests or byModel. Neither spec nor contract says where declared usage enters (`combined`? `subagents.totalByRole`?). Builders will diverge.
- docs/model-tiers.md:47 already pins the cross-host default `fable,opus,gpt-6-astra,gpt-5.6-sol`.

Fix (spec L27 replacement text): "Shared default top-tier families are the union documented in docs/model-tiers.md (`fable,opus,gpt-6-astra,gpt-5.6-sol`), applied per model regardless of lead host; `DELEGATION_TOP_TIER` still overrides. Declared-role usage merges into the existing `combined` and `subagents.totalByModel/totalByRole` (role from declaration) and appends `subagents.perFile` rows with `source:'declared'`. In a Codex-led census every `combined` entry, Claude ones included, carries `derived_total_tokens = processedTokenTotal(host, vector)`."

Contract patch (contracts.d.ts:10-13):
current:
```ts
export interface RoleResult {
  host: 'claude'; sessionId: string; role: Role; evidence: string;
  status: Coverage; reasons: string[];
}
```
replacement:
```ts
export interface RoleResult {
  host: 'claude'; sessionId: string; role: Role; evidence: string;
  status: Coverage; reasons: string[];
  /** deduped in-window requests counted from this session; null when not counted */
  requests: number | null; duplicateRequests: number;
  byModel: Record<string, {input_tokens: number; cache_creation_input_tokens: number;
    cache_read_input_tokens: number; output_tokens: number}> | null;
}
```
Test contract: a synthetic Codex lead (gpt-6-astra, 100 processed) plus a declared Claude session (claude-opus-5-5 with in 1, cc 2, cr 3, out 4) must give a four-read top-tier value of 110 with no DELEGATION_TOP_TIER set. It fails on base (100 or unavailable) and fails if the tier default stays host-split.
Simulated outcome: a union default leaves all retained Claude-lead censuses unchanged. I checked the model keys across docs/work/evidence/*.census.json: only claude-* and `<synthetic>`, no gpt-* keys.

## F2 — HIGH — Stall cell is labeled baseline-comparable but excludes the class the baseline counted; the boundary also differs

Evidence: hand-run-baseline.md L5 counts "silent gaps over 2 h between consecutive transcript events" of any kind. Build 4's median-setting 1 is "gap 674 to 675 … 3.04 h, waiting on the owner". That is a closed-turn owner wait, which spec L25 excludes ("Closed-turn gaps are between-turns and excluded from the comparable silent-gap count"). Spec L25 also uses "at least 120 minutes", while the baseline says "over 2 h" and the existing gaps() (four-read.mjs:203-205) is strict `>`. Baseline stall classes also include usage-limit stalls, died/relaunched subagents and reports that never arrived. The spec measures none of these and does not say so in the cell. The result would be a plugin stall count that is structurally lower than the baseline's, which reads as a false "beats the bar".
Fix (spec L25): replace "Qualifying gaps are at least 120 minutes" with "Qualifying gaps are strictly more than 120 minutes (baseline 'over 2 h', gaps() strict rule)". Add: "`baselineRuleGaps` counts every clipped interval of any kind over 120 minutes (the baseline's consecutive-event rule) and is the only baseline-comparable stall number. `observedSilentGaps` (in-turn silence only) is the plugin diagnostic. The four-read stall value names the baseline classes not observed (usage-limit, relaunch, missing report) as UNSUPPORTED, so the cell is a lower bound."
Contract patch (contracts.d.ts:29): after `observedSilentGaps: number | null; toolRunningGaps: number | null;` add `baselineRuleGaps: number | null;`.
Test contract: a fixture with exactly 120:00 of in-turn silence gives observedSilentGaps 0. A fixture with a 180-min closed-turn gap gives observedSilentGaps 0 and baselineRuleGaps 1.

## F3 — HIGH — An open turn without task_complete (the witness has 2) keeps "in-turn" and "tool-running" state alive forever, which fabricates stalls

Evidence: metadata-witnesses.json `eventMsgTaskStarted 85, eventMsgTaskComplete 83, openTurnsAtEof 2, unpairedToolCallsAtEof 4`. At most one non-nested turn can be the last one started, so at least one open turn is either superseded mid-file or nested (`root_turn_id` exists: scout-T2 L4). scout-T2 L4 also says abort is not observable. Spec L25 gives a state machine where "open" means started-without-complete. Under it, every between-turn gap after a stale turn counts as in-turn-silence, and an unpaired call makes every later gap "tool-running". The witness split (9 in-turn vs 2 between-turns at ≥120 min over 83 closed turns) is consistent with that inflation. It has not been checked against it.
Fix (spec L25, add): "A tool call's open state ends at its output or at its own turn's task_complete, whichever comes first. A turn with no task_complete, followed by a task_started for a turn that is neither it nor a descendant via root_turn_id, has an unobserved end. Gaps while only unobserved-end turns are open are listed in `reasons` as `turn <id> end unobserved`, excluded from observedSilentGaps and toolRunningGaps, and counted in baselineRuleGaps (the baseline counted any silence). Coverage is then PARTIAL. Right-censored in-turn silence at `to` (the frozen-pane class, plan C11) counts when its clipped duration qualifies and is labeled `rightCensored`. Intervals crossing `from` qualify on their clipped duration only. Rows are ordered by row timestamp with file order as tiebreak. A non-monotone timestamp alone is not PARTIAL; only a lifecycle contradiction is (complete before start for the same turn_id, output before call for the same call_id)."
Live-proof addition (structural, no content): before build, root reruns the witness with lfLines and reports (a) task_started seen while another turn_id is open, split by same versus different root_turn_id, and (b) the count of timestamp reversals. If (a) is nonzero the 9/2 split is not a valid oracle.
Test contract: turn A started with no complete; turn B started and completed; 3 h idle; turn C started. The result must not be in-turn-silence (base design: false positive), and coverage is PARTIAL with reason `turn A end unobserved`. A call paired by turn_complete but lacking output must not classify a later between-turn gap as tool-running.

## F4 — HIGH — Rework corpus can yield a confident zero from an unreadable or wrong directory

Evidence: work-record.mjs:513-531 `listRecords` returns `[]` when readdir fails and parses `""` for an unreadable file, which yields no Work and no Follow-up-of. Spec L26 reuses it with `--records` defaulting to the sibling directory. A wrong path or an unreadable child therefore gives "0 episodes" with coverage complete. At the other extreme, "validate … across that corpus" would let one unrelated malformed historical record taint every four-read.
Fix (spec L26, add): "Four-read proves the corpus is the right one: the target record's resolved path and its Work must appear in the listing, else unavailable. An entry whose file is non-empty but yields no Work, or which cannot be read, is PARTIAL (`unreadable record <basename>`). Validation scope is the target, its direct children (Follow-up-of == target Work), and the ancestor chain of each, bounded by corpus size for cycle detection. Unrelated records are ignored except a duplicate of the target's or a child's Work id. Follow-up-of must match `^wr-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$` (the Work rule, work-record.mjs:988). A multi-value line or a duplicate label is PARTIAL. A parent without an accepted Log is unavailable. An immature window reports the observed count with `mature:false`, coverage PARTIAL and reason `window open until <windowEnd>`, never null and never mature 0."
Test contract: `--records` pointing at an empty or nonexistent directory gives coverage unavailable, not episodeCount 0. An unreadable (0600, or mocked readFileSync throw) sibling record gives PARTIAL. An unrelated record with a garbage Follow-up-of leaves the target's coverage complete.

## F5 — MEDIUM — The episode never reaches the Four-numbers line, so item 3 moves nothing the record or October read sees

Evidence: work-record.mjs:565-583 copies only `numbers[4]` `{key,label,value}` into `Four numbers:` lines. Spec L26 and contracts L44-45 put episodes in an additive `reworkAttribution` property and keep the legacy commit-count string (four-read.mjs:541-546). The accepted record therefore still shows only "N commit(s) …". This is the plan's complaint ("counted it as a new lane"). A child build's own four-read also never says it is rework.
Fix (spec L26, add): "numbers[2].value keeps its legacy text and appends `; follow-up episodes: <n> (declared links only, mature|provisional until <windowEnd>)` or `; follow-up episodes unavailable (<reason>)`. When the target itself has Follow-up-of, append `; this build is follow-up of <parent>` to numbers[2] so aggregate reads can fold it under the parent." Contract: add `followUpOf: string | null;` to ReworkAttribution.
Test contract: the 59b fixture parent's four-read JSON `numbers[2].value` contains `follow-up episodes: 1`, and the child's contains `follow-up of wr-…-janitor-acts`. The legacy commit count is unchanged and nothing is summed.

## F6 — MEDIUM — New record labels fail strict accept unless registered (spec is silent; scout flagged it)

Evidence: work-record.mjs:970-975 `strictHeaderRe` allows hyphens (`[A-Za-z -]`), so `Role-sessions:` and `Follow-up-of:` throw `unknown label` at accept. (parseRecord's HEADER_LINE_RE at :96 has no hyphen, so the non-strict path stays silent, which hides the problem in the unit tests.) Scout-T1 L3 raised this. Spec L24/L26 only say "parse with parseRecord".
Patch (work-record.mjs):
current (:40)
```js
export const OPTIONAL_FIELDS = ["children", "builder", "rounds", "class", "artifactRepo", "worktree", "leadSession", "specSession", "specFrom", "base", "supersededBy", "scratch"];
```
replacement
```js
export const OPTIONAL_FIELDS = ["children", "builder", "rounds", "class", "artifactRepo", "worktree", "leadSession", "specSession", "specFrom", "base", "supersededBy", "scratch", "roleSessions", "followUpOf"];
```
current (:88-89)
```js
  ["scratch", "Scratch"],
];
```
replacement
```js
  ["scratch", "Scratch"],
  // lane62: optional singletons. Role-sessions names a repo-relative role manifest; Follow-up-of names the parent Work id.
  ["roleSessions", "Role-sessions"], ["followUpOf", "Follow-up-of"],
];
```
Also add the two rows to the header table in docs/work-record.md (T1 owns it).
Test contract: strict accept of a record carrying both labels passes shape. The same label duplicated throws `duplicate singleton field: followUpOf`. After root annotates it, `work-record check` on the closed wr-2026-09-30-mirror-shim record reports no new finding.

## F7 — MEDIUM — "work-record accept supplies them" is false; the PARTIAL Claude verdict has no accept path

Evidence: work-record.mjs has no build-census invocation (grep: only comments at :1006-1094). accept reads a pre-made `--census` file and requires `^VERDICT: COUNTED\b` (:1014). formatText (build-census.mjs:2011-2019) has no Claude PARTIAL branch today. A PARTIAL Claude census would be refused with the misleading "does not begin with the census header line" (:1156-1158).
Fix (spec L24): replace "Explicit `from` and `to` are mandatory with role declarations and bound every role inclusively; work-record accept supplies them." with "With `--record`, `--from` and `--to` are mandatory, bound every role inclusively and are mutually exclusive with `--marker` (build-census.mjs:347). The operator passes `--from` = record Opened and `--to` = the same instant later given to four-read `--accept-at` and accept `--at`. build-census refuses a `--from` earlier than Opened minus the four-read 5-minute tolerance (four-read.mjs:155). A Claude-lead census with any non-complete RoleResult prints `VERDICT: PARTIAL Claude census (<reasons>)`. accept refuses it with the UNSUPPORTED-style message pointing to `--no-census`."
Test contract: `--record` without `--to` throws. A Claude census with one PARTIAL role starts `VERDICT: PARTIAL`, and accept's error text names `--no-census`.

## F8 — MEDIUM — Declared-session reading inherits silent skips: corrupt rows, the session's own subagents, and zero in-window usage

Evidence: build-census.mjs:1005-1009 `censusSubFile` does `catch { continue; }` on malformed lines. A corrupt declared transcript therefore under-counts with no PARTIAL, contradicting spec L24 "corrupt usage … taint". Spec L13 said "Reuse native Claude descendant traversal", but the ruling at L24 only reads the one `transcript`, so a detached Opus reviewer's own Agent subagents (`<dir>/<uuid>/subagents/…`, buildDirSpecs :1073) are omitted. A declared session whose rows all fall outside from/to is clipped to a silent 0 (runCensus :1719-1729 pattern). Request dedup today is per file (censusSubFile builds its own Map), so "not by file alone" is new behavior. It must not change legacy native totals.
Fix (spec L24, add): "Declared transcripts are read with lfLines. Any non-empty unparseable line gives PARTIAL `corrupt rows: <n>` (count only). The existing default subagent glob and journal roles apply to each declared transcript's `<uuid>/subagents/`, with the existing realpath+inode dedup against native files. A declared session with zero in-window usage rows is PARTIAL `no in-window usage`. A declared sessionId equal to the lead's is PARTIAL `declared session is the lead`. Cross-source dedup drops only declared entries whose canonical key (resolveAndStore) already exists in the lead or native maps; these are counted in `duplicateRequests`. Native totals keep their current per-file semantics."
Patch sketch (additive return): in censusSubFile, add `let malformed = 0;` and replace `} catch {\n      continue;\n    }` with `} catch {\n      malformed += 1;\n      continue;\n    }`, then return `{ byId, firstAt, lastAt, malformed }`. Existing callers ignore the new key.
Test contract: a declared file with one corrupt line gives PARTIAL. A declared session whose subagent file holds an opus request counts that request. Declaring the same session twice gives requests 10 and duplicateRequests 0, not 20. A session with all rows before `from` gives PARTIAL, not requests 0 with complete.

## F9 — MEDIUM — "Unknown model is null" would taint real censuses via `<synthetic>`; "known non-top" has no list; the Codex vector is missing cache_write

Evidence: docs/work/evidence/wr-2026-09-26-merge-on-acceptance.census.json `combined['<synthetic>']` = all four fields 0. The substring tier list cannot tell "known mid" from "unclassified" (contracts L52-54). build-census.mjs:640-646 validates Codex `cache_write_input_tokens` as a subset of input, but contracts L47-51 omit it, so processedTokenTotal cannot apply the same invalid-vector check.
Fix (spec L27, add): "Known non-top families (docs/model-tiers.md): sonnet, haiku, gpt-5.6-terra, gpt-5.6-luna, codex-spark → false; top list → true; anything else → null. A null-tier model taints the top-tier cell only if its processed total is > 0 (the zero-usage `<synthetic>` rows do not). Otherwise the cell reports `unavailable (unclassified model <name>: <n> tokens)` with the observed top-tier subtotal."
Contract patch (contracts.d.ts:49-50): current `cached_input_tokens?: number; reasoning_output_tokens?: number;` → replacement `cached_input_tokens?: number; cache_write_input_tokens?: number; reasoning_output_tokens?: number;`. Add a doc line: "codex: throws if cached_input_tokens + cache_write_input_tokens > input_tokens or reasoning_output_tokens > output_tokens; claude: nested usage.cache_creation{ephemeral_*} is a subset of cache_creation_input_tokens and is never added."
Test contract: combined with `<synthetic>` zeros stays complete. A 5-token `claude-mystery-9` makes the cell unavailable. Codex {input 10, cached 8, cache_write 5} throws.

## F10 — MEDIUM — Baseline token scope mismatch is misframed; a like-for-like cell exists for free

Evidence: scout-T1 L22 and baseline L5: baseline tokens are `lead.windowByModel`, lead-model family, lead only. Build 1 was "done through subagents across ~58 files", so its subagent tokens are excluded. four-read's cell is `census.combined` = lead window plus all native subagents (build-census.mjs:1764-1767). Spec L28 says the mismatch is "lead-only baseline versus all declared roles", which implies native-subagent-inclusive `combined` is comparable. It is not.
Fix (spec L28 replacement sentence): "Formula equivalence is verified, but the baseline scope is lead-window only. four-read therefore adds one companion, `lead-only top-tier` = tier-filtered sum over `census.lead.windowByModel` (Claude) or `lead.observedWindowByModel` (Codex), as the only baseline-comparable token number. The all-role `combined` headline is labeled SCOPE MISMATCH against the baseline." There is no new data: the fields already exist.
Test contract: a census with lead opus 10 and subagent opus 5 gives headline 15 and companion 10. Recomputing N2 from the preserved vector gives 17,298,421 for the companion.

## F11 — MEDIUM (root question) — `host: 'claude'` silently narrows "all roles on both hosts"

Evidence: contracts L7, L11 fix the host literal to 'claude'. docs/census.md:63-64: "Shell-launched `codex exec` runners … are outside this session graph." The DONE Claude-led build uses Codex as builder or reviewer (plan D18, goal card "mixed handoff"). Those Codex roles would be invisible and unlabeled.
Minimal options for root: (a) allow `host:'codex'` with `transcript` relative to `--codex-home`, identity via `codexFirstMeta(file).meta.id === sessionId`, counted by `censusCodexLeadFile(file,{from,to,expectedId})` (all existing functions). Or (b) keep 'claude' only and add the fixed string `detached codex exec roles are not declarable` to `measurementScope.limitations` whenever roles is `native-plus-declared`. Do not leave it unstated. Test contract for (b): the limitation string is present. For (a): a declared Codex rollout with a mismatched session_meta id is PARTIAL.

## F12 — LOW — Evidence copies and the live proof are under-pinned

Evidence: spec L24 requires evidence as a confined repo file, but sidecars live outside the repo (review-run writes `<report>.identity.json`, review-run.mjs:335; the launcher sidecar is ad hoc). They carry `args[]`, `cwd`, `pluginRoot` and `claudeBin` (scout-T1 L11-12), and `args` can hold a brief. Spec L41 requires a real reread of "at least one Codex-led mixed lane" but does not name one, and no historical manifest exists (lane 40 predates it). Inventing one would be the historical-identity invention the brief forbids.
Fix (spec L24/L41, add): "The root copies only `{session, started|startedAt, sourceSha256}` of a sidecar into docs/work/evidence. Never args, cwd, paths or usage. The real mixed-lane proof names its lane, sidecar and transcript-relative path before build. If no lane has sidecar-backed identity, the real cell is reported as unavailable (`no declared historical roles`) and the discriminating proof is the unchanged-versus-changed census on the scout's witnessed detached file (20 rows → 10 requests → requests 10 once; declared twice → still 10; native-only run → absent)."

## F13 — LOW — Minor contract/spec precision

- contracts L37-42: `windowEnd: string | null` but `mature: boolean`. Pin `mature = asOf >= windowEnd`. With windowEnd null (parent never accepted), mature is false and coverage unavailable.
- Spec L25 "Identical duplicate lifecycle rows collapse" should say across `leadSegments` too (runCodexCensus merges segments only for tokens, build-census.mjs:1402-1433). Activity must read all identity paths, or a resumed lead's second segment is invisible.
- Wake dedup (brief attack): the existing classifiers count one row form each (response_item for notes, item_completed HookPrompt for Stop blocks, build-census.mjs:231-265) and never read prose for identity beyond the plugin envelope. That is verified adequate for single-file dedup. Cross-segment replay is covered by the previous bullet. No proximity join, which is correct.

---

## Verified absent / sound
- The token formula is already equivalent across hosts in code: four-read.mjs:52 for Claude; build-census.mjs:661-667 for Codex (input inclusive of cached/cache_write, reasoning not added). Spec item 4 therefore adds only statement and helper, with no recomputation risk.
- LF framing: lfLines is used by build-census and token-census. four-read's `/\r?\n/` split does not split on U+2028/2029. The withdrawn 30-malformed-row claim is correctly retracted.
- Direct-children-only plus separate, never-summed episode and commit counts avoid the commits+episode double count (four-read.mjs:524-548 unchanged).
- Wrong-lane UUID: the declaration-as-authority limit is stated honestly (spec L24). from/to clipping bounds a reused session. There is no cheaper sound attestation available from current sidecars (no lane key, per scout-T1 L11-12).

## Deadline feasibility and unknowns (Oct 1, before 15:00 NY)
- Feasible only if the mid builders take F1, F2, F3 and F5 in the first pass. Without them the four numbers can be printed but are not honest.
- Rework: every build accepted after roughly Sep 24 is immature at the read, so the rework cell will be provisional for the whole 0.20.18 window. That is expected; it must say so (F4/F5). Only 59b→59 can show a mature-looking episode, and even its window closes Oct 7.
- The baseline vectors live only in volatile %LOCALAPPDATA%\Temp (scout-T1 L22). The root must copy the sanitized vectors first, or the token comparison becomes unavailable.
- Unknown: whether the lead rollout's two open turns are nested or stale (F3 witness). If stale, the real Codex stall cell is PARTIAL by design. That is honest, not a failure.
- Unknown: whether any real Codex-led lane has sidecar-backed detached identities (F12). If none does, the real mixed-lane cell is unavailable and the discrimination rests on the witnessed file.
- Product/authority for root: F11 (Codex detached roles in scope or an explicit limitation). Whether a PARTIAL census may be accepted via `--no-census` for this lane's own accept (F7).
