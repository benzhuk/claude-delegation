PASS

# T6 Ladder — builder report

Worktree: `C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31\scratchpad\next-build\wt-T6`
Branch: `feat/next-build-T6`, base `95d54535e1d6deb3ed242a95a23beb8b43c11d7c`
Commit: `50cb7ad`

## Addendum applied

**A2 (spec-addendum-r3.md) was applied**: `args` may be undefined. The script's first
statement after `meta` is `const a = args ?? {}`; rungs read `a.readerType ??
'delegation:runner'` and derive `maxAgents` from `a.maxAgents` (default 12). The harness
test runs the script once with `args` undefined and once with `{ maxAgents: 2 }`, per the
addendum's exact prescription. The banned-call check greps `Date\.now\(`, `Math\.random\(`,
and argless `new Date()` only (`new Date(<arg>)` is not flagged, and none appears in the
script anyway).

## Files changed (3, all in territory)

- `skills/delegate/SKILL.md` — new section "Ladder, Opus orchestrator panes only" appended
  at the end of the file (after "Synthesis"): when to use it (Opus orchestrator panes
  only, never the lead pane, never a builder pane), the script path and `args` shape,
  the cap (`args.maxAgents`, default 12, counted across all `agent()` calls), the
  reader-type fallback (`readerType: 'general-purpose'` when `delegation:runner` isn't
  registered), the headless-child fallback command verbatim from the brief
  (`claude -p --model claude-haiku-4-5-20251001 --output-format text --max-turns 1
  --allowedTools ""`), "ultracode is not used anywhere", and the exact phrase "approved,
  not live, until one run from an Opus pane".
- `skills/delegate/references/ladder-workflow.js` (new) — the C6 template: pure-literal
  `meta` (name/description/`phases: [Read, Research, Judge]`); fast tier
  (`agentType: readerType, model: 'haiku', effort: 'low'`) → mid tier (`model: 'sonnet'`)
  → judge (`model: 'opus'`, exactly one `agent()` call, JSON-schema output); returns
  `{ verdict, evidence: [...], cost: { agents } }`.
- `skills/delegate/references/ladder-workflow.test.mjs` (new) — the C6 harness (RT-17):
  strips the leading `export ` from `const meta = ...`, wraps the transformed source body
  in an `AsyncFunction('agent','parallel','pipeline','phase','log','args','budget', body)`,
  injects a counting `agent` stub plus minimal `parallel`/`pipeline` mocks. 11 tests.

## Gate

`node --test skills/delegate/references/ladder-workflow.test.mjs`

```
✔ meta is assigned a pure object literal (no calls, spreads, or interpolation)
✔ Date.now, Math.random and argless new Date() are absent from the source
✔ runs with args undefined (every field defaults)
✔ runs with args = { maxAgents: 2 } and no targets
✔ fast tier defaults to delegation:runner, haiku, low effort; mid tier is sonnet; judge is opus, one agent
✔ honours an explicit readerType (the general-purpose fallback callers use when delegation:runner is not registered)
✔ does not throw when the total agent() calls land exactly on maxAgents
✔ throws at maxAgents + 1 when a later rung tips the cumulative count over
✔ throws at maxAgents + 1 when the very first rung alone exceeds the cap
✔ default cap is 12
✔ returns exactly { verdict, evidence, cost: { agents } } and nothing else
tests 11
pass 11
fail 0
```

Full log: `C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31\scratchpad\next-build\reports\T6-gate.log`
(11 pass, 0 fail — matches the gate command in the brief exactly.)

## Design decisions / deviations

1. **Cap enforcement point.** The Workflow API (loaded via the `workflow-authoring`
   skill this session) documents that both `parallel()` and `pipeline()` resolve a
   thrown per-item/per-thunk error to `null` for that one item rather than rejecting the
   whole call. If the cap check lived inside a stage callback (wrapping the injected
   `agent` parameter), an over-cap rung could silently degrade to a `null` result instead
   of hard-stopping the script — weakening "throwing past the cap" into "quietly eating
   one item." I instead reserve the rung's full call count against the cap with a plain
   function (`reserve(n)`) called BEFORE `parallel()`/`pipeline()` is invoked for that
   rung, so the throw always happens at the top level of the script body, before any of
   that rung's `agent()` calls are dispatched. The test's counting stub confirms zero
   agent() invocations happen once a rung is over cap (`stub.calls.length === 0` /
   `=== 4` in the two cap tests), proving no wasted or over-cap calls slip through.
