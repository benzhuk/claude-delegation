VERDICT: APPROVE db5ae5c714861648f6ce1481eefae230c94e26ff

# Codex parity: independent seam review

I started on 90ee83d04405c3e97d7de1b52f86acc04716ed8a. The coordinator then moved the target, so I reviewed the delta 90ee83d..db5ae5c (f0f32e9, 72bcc3a, 2a3ed24, db5ae5c) as well and re-ran every probe on db5ae5c. This verdict is for db5ae5c.

I am a fresh seam reviewer. I did not read the P1, P2 or P3 reviewer findings files or the builder reports. I did read the P2 round-1 review evidence committed in the tree, only to see which JSON-null items it had already raised. I did one review, the seam review. I did not write the P2 final findings.

The checkout at astra-codex-parity was read-only for me. I exported the tree with `git archive` into my scratchpad (`src` = 90ee83d, `src2` = db5ae5c) and ran everything there.

## Blocking findings

None. The three findings below are LOW. None of them contradicts the adjudicated contract. Each can be fixed after acceptance or accepted as it stands.

## Non-blocking findings

### L1. LOW: the static bearings import makes the card depend on the bearings module, a small regression on the Claude side

- Evidence: `hooks/lib/goal-context.mjs:7` imports `skills/bearings/scripts/bearings-state.mjs` at the top of the file. Both adapters load goal-context as one unit: Claude at `hooks/delegation-reminder.js:304-338`, Codex at `hooks/multi-codex-hook.mjs:71-74`. So if the bearings module fails to load, the goal card disappears too.
- At 8cebeda, Claude imported `goal-card.mjs` and `bearings-state.mjs` separately, so a broken bearings script lost only the bearings notice.
- Scratch mutation (on the `src2` copy only, then restored): with `bearings-state.mjs` renamed, a Claude `SessionStart` with a valid card printed nothing and exited 0. The card was silently lost.
- The packet calls the P1 imports "lazy optional". Bearings is not optional at the helper level.
- Impact is small. Both files ship in the same plugin root, and the failure is silent rather than a crash.
- Fix (mechanical). In `hooks/lib/goal-context.mjs`:
  - Current line 7: `import { check as checkBearings } from '../../skills/bearings/scripts/bearings-state.mjs';`
  - Replacement: delete that line.
  - Current lines 28-29:
    ```js
      try {
        const checked = checkBearings({ repo: cwd, env });
    ```
  - Replacement:
    ```js
      try {
        const { check: checkBearings } = await import('../../skills/bearings/scripts/bearings-state.mjs');
        const checked = checkBearings({ repo: cwd, env });
    ```
  - Predicted outcome: with the bearings script missing, both adapters still deliver the card and bearings is null. The wording is unchanged and the existing 56 hook tests stay green. Claude's prompt route still never imports goal-context.

### L2. LOW: work-record refuses the Codex UNSUPPORTED report, but the error is generic and no test pins this join

- Evidence:
  - `scripts/work-record.mjs:705-708` refuses any first line that is not `VERDICT: COUNTED` with the generic error `census file does not begin with the census header line`.
  - `docs/census.md:36-39` promises that `accept --census` refuses the Codex report and says to use `--no-census`.
  - My probe on db5ae5c: the real `build-census.mjs` output for `codex-lead.jsonl` gave `isCensusFile === false`. The refusal holds.
  - `scripts/work-record.test.mjs` has no Codex or `UNSUPPORTED` case. Only the generic "lacking the recognised header" test at about line 1584 covers this path.
- Risk: if `CENSUS_HEADER_RE` is ever broadened, the Codex refusal regresses silently. The operator also gets no pointer to `--no-census`.
- Fix (mechanical, keeps the error code `census-missing`). At `scripts/work-record.mjs:705-708`:
  - Current:
    ```js
      if (!isCensusFile(text)) {
        throw acceptanceError(
          `census file does not begin with the census header line, refused: ${censusPath}`,
          "census-missing",
        );
      }
    ```
  - Replacement:
    ```js
      if (!isCensusFile(text)) {
        const unsupported = /^VERDICT: UNSUPPORTED\b/.test((text.split(/\r?\n/, 1)[0] ?? "").trim());
        throw acceptanceError(
          unsupported
            ? `census file reports an UNSUPPORTED (not complete) census, refused - use --no-census "<reason>" and attach the observations separately: ${censusPath}`
            : `census file does not begin with the census header line, refused: ${censusPath}`,
          "census-missing",
        );
      }
    ```
  - Also add an end-to-end test: run `build-census.mjs --lead scripts/build-census.fixtures/codex-lead.jsonl --out <tmp>`, then `acceptRecord({... censusPath: <tmp>})`. Assert `code === "census-missing"` and `/UNSUPPORTED/`.
  - Predicted outcome: the new test passes, and the current generic-header test still passes because the plain branch is unchanged.

### L3. LOW: the Codex JSON still has a numeric-zero subagents block

- Evidence: on db5ae5c, `--json` for the Codex fixture has `combined`, `lead.totalByModel` and `lead.windowByModel` null. The observed values are correctly moved under `observed*`. But `subagents` is still `{fileCount:0,totalTurns:0,totalByModel:{},totalByRole:{},roleFileCounts:{},...}` (built at `scripts/build-census.mjs:756-764`).
- Two statements disagree with that:
  - `docs/census.md:33` says a Codex lead "emits no child, role, or combined-spend table".
  - The contract's "nulls for unsupported JSON values" rule applies.
