VERDICT: NEEDS_FIXES (2) 455b3ab3371aca809ee644189295f4ac4f5a6b78

# P1 review: shared goal/bearings hook helper (skills-o, Claude high-tier)

September 25, 2026, 1:40 PM America/New_York. This is a read-only review of `C:/Users/benzh/orca/workspaces/claude-delegation/astra-codex-p1`. The review tip is `455b3ab`, after the lead moved it from `5225d21`. The base is `7f188b0`. I checked the tip against `contracts.md` at `a141cee` and against the spec red-team findings (`skills-o-codex-parity-spec-findings.md`).

I made no edits to the checkout. I read git state with `git diff` and `git archive` only. Every probe ran on scratch exports (`base`, `cand` = 5225d21, `tip` = 455b3ab) in my session scratchpad. HEAD is still `455b3ab` and the status is clean.

Scope note: while I was reviewing 5225d21, the tip-delta appeared in the checkout as uncommitted edits, and was later committed as 455b3ab. Every result below is re-verified against 455b3ab. That commit already fixes three things I had found on 5225d21:
- the `\n` context separator now matches the contract's `\n\n`;
- the static goal imports are now lazy dynamic imports, so an import failure drops only the goal context;
- `leadIdHint` is no longer duplicated inline in the Claude hook.

## Findings

### F1. MINOR: a pre-existing lead fixture now makes the new goal path read the real `~/.agents` switches, and the same test writes real continuation state

- **Evidence.** In `hooks/multi-codex-hook.test.mjs:103-121`, the `'lead'` case of "lead, missing metadata, corrupt metadata, and mismatched metadata…" passes `env: { NOTE_SLUG: 'lead', CODEX_HOME: '/codex-home' }` (`:116`) with no `AGENTS_HOME`. That fixture is a confirmed lead on UserPromptSubmit, so at the tip it now enters `goalContextForLead`. `activeSwitch`/`goalCardResult` then fall back to `homedir()/.agents`.
- **How I measured it.** I preloaded a filesystem spy (`--import spy.mjs`, with `syncBuiltinESMExports`) and ran this one test file against both trees. It logged every access under the real `C:/Users/benzh/.agents`:
  - **Base:** `statSync ws-off` ×1, `statSync ws-off-continuation` ×1, plus a continuation state write: `mkdirSync ws/continuation`, a `.claim` dir, a tmp write and a `renameSync` onto `ws/continuation/eb40db8e….json`.
  - **Tip:** the same, plus `statSync ws-off` ×1 and `statSync ws-off-goalcard` ×1. Those extra stats come from the new goal path.
- **Why it matters.** The brief says tests must not touch the real `~/.agents`. This is the `1fdd51b` bug class. A real `ws-off` on the machine would silently turn this lead case into a no-goal run. The continuation write is pre-existing (the base does it too), but it sits in P1's owned test file, and the same one-line fix removes it.
- **Disclosure.** My two spy runs (base and tip) wrote that real continuation state file once each. It is keyed to the fixture session id `01a0c5f8-…`, not a real session. I did not delete it, because it is not mine to remove. Every other test and probe ran with scratch `AGENTS_HOME`/`HOME`/`USERPROFILE`/`CODEX_HOME`.
- **Fix (mechanical)** in `hooks/multi-codex-hook.test.mjs:116`.
  - Current:
    ```js
          home, env: { NOTE_SLUG: 'lead', CODEX_HOME: '/codex-home' }, now: NOW,
    ```
  - Replacement:
    ```js
          home, env: { NOTE_SLUG: 'lead', CODEX_HOME: '/codex-home', AGENTS_HOME: path.join(home, '.agents') }, now: NOW,
          continuationDeps: { env: { AGENTS_HOME: path.join(home, '.agents') } },
    ```
  - **Checked outcome.** I applied it on a scratch copy. The file passes 12/12, and the spy logs zero real-home accesses.
