VERDICT: NEEDS_FIXES (3) 0eebff1a0b6c8ea129d538dbf49f382d47ef3c3b

# P3 (docs) delta re-review: Codex goal and bearings parity

Candidate: 0eebff1a0b6c8ea129d538dbf49f382d47ef3c3b, delta from a7dcd52 (one commit, "docs: clarify Codex advisory boundaries"). Checkout: C:/Users/benzh/orca/workspaces/claude-delegation/astra-codex-p3, read-only; HEAD is 0eebff1 and `git status --short` is empty.
Delta: README.md (+20/-2), docs/native-use.md (+18/-1), skills/bearings/SKILL.md (+18/-1). `git diff --check a7dcd52 0eebff1` is clean.
Contract read at a141cee: docs/specs/codex-parity-1/contracts.md, including the red-team adjudication and the new "P3 and integration" paragraph.

## Status of the earlier findings

| Finding | Status | Evidence |
|---|---|---|
| F1: claims ahead of P1 | Deferral is sound, with conditions (below) | The a141cee contract, "P3 and integration", says: "P3 may build independently against this contract, but integration must check its claims against the final reviewed P1 SHA before acceptance." |
| F2: current route not given in order | **OPEN, still MAJOR** | docs/native-use.md:21-51 is unchanged. It still starts with the native `codex plugin` block, and Claude still has only the update commands. The a141cee contract now requires this: "Document the current Claude plus Codex mirrored route first, native Codex package as an alternative". |
| F3: route narrowing and activation path | Half fixed | The claim that the feature applies only to the "configured mirrored-hook route" is gone. The note on how a mirrored host picks up new code is still missing, so it moves into F2. |
| F4: switch semantics | Fixed | native-use.md:58-60 now gives each switch's scope: master = all new context, goalcard = card plus advisory, bearings = bearings only. This matches the contract's coupling and hooks/delegation-reminder.js:369-372. README.md:254-255 matches too. What is left is optional wording: "all fail safely" (:60) and no mention of `$AGENTS_HOME`. This is not counted as a finding. |
| F5: rejection notice and usable card | Fixed | native-use.md:54-55, SKILL.md:61-62 and README.md:65-66 now say that a missing card is silent, that a rejected card shows its notice at an eligible SessionStart, and that prompts without a usable card get no advisory. This matches a141cee ("Absent cards are silent; rejected cards can show the existing rejection only at eligible SessionStart"). Spot check against the P1 candidate: hooks/multi-codex-hook.mjs:72 at 5225d21. |
| F6: schedule difference | Fixed | The per-prompt cost is now stated as a deliberate tradeoff with no fired/tally state (native-use.md:52-54, SKILL.md:60-61, README.md:249-251). SKILL.md:67 says "Claude retains its own existing cadence". README.md:59-66 puts Claude's SessionStart/periodic route next to Codex's every-prompt route. |
| F7: changelog formatting | Fixed | The lines are now wrapped. a141cee settles the 0.20.9 slot and says manifests stay unchanged. |

## Is deferring F1 sound?

Yes, for this reason: the contract at a141cee makes the check against the reviewed P1 SHA an explicit integration gate. P3 is not the place to prove runtime behavior. Three conditions go with it:
1. P3 must not be accepted or merged except together with the reviewed P1 SHA. A candidate for P1 now exists: astra-codex-p1 at 5225d2181d907ed0d39960c445599c59683a9a45, not yet reviewed.
2. The seam review must check each behavior sentence in these places against that P1 SHA and its tests: native-use.md:49-66, SKILL.md:56-73, README.md:62-70 and README.md:248-258. The work record must name the P1 SHA the docs were checked against.
3. If the P1 review changes any behavior, P3 must be edited before acceptance. The behaviors to watch are: rejection only at SessionStart, per-prompt delivery, the switch coupling, and how the lead is classified.

A spot check I ran read-only on 5225d21 already turns up one mismatch, recorded as N1.

## Open findings