2. **`args` field names.** C6 pins `args.readerType` and `args.maxAgents` by name; it does
   not pin what the fast tier reads or what question the judge decides. I chose
   `args.targets: string[]` and `args.question: string` as the remaining fields — both
   optional, both defaulted — as the most direct fit for "fast tier reads (targets) ->
   research -> judge (question)". Flagging this as a design choice, not a re-derivation of
   a hidden contract.
3. Left `skills/delegate/references/` as a new directory (did not exist at base commit) —
   no territory conflict; no other territory touches `skills/delegate/`.

## Needs (nothing outside territory required)

None. All three files are inside T6's territory; no shared/read-only file was touched.

## Verification notes

- `git config --get user.email` was run alone on its own line (per the brief's known
  false-positive note) and returned the configured identity; no identity was set or
  switched.
- No dev server started, no build run, no destructive git operation used.
- Commit is conventional (`feat: ...`), no Co-Authored-By, on `feat/next-build-T6`; not
  pushed.

## Round 2

Review: `C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31\scratchpad\next-build\reports\T6-review.md`
— NEEDS_FIXES (2), both MINOR, both applied verbatim. Commit: `7b2cfd2`.

1. **`ladder-workflow.js:27`** — a non-number `maxAgents` (e.g. the JSON-ish string `'2'`)
   silently widened the cap to 12 instead of honouring it, and `NaN` disabled the cap
   outright. Applied verbatim:
   - old: `const maxAgents = typeof a.maxAgents === 'number' ? a.maxAgents : 12`
   - new: `const capArg = Number(a.maxAgents)` /
     `const maxAgents = a.maxAgents != null && Number.isFinite(capArg) ? capArg : 12`
2. **`SKILL.md`** — the ultracode line was scoped to "in this template", weakening the
   spec's flat "ultracode is not used anywhere". Applied verbatim:
   - old: "Ultracode is not used anywhere in this template — it is a fixed, deterministic
     ladder, not an open-ended exhaustive workflow."
   - new: "Ultracode is not used anywhere — not here and not in any other delegation
     path; this is a fixed, deterministic ladder, not an open-ended exhaustive workflow."

Tests added (2, both requested):
- `"a numeric-string maxAgents (e.g. from JSON-ish args) still honours the cap, not widen
  it to 12"` — `{ targets: 5 items, maxAgents: '2' }` rejects with `/maxAgents cap of 2
  exceeded/`, and the stub records zero `agent()` calls (the review's named failure mode,
  reproduced and now pinned against regression).
- `"a per-item throw under runtime-faithful parallel()/pipeline() drops that item to
  null, without crashing or re-counting it downstream"` — new `parallelNullOnThrowStub`
  / `pipelineNullOnThrowStub` pair (catch a thunk/stage error and resolve `null` for that
  item, instead of the earlier `Promise.all`-based stubs which reject on any thunk
  error and — per the review's Notes — never exercised the null-drop path). One target's
  read is made to throw; asserts all 3 reads are attempted, only the 2 survivors reach
  Research, the dropped item is never paraphrased into a research call
  (`research:b` absent), the judge still runs exactly once, and `cost.agents === 6`
  (the actual count made, matching the reviewer's own manual measurement in the Verified
  Good section — not an inflated reservation).

Gate re-run: `node --test skills/delegate/references/ladder-workflow.test.mjs` →
**13 pass, 0 fail** (11 prior + 2 new). Log (overwritten):
`C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31\scratchpad\next-build\reports\T6-gate.log`.

Notes from the review not requiring a fix (acknowledged, not actioned, per the
reviewer's own "no fix demanded"):
- `/\w\s*\(/` in the meta-purity test is a blunt instrument that would false-flag a
  parenthesis inside a meta string value; left as-is (still correct today, flagged for
  whoever next edits `meta`'s prose).
- A rejecting judge `agent()` call takes the whole run down (the `?? 'inconclusive'`
  fallback only covers a `null` return, not a thrown error) — this matches every other
  rung's behavior (an unhandled rejection anywhere in the ladder halts the script) and
  is not treated as a defect.
- SKILL.md's `{scriptPath: "..."}` invocation shape and repo-relative path are not pinned
  by the spec and are harmless while the template is "approved, not live."

`git config --get user.email` re-verified alone on its own line before committing
(`benzhuk@gmail.com`, unchanged, no identity switch). No dev server, no build, no
destructive git operation.