- **Missing pin.** Add the test that shows injected beats ambient; contract: "Scratch test environments override ambient homes". Every new test sets ambient `process.env.AGENTS_HOME` to the same scratch dir it injects (`agentsHome(t, home)`, `:48-55`, then `env = { AGENTS_HOME: process.env.AGENTS_HOME }`). A regression to `process.env` in the adapter would therefore pass. Append:
  ```js
  test('an injected scratch AGENTS_HOME beats an ambient one carrying ws-off', async (t) => {
    const home = tmp(); const root = project(); const ambient = tmp();
    t.after(() => { for (const d of [home, root, ambient]) fs.rmSync(d, { recursive: true, force: true }); });
    fs.writeFileSync(path.join(ambient, 'ws-off'), '');
    const prior = process.env.AGENTS_HOME;
    process.env.AGENTS_HOME = ambient;
    t.after(() => { if (prior === undefined) delete process.env.AGENTS_HOME; else process.env.AGENTS_HOME = prior; });
    const file = transcript(home, metadata({ id: LEAD, sessionId: LEAD, source: 'cli' }));
    const out = await runCodexHook(
      { hook_event_name: 'SessionStart', session_id: LEAD, transcript_path: file, cwd: root },
      { home, env: { AGENTS_HOME: path.join(home, '.agents') } },
    );
    assert.match(contextOf(out), /GOAL: Ship the parity hook/);
  });
  ```
  - **Checked outcome.** It passes on the tip (13/13). On a scratch copy with `advisoryFn(input, cwd, role, env)` mutated to pass `process.env`, it fails (12/13). It therefore discriminates.

### F2. MINOR: the comment claims more than the 500 ms race does (`hooks/multi-codex-hook.mjs:139-141`)

- **Evidence.** The comment says "A slow dynamic import or receipt read therefore cannot consume the peer/continuation budget", then concedes that synchronous filesystem work is not preemptible. The receipt read is synchronous: `bearings-state.mjs` `check()` uses `readFileSync` of the receipt and hashes `reportPath`/`leadResponsePath` with `readFileSync`. `goalCardResult` is fully synchronous too. The Codex goal path's only real asynchronous work is the two dynamic imports, so a slow receipt or evidence read does consume the event loop that the peer work and main's `BUDGET_MS` run on.
- **Why it matters.** The packet says not to bless that broader claim, and the contract says the limitation must be stated rather than concealed. This is wording only. My probes found no behaviour problem.
- **Fix (mechanical)** in `hooks/multi-codex-hook.mjs:139-141`.
  - Current:
    ```js
      // Goal/card work is advisory and bounded separately from peer delivery. A slow dynamic import or
      // receipt read therefore cannot consume the peer/continuation budget; synchronous filesystem work
      // remains subject to the host runtime and is deliberately not claimed preemptible.
    ```
  - Replacement:
    ```js
      // Goal/card work is advisory and raced separately from peer delivery, so an unresolved or rejected
      // advisory promise (for example a slow dynamic import) drops only the goal context. The card read and
      // bearings receipt/evidence reads are synchronous and are NOT preempted by this race: they still run
      // on the event loop shared with peer delivery and main's BUDGET_MS.
    ```

## Checks and results (all at 455b3ab)

- **Focused gate rerun on the tip export.** I ran `multi-codex-hook`, `delegation-reminder`, `continuation-native`, `multi-hook-core`, `goal-card` and `bearings-state` tests with scratch homes. Result: **145/145 pass**, 11.2 s. The sealed 84/84 is a different subset. I did not reproduce that exact selection, but these files are a superset of P1's owned tests.
- **Codex stdout, base against tip, on every event.** I ran `runCodexHook` over the full grid below, 378 comparable cases:
  - events: SessionStart, UserPromptSubmit, PostToolUse, PostToolBatch, Stop, Interrupt;
  - roles: confirmed lead, unknown (no transcript), confirmed child (spawn metadata plus inherited slug);
  - peer notes: none or one;
  - continuation: none, context text, or afterFlush-only;
  - card: ok, absent, or rejected;
  - SessionStart source: startup or compact.

  Results:
  - 348 cases are byte-identical.
  - The 30 that differ are all lead SessionStart/UserPromptSubmit with an ok card, plus lead SessionStart with a rejected card.
  - In each of those, base `additionalContext` is an exact prefix followed by `\n\n` + goal, and base `systemMessage` is an exact prefix followed by `\n` + notice.
  - `ackIds`, `suppressOutput`, `decision` and `continuationAfterFlush` presence match in each of those cases.
  - Zero unexpected differences.
- **Specific outcomes from that grid:**
  - PostToolUse, Stop, Interrupt and PostToolBatch deep-equal the base.
  - The peer `systemMessage` survives on UserPromptSubmit and PostToolUse.
  - Unknown identity is identical on every event, and an unknown SessionStart with no peer returns null.
  - A child is null everywhere.
  - A lead with no slug and no continuation gets a standalone `{ackIds: [], output:{suppressOutput, hookSpecificOutput}}`.
  - An afterFlush-only continuation with no peer stays dropped in both trees, so no new continuation flush occurs.