### F2 MAJOR (still open, now required by contract): give the current route in order
- Evidence: docs/native-use.md:21-31 opens "Choose the route" with `codex plugin marketplace add .`. The rollout did not use that route: the four-host evidence says "No duplicate native Codex plugin". Claude has only update commands (:59-65). The contract at a141cee says to document "the current Claude plus Codex mirrored route first, native Codex package as an alternative". The activation point carried over from F3 still applies:
  - the mirrored hook runs the adapter at the path it was wired from (scripts/mirror-shared-skills.mjs:69-75);
  - trust covers the command, not the file contents (scripts/codex-hook-trust.mjs:509-514);
  - on this Windows host, ~/.codex/hooks.json points at `~/.claude/plugins/cache/benzhuk/delegation/0.20.7/hooks/multi-codex-hook.mjs`.
- Fix: directly under "## Choose the route", insert a subsection titled "Current route (Claude plugin plus Codex mirror, as in the 0.20.6 rollout)" with these steps:
  1. Install or update Claude: `claude plugin marketplace add benzhuk/claude-delegation` and `claude plugin install delegation@benzhuk`, or the update commands.
  2. From the durable checkout you chose, run `node scripts/mirror-shared-skills.mjs --dry-run --json` and then the same command without `--dry-run`.
  3. With authorization, run `--codex-hooks-only --dry-run --json` and then `--codex-hooks-only`. After every plugin update, rerun this step from the new checkout, because the hook runs the adapter at the path it was wired from.
  4. Start fresh sessions.
  5. Check the registered events and the actual execution on that host.

  Then add "Alternative: native Codex package" above the existing `codex plugin` block, and keep :51. The existing commands and flags need no change: I checked them against the parser earlier.

### N1 MINOR (introduced in the delta): the lead is not classified from "SessionStart metadata"
- Evidence: the delta says "When SessionStart native metadata is available and positively classifies a Codex session as a lead" in native-use.md:49-50, SKILL.md:57-58, README.md:62-63 and README.md:248-249. Read literally, a classification made at SessionStart would gate later prompts, which would need stored state. The contract forbids that state. The code classifies on every event instead. `classifyCodexRole` reads the first line of the transcript, the `session_meta` row, from `input.transcript_path` (hooks/continuation-native.mjs:43-73). P1 calls it per event (hooks/multi-codex-hook.mjs:115 at 5225d21). What a141cee flags as unverified is startup SessionStart specifically: "actual startup delivery depends on metadata being available".
- Fix: apply the same replacement at all four places. Replace "When SessionStart native metadata is available and positively classifies a Codex session as a lead" with "When the event's native session metadata (the transcript's `session_meta` record) is available and positively classifies a Codex session as a lead". Then add this sentence once in native-use.md and once in SKILL.md: "At a startup SessionStart that record may not exist yet, so startup delivery is unverified." README.md:248 reads "when native SessionStart metadata is available and positively classifies a lead", so change it to "when the event's native session metadata is available and positively classifies a lead". Predicted result: the docs match per-event classification and the startup caveat in the contract.

### N2 NIT (introduced in the delta): "roughly 1,200 bytes" should say "up to"
- Evidence: 1,200 bytes is a ceiling: `RENDER_MAX_BYTES = 1200` at scripts/goal-card.mjs:53, and the contract says "up to the renderer's 1200-byte card". The delta says "roughly" in native-use.md:52, SKILL.md:60 and README.md:250.
- Patch: in each of the three places, replace "roughly 1,200 bytes" with "up to 1,200 bytes".

## Delta regressions checked and found correct
- The claim that receipts are per checkout is correct: the receipt path is keyed by `sha256(projectRoot)` (skills/bearings/scripts/bearings-state.mjs:59).
- The claim that the notice names `/delegation:bearings` is correct (hooks/delegation-reminder.js:344-347). The caveat that the slash form's behavior on each host needs its own check is appropriate.
- "No authority for an out-of-scope assessment" matches a141cee.
- No live or installed claim was added. "Source capability, not an installed or live-executed route" is kept (native-use.md:65-66, README.md:256-257).
- Switch spelling is still `ws-off-goalcard` everywhere. Changelog history is intact: the delta touches only the 0.20.9 entry. The warning against duplicate hooks (native-use.md:68) is unchanged.

## What I did not check
I ran no hooks, tests or installs. The P1 check was a read-only grep of 5225d21, not a review of it. Running P1 is the seam review's job.
