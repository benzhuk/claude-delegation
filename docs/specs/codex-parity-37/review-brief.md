# Lane 37 Claude Opus review brief

Task: independently review the exact artifact named in the accompanying skills-a review ASK. Do not review a moving branch tip. Work wr-2026-09-28-codex-parity. Goal: fewer lost/stalled Codex builds and a real Codex-led / Claude-reviewed handoff.

Inputs: pinned-spec.md, territories.md, scout-parity.md, L37-builder-report.md, L37-tests-report.md and retained gate receipts at paths named in the ASK. Source base 8b8c2f04cdabe25d1a996ad76bee7e6f2391b6ee, prep commit fa29e134d1d669513a7fac142e6e5b32ec035f80. Root-only record and reports are evidence, not implementation authority.

Attack priorities:

1. A check that passes because it is not looking: enumerate actual Claude script/event pairs. Remove supported wiring, add overlap, introduce an unknown pair, corrupt an unsupported reason. Test must fail for the appropriate cause, not an unrelated import error. Codex-only Interrupt is allowed. Declared wrapper equivalence must match executed behavior and actual installer output.
2. Native context delivery: wiring SessionStart and backlog prompt/post/Stop must really reach model context. Do not confuse systemMessage visible to a person with additionalContext visible to the model. Preserve existing peer blocks, ack-after-flush, continuation callbacks, child suppression, kill switches and backlog cadence. No lost notes or duplicate/inherited identity registration. Child processes bounded and reaped; test fixtures isolated from real agent homes.
3. Guard support: Codex delete guard is already installed through shared trust machinery. Manifest entry must match that actual installer, native matcher and deny reason. Document top-level versus native-child limits rather than claiming every Codex command guarded. Dispatch and reminder exclusions must be precise capability reasons, not simply unwired today.
4. Census truth: current --tasks support does not erase horizon, depth, native ancestry, home or malformed-file checks. Document exactly which tokens can and cannot count, including the external Claude reviewer and this lead's old start date. Never turn missing coverage into zero tokens or proven no stalls.
5. Scope and simplicity: no Claude script changes, installer rewrites, census reader changes, runner changes, extra state machine or installations into real homes. Check required janitor skill documentation.

Review source-read-only. Targeted tests may run under the host mutex, preserving every exit and failure. No unchanged full-suite reruns. No docs/work writes, merges, publication, installs or recursive cleanup. All temporary files under the Lane37 scratch/session directory or a host equivalent explicitly named in the report.

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell.

Report first line must be VERDICT: APPROVE <full artifact sha> or VERDICT: NEEDS_FIXES <full artifact sha>. Findings need severity, file:line or measured evidence, concrete remedy (exact patch for mechanical issues). Include Cause:, Discriminating check:, Fix location:, Simplification:. Name reviewer native Claude session id and Opus model, exact gate exits and limitations. Do not infer approval from test success. Return report path via skills-fable; root alone records the reviewed Log and both peer note IDs. ETA 15 minutes, report or park by then.
