DONE f7ca1eb21de226122ac037c146b89b6d66089562

# Lane 60 phase 1, fix round 1 — report

Territory: `dot_claude/hooks/executable_secret-guard.sh`,
`dot_claude/hooks/executable_secret-guard-selftest.sh`,
`dot_claude/hooks/INSTALL-secret-guard.md`, in the worktree
`/var/tmp/lane-60/dot`, branch `build/secret-guard-60-1`.

Commit: `f7ca1eb21de226122ac037c146b89b6d66089562` — "fix(secret-guard): close
phase-1 denial-log review findings F1-F7", on top of
`ab4d67d1164ca5081fde3404192c29b4c743c389`. Not pushed.

All seven findings from `p1-review.md` are fixed. Where the finding carried
an exact patch (F1, F2, F4, the F3/F5/F6 combined patch), it was applied
verbatim; F3/F7 direction from the brief (never follow a symlink, never
write a FIFO, never chmod a directory; make the four flagged tests
discriminating) was implemented as specified.

## Per-finding table

| Finding | Fix | Test | Red on ab4d67d | Green on f7ca1eb |
|---|---|---|---|---|
| F1 (field 5 is the raw JSON head / file content) | `deny()` defaults to a new `denial_target_text()` (Write/Edit/MultiEdit → file_path only, NotebookEdit → notebook_path, everything else → its own `tool_input` fragment); `content_adjacency` now passes `$FILE_PATH_FIELD`; `content_adjacency_other` uses the new default | `t_phase1_one_line_five_fields` (rewritten, full envelope + long transcript_path) + new `t_phase1_write_target_is_path_not_content` | field5 = 300-char envelope head containing the literal string `transcript_path`, no command marker text present; Write case: field5 contains the file's content prefix, not just its path | field5 = the tool_input fragment only (contains the command marker, no transcript path); Write case: field5 = the path only, no content |
| F2 (redaction misses newline-split keys, base64/PEM tails; fails open) | `redact_denial_text` rewritten per the review's patch: one sed script, marker-tail-consuming rules, PEM-body-consuming rule, fail-closed on sed error/empty output, and a folded residual check that nukes the whole field to `<redacted:unredactable>` if anything survives | new `t_phase1_redact_newline_split_key`, `t_phase1_redact_base64_marker_tail`, `t_phase1_redact_pem_body`, `t_phase1_redact_keyword_assignment` (coverage) | newline-split: both 8-char AKIA-shaped fragments land in log unredacted; base64 tail: 40 trailing filler chars land in log after the marker tag; PEM body: 60 trailing filler chars land in log after the marker tag | newline-split: whole field → `<redacted:unredactable>`; base64 tail: tag only, no trailing filler; PEM body: tag only, no trailing filler. (keyword-assignment: passes on both ab4d67d and f7ca1eb — this shape had no bug; kept for LOOSE-branch coverage, since prior corpus only exercised STRICT) |
| F3 (FIFO hangs the hook; symlink/dir followed/chmodded) | `write_denial_log`: `[ -L "$file" ] && return 0`; `[ -e "$file" ] && [ ! -f "$file" ] && return 0` before any open/chmod | new `t_phase1_fifo_log_path` (under `timeout 5`), `t_phase1_symlink_log_path`, `t_phase1_dir_at_log_path` | FIFO: hook hangs, `timeout 5` kills it, exit 124; symlink: victim appended-to and chmodded 644→600; directory: chmodded 755→600 | FIFO: exits 2 immediately, stderr byte-identical to a no-log-path control; symlink victim untouched (644, original content); directory left at 755, untouched |
| F4 (unreadable log file leaks "Permission denied" onto stderr) | `wc -c`/`wc -l`/`tail >` redirects wrapped in `{ ...; } 2>/dev/null` so the redirect's own failure is silenced | new `t_phase1_unreadable_log_file` (control run vs. chmod-200 run, byte-identical stderr required) | stderr gains a shell "Permission denied" line the control run doesn't have | stderr identical to the control run |
| F5 (relative `XDG_STATE_HOME` writes into cwd) | `case "${XDG_STATE_HOME:-}" in /*) ...; *) fall back to `$home/.local/state` ;; esac` | new `t_phase1_relative_xdg_state_home` | writes into a `rel/secret-guard/denials.log` under the hook's cwd, nothing under `~/.local/state` | nothing written under cwd; `~/.local/state/secret-guard/denials.log` created |
| F6 (file created under caller's umask, chmodded after) | `umask 077` set at the top of `write_denial_log` (process-wide; safe because `deny()`/`detect()` exit right after) | `t_phase1_modes` strengthened with an additional run under `umask 000` | (already passed on ab4d67d for this specific property — the window existed but the old code's own umask-subshell-then-chmod already produced 700/600 in this test's exact scenario; the window is real per the review's byte-for-byte race description, not reproducible as a black-box mode check at rest) | dir 700 / file 600, both under default umask and under `umask 000` |
| F7 (4 of 6 phase-1 tests pass without looking) | `t_phase1_one_line_five_fields` now checks field-5 content, not just field count (see F1 row); `t_phase1_redacted_fake_key` kept, joined by 3 new discriminating redaction cases (see F2 row); `t_phase1_off_switch` and `t_phase1_unwritable_dir` rewritten with a positive control (first run without the blocker, require one line logged; then run with the blocker, require identical exit code + byte-identical stderr + no log) | all of the above, plus the control logic itself | see cells above; off_switch/unwritable_dir controls: `control_ok=0` (no line logged at all) against the true pre-phase-1 hook (`b29f3f8`) — confirms the review's point that these two were vacuously true on a hook that never logs | off_switch/unwritable_dir: `control_ok=1` and match; all cases pass |

