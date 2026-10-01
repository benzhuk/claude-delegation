VERDICT: NEEDS_FIXES

**Reviewed HEAD:** `c05a497113b5e0b899c91f931c93eddf6035de91` (from `git rev-parse HEAD` on `build/codex-fresh-1`). There is no commit `1a63cd` at HEAD; the X1 reports landed in `c05a497`. Base is `fbd7cf6`. `git diff fbd7cf6 HEAD` shows no changes under `hooks/`, `scripts/`, `skills/` or `.codex-plugin/`, so this is a docs-only diff. The work record is `owned` and nothing has been accepted yet.

**Is the original lane acceptance met?** No. None of these are done: a native Codex lead proof for steps 1–4, a sealed suite run, `check-acceptance`/`accept`, and a RESULT to skills-fable. The walk's own PARTIAL label is honest, and it makes no claim of full installed success. It can be accepted as a bounded PARTIAL result after the four blocking fixes below.

## Blocking

**B1 — MAJOR: the probes likely wrote to the real lead's continuation state, but the walk says they were isolated.** `walk.md:13` / `docs/work/evidence/2026-09-25-codex-fresh-project.md:13`
- For the goal-card probes to classify as `lead` (`continuation-native.mjs:71-73`), they had to send the real lead's `session_id` (`01a0daaa-…`) together with its real transcript.
- `runCodexHook` always passes that session id into `handleContinuationEvent`. On SessionStart, and on UserPromptSubmit without a `turn_id`, that handler suspends and rewrites any existing state (`scripts/continuation.mjs:209-217`).
- The walk records `AGENTS_HOME` isolation only for the kill-switch probe (`walk.md:62`).
- Read-only check: `~/.agents/ws/continuation/<sha256("codex\0"+01a0daaa-…)>.json` was last written at **18:28:22 NYC**, inside the 18:26–18:29 probe window. It now reads `phase=suspended`, `generation=5`. I can't prove the probe did that write, but the method allows it and the evidence doesn't rule it out.
- There is a second risk I could not verify. If `NOTE_SLUG` was not set for the goal-card probes, `codexSlug` falls back to `ORCA_TERMINAL_HANDLE` → `panes.json` (`multi-codex-hook.mjs:97-102`). A probe run as the hook's main script would then read and acknowledge that pane's real inbox.
- **Fix:**
  - Replace "no parent pane was targeted" with an exact list of the env used for each probe.
  - Have the lead check and, if needed, re-bind its ongoing scope.
  - Rerun the lead-classified probes with a copied transcript whose `session_meta.payload.id` is a new UUID, plus a temp `AGENTS_HOME` and a scratch `NOTE_SLUG` on every probe.

**B2 — MAJOR: the missing hook line from `codex exec` is blamed on `source: exec`, but it shows nothing about whether hooks run on this host.** `walk.md:28-32`, `state.md:5`
- When the role is `unknown`, the hook still does inbox registration and peer delivery (`multi-codex-hook.mjs:126-168`). It prints nothing only because there was nothing to deliver: the exec ran at 18:26 and the probe note was queued at 18:29.
- `docs/native-use.md:114` records that Codex's outer hook shell fails with OS error 5 on this host before any handler starts. That is the real runtime install risk: every Codex lead on this machine may get no goal card, no notes and no continuation. The walk leaves it untested.
- `walk.md:30` also mixes up two boundaries. Its error came from the Orca child's unified-exec shell failing to launch `codex`. Line 114 is about Codex's own hook shell. They are different processes.
- **Fix:** run a native check that needs no interactive lead: first queue a scratch note to `x1-scratch-codex`, then run `codex exec` with `NOTE_SLUG=x1-scratch-codex`. Then inspect the exec transcript (or stderr) for the injected peer context or a hook-failure record. Until that runs, report "hook execution on this host: unknown" and rewrite the attribution in `walk.md:30`.

**B3 — MINOR, but it blocks the only X2 deliverable: the doc corrections aren't usable as exact text.** `walk.md:118-119`
- Correction 1 contains `source: \"exec\"`. Folded in literally, it would publish the backslashes. Use `` `source: "exec"` ``. Also note that the old sentence wraps across `native-use.md:54-56`, which has 3-space list indentation.
- Correction 2 builds on the conflation in B2. Rewrite it to state what is actually known: whether hook handlers start on this Windows host is unverified for any session.

**B4 — MAJOR: "no code change needed" is concluded before the native check it depends on.** `x2-findings.md:1` says `VERDICT: PASS`
- The walk only shows that the adapter logic matches the docs. Whether the installed hooks run on this host is unproven.
- `native-use.md:114` points to an SDK shell fallback that the hook configuration path omits. Whether a fix belongs in `hooks/codex-hooks.json` or the mirror's `commandWindows` wiring (X2 territory) or outside the plugin can't be decided until B2's check runs.
- **Fix:** change the verdict to "no adapter-logic gap found; installed hook execution unproven; X2 code decision pending the B2 check."

## Nonblocking

- **N1 — MINOR: a third spec contradiction isn't flagged.** `spec.md:19` names `ws-off-goal-card`, but the code and docs use `ws-off-goalcard` (`scripts/goal-card.mjs:27`, `native-use.md:99`). The walk silently used the correct name. Add it as finding X1-3.
- **N2 — MINOR: the `hooks.state` count of 18 (`walk.md:26`) is unexplained against 5 handlers.** `native-use.md:108` warns that duplicate registrations can happen. List which handlers and paths the 18 entries trust.
- **N3 — INFO: the census numbers are a mid-lane snapshot.** The UNSUPPORTED verdict is honest and matches `build-census.mjs:311-368`. But the 24 requests and 1,656,186 tokens (`walk.md:114`) stop at `leadLastMessageAt 22:27:41Z` (18:27 NYC). Label them as a snapshot and rerun the census at accept to get the exact `--no-census` reason. The lead transcript's `cwd` is the `gudgeon` worktree; the lead should confirm this is its own session.
- **N4 — INFO: scratch state is left behind.** A queued ASK to `x1-scratch-codex` (needs ack by 18:40), a `x1-scratch-codex` inbox registration pointing at the exec thread `01a0daad-…`, and three temp repos. Clean them up with the janitor.

**Confirmed correct:**
- X1-2: a missing card is silent and a rejected card gets a SessionStart-only notice (`multi-codex-hook.mjs:79-82`, `native-use.md:94-95`).
- `source: exec` → `unknown` (`continuation-native.mjs:71-73`).
- The bearings notice shaping, and that the kill-switch probe honored `AGENTS_HOME` (`goal-card.mjs:106-109`, `137-142`).
- The record's `Opened`/timing caveats are disclosed rather than invented.