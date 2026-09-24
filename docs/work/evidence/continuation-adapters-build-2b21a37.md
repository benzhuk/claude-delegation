VERDICT: PASS_WITH_LIMITS — source adapters are integrated and focused gates pass; Claude release still requires the independent actual-native adapter fixture, and Codex remains deliberately nonblocking pending its native callback proof.

# Continuation adapters build

Built September 23, 2026, America/New_York. Commit `2b21a3711584528c55d6737ebd6d830cee1010a7`.

Cause: the existing Claude and Codex peer hooks returned early on missing peer slug, applied the PostToolUse mtime guard before any other lifecycle work, and emitted/ACKed only peer results. The continuation core therefore had no real completion-boundary caller, no native episode normalization, and no shared flush point.

Discriminating check: the final sealed command was:

`node scripts/run-tests.mjs hooks/continuation-native.test.mjs hooks/multi-hook-core.test.mjs hooks/multi-codex-hook.test.mjs hooks/multi-inbox.test.mjs`

Result: 64 tests passed, 0 failed, sealed home `C:/Users/benzh/AppData/Local/Temp/sealed-home-HStBX5`. `git diff --check HEAD^ HEAD` passed and the worktree was clean.

Fix location:

- `hooks/continuation-native.mjs` provides bounded native normalization. Claude reads at most a positioned 64 KiB transcript tail, accepts only non-meta string-content user rows, excludes tool-result rows, and uses the latest true-user UUID for PostToolUse/Stop. Bind activation accepts only a complete successful tool-response JSON value containing `continuationBind:{requestId,epoch}`; it never greps shell text. Codex role classification is lead/child/unknown from bounded session metadata and never uses inherited pane identity.
- `hooks/multi-inbox.js` invokes continuation independently of peer slug and the ledger mtime guard, after the positive Claude child guard. Stop collects the peer result first, passes `peerWillBlock`, emits one composed object, runs continuation `afterFlush` after the actual stdout callback, then ACKs the exact existing peer IDs only after a successful flush.
- `hooks/multi-codex-hook.mjs` has the same ordering and composition. Existing peer behavior remains available for unknown role/profile; the new continuation gate stays disabled for unknown role/profile.
- `hooks/multi-hook-core.mjs` merges context or Stop correction into one native output without changing peer ACK IDs.

The executable Claude adapter regression covers prompt epoch creation without a peer slug, successful CLI bind marker parsing from the actual `tool_response` object shape, matching transcript UUID activation, one Stop block, and silent `stop_hook_active` re-fire. Composition tests prove peer-first ordering and exact ACK preservation. Failure tests cover bounded tail reads, meta/tool-result exclusion, malformed markers, tri-state Codex role, and unsupported Codex profile behavior.

Simplification: one shared native normalizer and one composition helper remove provider-specific duplicate output/flush logic. The implementation adds no scheduler, Stop emitter, provider call, polling loop, shell-text parser, or second work ledger.

Limits:

- The Claude capability profile is `claude-code-stop-v1`: Claude Code 2.1.281 SDK/print supplied executable observation, and the official native Stop contract supplies the interruption boundary. TUI was not separately observed. Production shipment still depends on the independent actual-harness native fixture proving a real CLI bind result reaches the real PostToolUse callback and yields one native correction.
- The in-repo end-to-end adapter test uses the real hook process/core/CLI and exact tool-response shape, but it hand-feeds the callback payload; it is not the actual native CLI fixture.
- Codex 0.156.1 native MCP-hook evidence arrived after the commit: UserPromptSubmit and normal/blocked/re-fired Stop share exact `session_id` and `turn_id`; the second Stop retains that identity with `stop_hook_active:true`; Interrupt shares the initial prompt identity and produces no Stop. The production command profile nevertheless remains `profile:null` and `cancellationVerified:false`: in the already-nested Windows fixture, native command hooks failed with OS error 5 even for a harmless trusted command, so the actual production command adapter did not execute. Evidence: `C:/Users/benzh/AppData/Local/astra-native-fixtures/codex-native-completion-Lqs2BP/summary.json` and `C:/Users/benzh/AppData/Local/astra-native-fixtures/codex-native-completion-YzzT4s/app-normal.appserver.stdout.jsonl`.
- A bounded Claude tail with no complete true-user row fails closed. This can reduce coverage on very large transcripts and requires native-fixture usability measurement; it cannot create an unauthorized correction.
