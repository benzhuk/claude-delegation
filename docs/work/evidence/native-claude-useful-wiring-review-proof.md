VERDICT: PARTIAL

# Native Claude useful wiring review proof

## Outcome

Claude Opus 5.5 independently reviewed immutable commit `e39f851d52242c31eb5b49ac52d0ec8e447c2099` and returned `NEEDS_FIXES`. The production and test snapshots were extracted before the source checkout advanced. Local `git hash-object` verification exactly matched the candidate blobs:

- `scripts/wiring-check.mjs`: `f4d773b25803fdfea259c199fd6779846673e1e9`
- `scripts/wiring-check.test.mjs`: `127c635be7c0dab412a773a54cef542bfc4f57df`

The exact model-authored review is preserved at [native-claude-wiring-review-e39f851.md](native-claude-wiring-review-e39f851.md) (SHA-256 `d82d2a772409799c64db5f4a818af7088c217fc78befc7c19b75aec7d624136a`). It was recovered byte-for-byte from the denied native Write tool input. This is authorship evidence, not a claim that the Write tool succeeded.

The review confirms the parent reproduction as a release-blocking HIGH finding: syntactically valid but structurally malformed hook settings collapse into a known non-match, making `hook_absent` return `ok:true`. It requires malformed structures to be `unknown`, while `{}`, `{hooks:{}}`, a missing event, or an empty well-formed event array remain known absence. It also reports:

1. MEDIUM: missing/empty `event` or `substring` can return a definite answer, including false green.
2. LOW: the `--line` fallback can still allow a throwing `opts.fsImpl` accessor to escape.
3. LOW: the suite no longer reaches the per-check catch and lacks malformed default/private-list coverage.
4. Nit: the later `wiring-invalid-row` branch is unreachable after invalid rows are filtered earlier.

The model separately found the typed read/stat failures, invalid-row pre-merge handling, fixed diagnostic privacy, and main fallback correct in the captured candidate.

## Native continuation observation

The released 0.20.0 plugin was frozen from the same commit at `native-useful-wiring-review-e39f851/plugin-0.20-e39f851` and loaded with `--plugin-dir`. `AGENTS_HOME` was fresh and had no `ws-off`; setting sources were empty; MCP was strict and empty; Orca, note, and Claude messaging environment variables were removed.

Native hooks actually ran. The stream records matching started/success-response counts: SessionStart 3, UserPromptSubmit 3, PostToolUse:Read 22, PostToolBatch 5, and Stop 2. UserPromptSubmit produced one routing context and two empty outputs. Neither UserPromptSubmit nor Stop produced a continuation epoch/context. No continuation state file was created, and the model correctly refused to invent epoch/session values, so `bind`, `status`, and `account` did not run.

`run-summary.json` reports `hook_event_count:0` because the disposable runner's counter looked for `hook` in the top-level `type`; Claude emits these as `type:"system"` with `subtype:"hook_started"` / `"hook_response"`. `stdout.jsonl` and the derived `hook-summary.json` are the authoritative hook evidence.

The runner retained `--no-session-persistence`. This makes missing transcript correlation a fixture limitation consistent with the observed empty continuation output; this run does not prove a core or model defect.

The model attempted the required Write once. Claude Code denied it under `dontAsk` because the runner used `Write(path)` permission syntax. The native debug log explicitly says file permissions match `Edit(path)` rules and that Edit rules cover file-editing tools. The selected repo evidence therefore remains `VERDICT: PENDING`, and accounting remains open. There was no retry and no out-of-band bind/account or identity injection.

## Runtime evidence

- Actual provider run: `2026-09-24T03:06:01.572Z` through `2026-09-24T03:08:37.152Z` (155,580 ms wall; 154,555 ms reported duration).
- Model: `claude-opus-5-5`, high effort.
- Result: native exit 0, subtype `success`, `is_error:false`, 13 turns.
- Usage: 14,925 output tokens including 7,085 thinking tokens; 60,201 cache-creation input tokens; 116,414 cache-read input tokens; reported cost `$0.8034388`.
- Provider tools: zero web searches and zero web fetches.
- Permissions: one denied Write; all Read calls and hooks completed.
- Initial preflight at `native-useful-wiring-review-e39f851/run` exited in 186 ms before hooks/provider because `{}` was not a valid MCP config. It has no model usage or cost. The canonical empty `{mcpServers:{}}` was then used for the single provider call.

Primary evidence:

- `native-useful-wiring-review-e39f851/run-real/run-summary.json`
- `native-useful-wiring-review-e39f851/run-real/stdout.jsonl`
- `native-useful-wiring-review-e39f851/run-real/claude-debug.log`
- `native-useful-wiring-review-e39f851/run-real/launch.json`
- `native-useful-wiring-review-e39f851/run-real/hook-summary.json`
- `native-useful-wiring-review-e39f851/run-real/native-claude-authored-review.md`
- `native-useful-wiring-review-e39f851/repo/docs/work/evidence/candidate-e39f851.patch`
- `native-useful-wiring-review-e39f851/repo/review-brief.md`

No source repository file, production installation, personal configuration, or private Notion content was changed by the worker. This was a real provider call; no external issue, peer message or public report was posted. The parent later copied this proof and the unchanged authored report into repository evidence.

## Lead disposition

The late findings reopened release acceptance even though the intermediate source had passed its prior review and full suite. Malformed selected containers/commands were already fixed in ae613fc. Missing required check fields, denied-switch evidence and the off-switch exception boundary were addressed together at the existing evaluator admission/read boundaries in c50fb22. Explicit empty substring remains intentional match-any; missing or nonstring substring is invalid. A proposed production check for injected nonstring utf8 reads was declined because it hardens a test double rather than the real fs contract. The new exact artifact passed independent Astra review; source acceptance still requires its complete integration gate. This review found useful defects but did not establish live continuation binding, native output writing or accounting.