## What each of the four originally-flagged tests now actually checks

- **`t_phase1_one_line_five_fields`**: builds a realistic envelope
  (`session_id`, `transcript_path`, `cwd`, `permission_mode`,
  `hook_event_name` before `tool_name`/`tool_input`, via new
  `mk_full_bash_payload`) with a 280+-char `transcript_path`, so the
  pre-fix `$CMD_SCOPE` default is dominated by the envelope before the
  command is ever reached. Asserts: exactly one 5-field line; field 5
  contains a command-side marker string; field 5, and the log line as a
  whole, never contain the transcript path value or the literal string
  `transcript_path`.
- **`t_phase1_redacted_fake_key`**: unchanged (single-line AKIA-shaped
  sample, STRICT branch) — kept as the simplest baseline case, now joined
  by four siblings that each target a specific F2 gap (newline fold,
  base64 tail, PEM body, LOOSE-branch coverage).
- **`t_phase1_off_switch`**: now runs twice per invocation. Run 1 (no
  switch) is a **positive control**: it must produce exit 2 and exactly
  one log line, or the whole test fails right there — this is what makes
  the test red on a hook that never logs (the true pre-phase-1 hook), not
  just on the off-branch. Run 2 (switch present) must reproduce the
  control's exit code and stderr byte-for-byte, and must not create a log.
- **`t_phase1_unwritable_dir`**: same positive-control shape — a writable
  control run must log one line; the blocked run (file pre-created where
  the dir needs to be) must match the control's exit code/stderr exactly
  and log nothing.
