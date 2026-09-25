VERDICT: NEEDS_FIXES (2) fadc07320984e76a2c5b93fb2f297656b6040fed

# P3 (docs) delta re-review: Codex goal and bearings parity

Candidate: fadc07320984e76a2c5b93fb2f297656b6040fed, one commit ("docs: clarify current Codex install route") on top of 0eebff1. Checkout: C:/Users/benzh/orca/workspaces/claude-delegation/astra-codex-p3, read-only. HEAD is fadc073 and `git status --short` is empty.
Delta: README.md, docs/native-use.md and skills/bearings/SKILL.md. `git diff --check 0eebff1 fadc073` is clean.

## The three findings open at 0eebff1, one by one

### F2 MAJOR (current route in order, native package as the alternative): FIXED, with one leftover moved to R1
- docs/native-use.md:23-58 now has "### Current fresh-project route" first. Its steps, in order:
  1. Claude marketplace add and install (:29-34).
  2. Mirror dry-run, then the real run (:36-41).
  3. `--codex-hooks-only`, dry-run then the real run, only with authorization (:43-48).
  4. Fresh sessions, followed by checks, with the warning that listings do not prove delivery (:50-54).

  At :56-58 the native package is labeled as the alternative, not to be combined with the mirror without a check that no hooks are duplicated. This satisfies the a141cee contract line "Document the current Claude plus Codex mirrored route first, native Codex package as an alternative". The commands match the real flags (scripts/mirror-shared-skills.mjs:116-137) and README.md:21-22.
- The "SessionStart wiring check" in step 4 (:52) exists: hooks/hooks.json:18 runs `scripts/wiring-check.mjs --line`. Note that docs/GOALS.md:92 records "Wiring check cannot go red", so a clean result from it is weak evidence. Step 4 already requires checking real hook execution, so I have not counted this.
- The part of F2 still missing, re-applying hooks after a plugin update, is carried forward as R1.

### N1 MINOR (classification happens per event, not from "SessionStart metadata"): OPEN
- Fixed in native-use.md:86-89 and SKILL.md:57-61. Both now say "native metadata on an event" and "SessionStart does not store/persist a classification for later events". That matches `classifyCodexRole`, which reads the transcript's `session_meta` on each call (hooks/continuation-native.mjs:43-73), and P1 at 5225d21, which calls it on every event (hooks/multi-codex-hook.mjs:115). The phrase "each event needs its own usable native metadata" covers the contract's condition that startup delivery depends on that metadata being available.
- Still open at README.md:248. The changelog still says "when native SessionStart metadata is available and". I listed this spot in the previous report and it was not changed.
- New in this delta, README.md:62-63: "When native / native metadata on an event". The word "native" appears twice across the line break. Also, README.md:66 is 106 columns, while the lines around it wrap at about 90.
- Patch, README.md:62-66. Current:
  ```
    included. The separate decisions skill owns registered `Done` pickup. When native
    native metadata on an event positively classifies a Codex session as a lead, it
    receives the same card and due/unknown advisory at SessionStart and every eligible
    UserPromptSubmit; SessionStart does not persist a classification for later events.
    Prompts without that classification or a usable card receive no new advisory. Confirmed children receive
  ```
  Replacement:
  ```
    included. The separate decisions skill owns registered `Done` pickup. When native
    metadata on an event positively classifies a Codex session as a lead, it
    receives the same card and due/unknown advisory at SessionStart and every eligible
    UserPromptSubmit; SessionStart does not persist a classification for later events.
    Prompts without that classification or a usable card receive no new advisory.
    Confirmed children receive
  ```
- Patch, README.md:248-249. Current:
  ```
  - 0.20.9 — Codex lead source parity: when native SessionStart metadata is available and
    positively classifies a lead, it receives the shared goal card and due/unknown
  ```
  Replacement:
  ```
  - 0.20.9 — Codex lead source parity: when native metadata on an event positively
    classifies a lead, it receives the shared goal card and due/unknown
  ```
  Predicted result: all four places say the same thing, and `grep -n "SessionStart metadata\|native native"` over the three files returns nothing.

### N2 NIT (the byte figure is a ceiling): FIXED
- README.md:251, docs/native-use.md:90 and skills/bearings/SKILL.md:61 now say "up to 1,200 bytes", which matches `RENDER_MAX_BYTES = 1200` (scripts/goal-card.mjs:53). A search for "roughly" in the three files finds nothing.

## Open finding carried from F2

### R1 MINOR: the route never says to re-apply the mirrored hooks after a plugin update
- Evidence: the mirrored hook runs the adapter at the path it was wired from (scripts/mirror-shared-skills.mjs:69-75). Trust covers the command string, not the file contents (scripts/codex-hook-trust.mjs:509-514). On this Windows host, ~/.codex/hooks.json points into `~/.claude/plugins/cache/benzhuk/delegation/0.20.7/`, a versioned directory. Older version directories, 0.1.1 through 0.20.7, are still present, so a stale path keeps working silently.
- Consequence: when a plugin update ships P1, Codex keeps running the old adapter until someone re-runs `--codex-hooks-only`. The new advisory is then silently missing, and nothing in the route tells the operator why.
- Fix: in docs/native-use.md, at the end of step 3 (after :48), add: "After every plugin update, rerun this step from the updated durable checkout, because the Codex hook runs the adapter at the path it was wired from." No other text needs to change.

## Regressions in the delta
- One new defect: "native native" at README.md:62-63, recorded under N1.
- Everything else checks out:
  - The delta adds no installed or live claim.
  - The "source capability, not installed" disclaimers are still there.
  - The switch spelling `ws-off-goalcard` is unchanged.
  - The only edit to the 0.20.9 changelog entry is the byte-figure wording. Older entries are untouched.
  - The duplicate-hooks warning is kept and now repeated at :56-58.

## Status of F1
Deferred to the integrated seam review, as the a141cee contract ("P3 and integration") requires. That deferral is still sound, on the conditions in the earlier report:
- accept only together with the reviewed P1 SHA;
- the seam review checks every behavior sentence against that SHA;
- the record names that SHA.

## What I did not check
I ran no hooks, tests, installs or native runtime. P1 was grepped read-only only.
