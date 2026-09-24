VERDICT: APPROVE 3f4d213c61edaa0deab996eea3522653d8b37307

Independent Astra final source review of 86425a7..3f4d213c61edaa0deab996eea3522653d8b37307, 14 changed files, September 23, 2026 (America/New_York). Reviewed exact candidate diff, production seams, added tests, manifests, skills, work record and continuation/delivery contract. HEAD matched the candidate and the initial working tree was clean. No source edits, installed-home changes, live hooks, provider calls or external communication. Full suite remains with the assigned owner.

No blocking findings or required fixes.

Windows executable/argv repair

The original boundary failure is corrected: findOnPath's concrete Windows match is retained. Native .exe/.com matches execute directly; the supported npm layout selects adjacent node.exe plus node_modules/@openai/codex/bin/codex.js as a separate prefix argument. Unsupported matched wrappers return a deferred codex-error before execFile. The actual queue arguments remain an array, and the target CODEX_HOME is scoped to the child environment. No shell interpolation or composer typing is introduced.

I independently ran the single candidate regression “a verified Windows npm shim reaches a real Node entry with the message as one argv item.” It passed on this Windows host. It copies native Node into a disposable fixture, executes the fixture's JS entry through the actual queueToCodexInbox/execFile route, and compares the child's received queue/thread/message arguments, including shell metacharacters. This proves the repaired process boundary, not merely a mocked expected vector. It performs no Codex/provider/queue call and touches only temporary fixture files.

Explicit --codex/CODEX_CLI overrides remain caller-supplied direct executables as before; this patch does not promise arbitrary wrapper compatibility. Existence checks verify the supported adjacent layout, not vendor authenticity or every npm installation layout. Failure remains explicit and recoverable.

Positive Codex child isolation

The helper reads only a bounded first metadata line, up to 256 KiB plus the newline sentinel byte, in chunks no larger than 8 KiB. It closes the handle on success, malformed JSON, absence, read error and oversize input. Actual native first-line metadata previously observed in this review lane contains source.subagent.thread_spawn.parent_thread_id/depth; no invented agent_id parity is used.

Classification requires session_meta, exact payload.id/input.session_id agreement, valid non-self parent UUID and positive integer depth. Confirmed children return before environment/slug resolution, registration, inbox reading or acknowledgment. Unknown evidence preserves the established lead path. This is a deliberate compatibility limit, not a claim of universal child isolation.

I independently ran 20 pure injected-filesystem/adapter adverse checks:
- CRLF and short reads;
- large multibyte UTF-8 metadata spanning chunks;
- exact maximum-byte valid metadata and over-cap rejection;
- self-parent, malformed parent, zero/noninteger/string depth;
- wrong record type and mismatched session ID;
- absent newline and corrupt JSON;
- open/read/close errors with handle-cleanup checks;
- SessionStart, UserPromptSubmit, PostToolUse and Stop confirmed-child events each returning before even accessing env/home, with no inbox action.

All 20 passed. No actual transcript contents were read by these probes. The committed 24 KiB padded child fixture covers the previously too-small 16 KiB cap regression; my large UTF-8 and exact-cap probes add independent boundary coverage. Guard placement leaves existing peer Stop recursion/ack behavior unchanged.

Pickup off-switch

decisions-pickup.mjs SHA-256 remains B958361DBA9951E0FF17E4645CF0AE705F7E9E1216F0860B62FCEFEEFA9A889F, exactly the previously approved artifact. Prior independent 12-case filesystem/stat-error review remains applicable and was not repeated. Admission checks both existing switches before project, receipt, page and transport work; status and attended accounting remain available. This is entry-time admission control, not cancellation of an already-running async pickup.

Documentation, release and scope

All three release manifests agree on 0.18.1. README accurately limits the change to launcher resolution, positive child metadata isolation and pickup switches. It explicitly denies historical consumer attribution and ongoing-completion enforcement.

The multi skill describes the bounded positive-child condition and unknown fallback. Its seen-cursor wording must be understood as hook emission/rendering evidence, not proof the intended lead consumed the context or disposed of a request; the accompanying contract correctly calls it deduplication evidence and requires separate owner disposition. No new automatic-turn or user-outcome improvement claim is established.

The continuation/delivery contract is a plan with scoped future acceptance checks. It distinguishes native Stop veto from post-completion queued turns, requires explicit ongoing scope/cancellation/ancestry before enforcement, and keeps Linux delivery history separate from Windows proof. The work record honestly states late admission and unknown whole-task usage. Historical diagnostic statements describe the motivating state, while the README identifies what this candidate repairs.

Known separate work remains separate: raw decisions capture privacy is not repaired by this candidate and no such claim is made. The independently prepared privacy contract is a subsequent scoped change, not grounds to silently expand this delivery review or represent the entire harness as complete.

Validation receipt

- Independent pure child isolation/adverse probes: 20/20 pass.
- Candidate real Windows argv regression: 1/1 pass.
- Scoped git diff --check 86425a7..3f4d213: pass.
- Pickup switch: unchanged exact approved source hash and prior 12/12 adverse checks.
- Full suite: not run by this reviewer; integration owner must report its result separately.

Approval covers the named source revision. It does not establish installation, live queued delivery, actual running-child hook payload availability in every case, historical note-reader identity, or autonomous project completion.