- The Markdown is correct. Nothing in the repo consumes this JSON, and work-record refuses a JSON file on its first line. So this is presentation only, and it is P2's call.
- Fix: in `runCensus`, when `codex` is true, emit `totalTurns`, `totalByModel`, `totalByRole` and `roleFileCounts` as null (keep `fileCount`, `unreadableDirs` and `incomplete`). Alternatively, qualify the census.md sentence as Markdown-only.

## No defects found in these areas

- **Shared helpers against both adapters.**
  - The two adapters produce byte-identical card, due-notice and `--lead-id` hint text. I checked this with a real Claude hook process and `runCodexHook` on the same fixture.
  - Neither adapter duplicates a renderer. Claude passes `process.env`; Codex passes `deps.env ?? process.env`.
  - Injected env wins over ambient: an ambient `AGENTS_HOME` holding `ws-off` did not suppress Codex output when a scratch `AGENTS_HOME` was injected. db5ae5c now pins this in a test.
- **Switches** (Codex, injected home), and Claude matches the contract's coupling:
  - `ws-off-bearings` leaves the card and drops bearings, its systemMessage and the hint.
  - `ws-off-goalcard` (created as a directory, which also counts as present) gives null.
  - `ws-off` gives null for the new context (`goal-card.mjs:137-146`, `multi-codex-hook.mjs:83`).
- **Events.**
  - Codex adds context only on `SessionStart` and `UserPromptSubmit` (`multi-codex-hook.mjs:67`). `PostToolUse`, `Stop` and `Interrupt` gave null.
  - `UserPromptSubmit` adds no new systemMessage.
  - `hooks/hooks.json`, `hooks/codex-hooks.json`, `scripts/mirror-shared-skills.mjs` and both plugin manifests are unchanged in `main...db5ae5c`. No event, registration, state or timer was added.
- **Resume and compact.**
  - `source:"resume"` gets the full advisory plus the pane notice. The docs say "not once across all resumes".
  - `source:"compact"` keeps the model context and drops the new bearings pane notice (`multi-codex-hook.mjs:87`). This applies only when the input actually carries `source`.
  - The Claude compact behaviour is unchanged (probe).
- **Limits of what startup can prove.**
  - Only a positive `cli`/`vscode` lead gets context. A missing `transcript_path`, `exec` source metadata or unknown metadata gives null.
  - The docs say each event needs its own usable native metadata, that SessionStart stores no classification, and that this is source capability rather than an installed or live route. That matches the code.
  - The db5ae5c comment at `multi-codex-hook.mjs:139-142` correctly says the 500 ms race does not preempt synchronous reads.
- **Every behaviour sentence in the docs against P1.** This covers the README feature bullet and the 0.20.9 entry, `docs/native-use.md`, and `skills/bearings/SKILL.md`. It includes the 1,200-byte cap (`RENDER_MAX_BYTES`), a missing card being silent, a rejected card at an eligible SessionStart only, children excluded, unknown identity keeping only inbox and continuation, the three switch semantics, and fail-safe on stat errors. I found no contradiction.
- **The unsupported P2 report against work-record.** The report's line 1 is `VERDICT: UNSUPPORTED …`, so work-record rejects it (see L2). `--no-census "<reason>"` accepts, as the tests show.
- **The complete Claude census.**
  - It still uses its dedicated `leadLastMessageAt`, read from the first line only (`work-record.mjs` `extractCensusTimestamp`).
  - An unreadable default directory still gives `INCOMPLETE`, and accept refuses it with `census-incomplete`.
  - There is no stale generic-date fallback: `formatText`'s `leadLastMessageAt || windowEndAt` falls back to the same `lead.lastAt` value.
- **Script paths and packaging.**
  - `hooks/lib/goal-context.mjs` is tracked. Its `../../scripts/goal-card.mjs` and `../../skills/bearings/scripts/bearings-state.mjs` resolve both under `${CLAUDE_PLUGIN_ROOT}` and `${PLUGIN_ROOT}`; neither plugin manifest restricts which files ship.
  - The mirror wires the checkout's own `hooks/multi-codex-hook.mjs` (`mirror-shared-skills.mjs:75`), so the relative imports resolve there too.
  - The `wiring-check.mjs` and `mirror-shared-skills` flags the docs name all exist.
- **Delta 90ee83d..db5ae5c.** It changes the P1 test isolation and one comment, and in P2 it nulls or relabels the JSON totals and removes a dead `formatText` branch. It does not change runtime hook behaviour. The Codex `formatText` returns before it touches the now-null `totalByModel`.

## Checks run and their limits

- Focused tests, run on both exports:
  - `node --test hooks/multi-codex-hook.test.mjs hooks/delegation-reminder.test.mjs`: 55/55 on 90ee83d, 56/56 on db5ae5c.
  - `work-record.test.mjs`, filtered to census, leadLastMessageAt and INCOMPLETE: 31/31 on both.
  - `build-census.test.mjs`, filtered to Codex, unreadable, MISSING, leadLastMessageAt and healthy: 18/18 on both.
- Scratch probes:
  - `probe1` drives `runCodexHook`: injected vs ambient home, the switches, prompt, resume, `exec` source, no transcript, and `PostToolUse`/`Stop`/`Interrupt`.
  - Real `delegation-reminder.js` processes for startup, compact and child.
  - `build-census` CLI Markdown and JSON output for the Codex fixture.
  - `probe2` runs the work-record recognition functions on that output.
  - One scratch mutation (L1), restored afterwards.
- Limits:
  - I did not run the full sealed suite; it is running separately.
  - I made no installation and no live or native Codex observation, and read no private transcripts. Startup and app-server timing and real `source` metadata are therefore unverified here, as the contract itself states.
  - The work-record refusal of the UNSUPPORTED report was checked through `isCensusFile` plus reading `loadCensus`. I did not run a full `acceptRecord` call against it.