- **Claude stdout, base against tip.** I spawned `delegation-reminder.js` with scratch homes over 180 cases, all byte-identical:
  - events: UserPromptSubmit, SessionStart, PostToolBatch (overdue fired clock), PostCompact;
  - card: ok, absent, rejected;
  - switches: none, `ws-off`, `ws-off-goalcard`, `ws-off-bearings`, and the typo `ws-off-goal-card`;
  - input extras: lead, `agent_id` + builder `agent_type`, `source: compact`.
- **Lazy import check.** The goal-context import is reached only through `cardResult`, `rejectionNotice`, `bearingsNotice` and `leadIdHint` (`delegation-reminder.js:304-337`). Those are called only on SessionStart and on PostToolBatch above the threshold. UserPromptSubmit returns before any of them (`:369-373`).
- **Shared rendering matches across hosts.** For the same project and bearings state, Claude and Codex lead SessionStart produce identical `additionalContext` (card + due notice + lead-id hint) and an identical `systemMessage`. The rejection `systemMessage` is identical too. A rejected-card UserPromptSubmit on Codex returns null. `leadIdHint` exists once, in `hooks/lib/goal-context.mjs:39-43`, and the text matches the base Claude string exactly.
- **Switches, spelled as the code spells them, with positive controls on the same fixture:**

  | Switch | Card | Bearings | Hint | Pane notice |
  |---|---|---|---|---|
  | none | on | on | on | on |
  | `ws-off` | off | off | off | off |
  | `ws-off-goalcard` | off | off | off | off |
  | `ws-off-bearings` | on | off | off | off |
  | `ws-off-goal-card` (typo) | on | on | on | on |

  The typo file changes nothing, so no alias was added. On UserPromptSubmit there is never a new `systemMessage`. Injected env beats ambient in both directions: with ambient `ws-off` and a clean injected home the card is present; with a clean ambient home and injected `ws-off` the result is null.
- **Fails open.** The suite's "rejecting or stalled advisory" test preserves peer delivery. My timed probe, with a never-resolving advisory and an empty inbox, returned null in 515 ms. Import failure now returns null inside `goalContextForLead` (`multi-codex-hook.mjs:68-77`).
- **Compact source.** `systemMessage` is suppressed when `input.source === 'compact'`, and `additionalContext` is kept (`:86`). It is conditional on real input, and nothing is invented.
- **No new state.** After Codex goal runs, the injected home has no `ws/` dir, so there are no tally or fired writes. There is no new event, registration or timer. `withBudget` is the existing helper.
- **No extra idle turns.** Goal context goes only into `additionalContext`/`systemMessage` on SessionStart and UserPromptSubmit. There are no Stop or Interrupt effects and no `decision: block`.

## Limits (stated, not findings)

- **Unref'd timer.** `withBudget`'s timer is unref'd (`:217`). In a real hook process, an advisory that hung with no active handle would let Node exit before 500 ms with nothing printed. My probe without a keep-alive exited with "unsettled top-level await". The suite's stalled test passes only because the runner keeps the event loop alive. The outer `BUDGET_MS` race has the same property at the base, and the goal path has no handle-less hang today, so this is not a regression. It does mean "a stalled advisory never erases peer output" is proven only under the test runner.
- **Startup classification.** Real SessionStart classification (spec M2) is unverified. The tests pin only the fixture outcomes: lead gets context, unknown gets nothing new. Delivery at a real startup depends on metadata being there when the hook runs. That is for P3 to document.
- **Builder worktrees.** Builders in separate worktrees can classify as leads and see "bearings due" (spec M5). The contract rules this out of scope for P1.
- **Missing card.** There is no separate absent-card test on UserPromptSubmit with a peer. The grid shows it matches the base byte for byte.

## C4 fields

Cause: new lead-eligible code runs inside a pre-existing test fixture whose injected env has no `AGENTS_HOME`, and the new tests make ambient equal injected, so the host-isolation contract is not pinned. A code comment also claims the 500 ms race bounds the synchronous receipt reads.

Discriminating check: a filesystem spy on the Codex test file logs real `~/.agents` `ws-off`/`ws-off-goalcard` stats and a `ws/continuation` write (zero after F1's fix). The proposed ambient test passes on the tip and fails when the adapter is mutated to `process.env`.

Fix location: `hooks/multi-codex-hook.test.mjs:116` plus one appended test, and `hooks/multi-codex-hook.mjs:139-141` (comment only).

Simplification: none needed in the runtime. The tip's composition already appends after `composeContinuationResult`, reuses `withBudget`, and imports lazily.