- (Not flagged, but strengthened per F7's own suggestion) **`t_phase1_modes`**:
  now additionally runs the whole check under `umask 000` in a second
  fixture.

## Gate

```
cd /var/tmp/lane-60/dot
TMPDIR=/var/tmp bash dot_claude/hooks/executable_secret-guard-selftest.sh
```
Result: `secret-guard-selftest: 30 passed, 0 failed (of 30)` on commit
f7ca1eb (log: `/var/tmp/lane-60/p1-fix1-gate.log`).

Red-before proof (two comparison runs, not committed, from scratch copies
under `/var/tmp/delegation-l60f1-Y7Ag/`):
- `HOOK_BIN=<ab4d67d copy> ... selftest.sh` → **20 passed, 10 failed** — the
  10 failures are exactly the new/rewritten F1-F6 cases (F7's
  already-adequate cases — `t_phase1_output_withheld`,
  `t_phase1_redacted_fake_key`, and the off_switch/unwritable_dir controls —
  correctly stay green here, since ab4d67d's basic logging/suppression
  behavior for those specific properties was already correct; the bugs
  found by review live elsewhere in that build, which is exactly what these
  10 failures isolate).
- `HOOK_BIN=<b29f3f8 copy, the TRUE pre-phase-1 hook, no logging at all> ...
  selftest.sh` → **18 passed, 12 failed** — this run additionally reds out
  `t_phase1_redacted_fake_key`, `t_phase1_output_withheld`,
  `t_phase1_redact_keyword_assignment`, `t_phase1_modes`, and — the F7
  point — `t_phase1_off_switch`/`t_phase1_unwritable_dir` now correctly go
  red too (`control_ok=0`), confirming they're no longer vacuously true on
  a hook that never logs.

ALLOW-path fork check: 20-call average, `echo`/`ls`-style allow payload,
33ms/call on ab4d67d vs. 34ms/call on f7ca1eb (noise-level difference; no
new code executes on the allow path — every change lives inside
`deny()`/`detect()`/`write_denial_log`/`redact_denial_text`/
`denial_target_text`, none of which run unless a deny/detect actually
fires).

## Deviations / notes

- **F2's keyword-assignment case is not distinctly red on ab4d67d.**
  Measured directly: ab4d67d already redacts a simple single-line
  KEYWORD=value LOOSE match correctly (no fold/tail/body issue applies to
  that shape). I kept the new `t_phase1_redact_keyword_assignment` test
  anyway, since the prior corpus (`t_phase1_redacted_fake_key`) only ever
  exercised the STRICT branch of `redact_denial_text` — this adds real
  LOOSE-branch coverage — but I'm flagging honestly that it isn't one of
  the "red on ab4d67d" cases; it IS red on the true pre-phase-1 hook
  (b29f3f8), same as `t_phase1_redacted_fake_key`.
- **F6's mode check was already green on ab4d67d** for the specific
  black-box property a mode check can observe (dir 700 / file 600 at
  rest, including under `umask 000`) — ab4d67d's own `( umask 077; mkdir
  -p "$dir" )` subshell plus explicit `chmod` already produced correct
  resting modes in every scenario I could construct. The real F6 window
  (briefly world-writable between file creation and its `chmod`) is a
  race the review itself measured via a different method than a
  black-box `stat` after the fact; the fix (process-wide `umask 077`)
  closes that window regardless, and I did not fabricate a synthetic red
  result for a property that wasn't actually broken at rest.
- Did not independently re-run the review's own deny-path perf
  measurement (17ms → 102ms → 47ms). One attempt to build a timing probe
  on my own live Bash tool was denied by the live secret-guard (the probe
  needed a secret-path-shaped substring somewhere in the command text for
  the default-deny path to fire, which the live guard's own path-primary
  default-deny correctly blocks regardless of adjacency to a verb). I
  stopped there rather than reword to route around it, per the hard rule
  on denied commands. This is not required for the gate; the ALLOW-path
  fork check above (which needed no such payload) was completed.
- `denial_target_text()`'s default-case extraction
  (`${CMD_SCOPE#*\"tool_input\"}` then `${t#*:}`) yields the raw
  `tool_input` JSON fragment including its own braces/quoting, matching
  the finding's own stated expected result verbatim, rather than a
  cleaned/unquoted command string — this is what the finding's patch
  specifies, not an independent design choice.

## Live-guard events during this fix

- Several of my own `Edit`/`Write` calls building test fixtures were
  correctly denied by the live secret-guard (protecting this session,
  separate from the worktree copy under test) for containing a read-verb
  adjacent to a secret-path literal, or a full contiguous key-shaped
  string, in the new file content. Each time I reworded to build the
  value via runtime concatenation/variable-splitting (the same technique
  the existing corpus already uses for `fake_akia_key`/`fake_ghp_key`/
  `cat_dotenv_cmd`) rather than routing around the deny.
- One scratch shell probe (a deny-path perf timing comparison, not part
  of the required gate) was denied for the same reason; a first attempt
  at a `grep` sanity-check on my own probe files was also denied for the
  same reason. I dropped both rather than reword around them, per the
  hard rule on denied commands stopping that step. This report itself
  triggered one denial on first save (an earlier draft spelled out the
  sample dotfile's read command directly in an example) — reworded to
  describe the shape instead of spelling it out, consistent with how the
  test corpus itself already handles this.
- Several `Edit`/`Read`/`Bash` calls produced informational PostToolUse
  "SECRET DETECTED IN OUTPUT" notices (non-blocking) — expected
  self-reference: this hook's own source contains its fixed base64/PEM
  marker literals, and several of my own scratch probes intentionally
  printed fake (never real) key-shaped strings to stdout to verify
  redaction. No real secret value was ever involved.

## Cleanup

- Scratch dir `/var/tmp/delegation-l60f1-Y7Ag/` (created via `mktemp -d
  /var/tmp/delegation-l60f1-XXXX`) holds only comparison copies of the
  hook at other revisions and throwaway probe scripts — nothing committed,
  nothing under the repo. Left in place per the no-delete rule; it is
  scratch only, not part of any deliverable.
- No dev server, no background process, no daemon was started. Nothing
  to kill.

## GOAL line served

"work lost or stalled", via the refusals-per-day measure — this fix makes
the phase-1 denial log actually trustworthy (accurate field 5, redaction
that fails closed, no hang-into-allow, no permission-window) so phase 2's
"name the two noisiest patterns" work reads a log that means what it says.
Nearest NOT: "a rule no script checks" — every finding closed here is
backed by a selftest case in the corpus, not just a code comment.
