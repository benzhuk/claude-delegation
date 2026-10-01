VERDICT: NEEDS_FIXES ab4d67d1164ca5081fde3404192c29b4c743c389 (7)

# Lane 60 phase 1 (denial log): adversarial review

Reviewed: `git diff b29f3f8..ab4d67d` in /var/tmp/lane-60/dot (3 files under dot_claude/hooks/), against spec section "Phase 1" and p1-build.md. All line numbers below are from `dot_claude/hooks/executable_secret-guard.sh` at ab4d67d unless stated otherwise.

How I checked this. Nothing in the reviewed tree was modified. Scratch copies are in `/var/tmp/p1rev-BlkRFS/`: `old.sh` (b29f3f8), `new.sh` (ab4d67d) and `patched.sh` (new.sh with the patches below applied). There are also per-probe fixture dirs `probe-*`, `fprobe-*`, `rprobe-*` and `pprobe-*`. They were left in place because the brief says to delete nothing. Every probe used fake keys built at runtime (a prefix plus a repeated `Q7` filler). Leak checks printed booleans only, never log contents.

- Selftest: confirmed it uses its own `mktemp -d /var/tmp/secret-guard-selftest-XXXXXX` fixtures and points HOME and XDG_STATE_HOME at them. Ran it with TMPDIR=/var/tmp: **20/20 pass** on ab4d67d. Against the pre-phase-1 hook: **16/20**. The 4 red cases match the builder's report, and no fixture dirs were left behind.
- The patches below, applied together to `patched.sh`: selftest still **20/20**, and every leak and failure probe listed below flips to clean.

## Findings

### F1 HIGH: field 5 is the head of the raw hook JSON, not the command or target, and it carries file contents for Write/Edit
- Evidence: `deny()` line 310 defaults the text to `$CMD_SCOPE`, which is the whole stdin JSON with only the description stripped (lines 380-382). Lines 1240 and 1283 pass `"$RAW"` explicitly, which is the full payload including the Write `content` field.
- Measured with a realistic Claude Code payload (session_id, transcript_path, cwd, permission_mode and hook_event_name come before tool_input): field 5 was 300 chars made up of session_id and transcript_path. **The command did not appear at all.** The log therefore records transcript paths and session ids, and none of the text that phase 2's "name the two noisiest patterns" work needs.
- Measured: a Write, and separately an Edit, whose content held a fake key was denied as `key_literal`. The log then held the file content (`content_in_log True` for both). This breaks the spec line "The log never holds file contents". The content_adjacency sites (1240, 1283) pass `$RAW` and so must leak content the same way. That is certain from the code. My live probe of that path was denied by the live guard (see "Live-guard events"), so for that path the evidence is the code alone.
- It passes the selftest because the test payloads carry only `tool_name` and `tool_input`, and the five-field test never checks what field 5 contains. (See F7.)
- Fix: log the tool_input text for Bash, Grep and Read, and only the path for content-bearing tools. Patch:

In `deny()`:
```
old:   write_denial_log "${2:-$1}" "${3:-$CMD_SCOPE}"
new:   write_denial_log "${2:-$1}" "${3:-$(denial_target_text)}"
```
Line 1240:
```
old: deny "file content embeds a secret-file read" "content_adjacency" "$RAW"
new: deny "file content embeds a secret-file read" "content_adjacency" "$FILE_PATH_FIELD"
```
Line 1283:
```
old: deny "tool input embeds a secret-file read" "content_adjacency_other" "$RAW"
new: deny "tool input embeds a secret-file read" "content_adjacency_other"
```
Add this function after `redact_denial_text`:
```
denial_target_text() { # the log's "command or target" text -- never file contents
  local t
  case "$TOOL_NAME" in
    Write|Edit|MultiEdit) printf '%s' "$RAW" | field_value file_path ;;
    NotebookEdit) printf '%s' "$RAW" | field_value notebook_path ;;
    *)
      t="${CMD_SCOPE#*\"tool_input\"}"
      if [ "$t" = "$CMD_SCOPE" ]; then printf '%s' '<target unavailable>'; return 0; fi
      printf '%s' "${t#*:}"
      ;;
  esac
}
```
Result on patched.sh: field 5 for Bash is `{"command": "echo harmless words plus <redacted:aws_akia_style> and more"}}`. Transcript_path is gone. For Write, field 5 is just `/tmp/x.md`.

### F2 HIGH: redaction misses three shapes the guard itself denies, so key material reaches denials.log
Measured on new.sh (each command exits 2 and writes one line):
- **A key split by a newline** (JSON `\n` inside the key): `literal_key_hit`'s fold pass (lines 507-513) denies it. `redact_denial_text` (lines 396-411) runs a line-based `sed` with no fold, so neither part matches. Both fragments land in the log. Checked for the AKIA shape and the ghp shape: `piece_in_log True`.
- **Base64 marker tail:** the three base64 marker patterns redact only the 8-10 character marker. The rest of the base64 run, which encodes the remainder of the key, is logged verbatim (`tail_in_log True`).
- **PEM body:** only the BEGIN line is redacted. The base64 key body after it is logged (`body_in_log True`).
- **Fail-open:** at lines 401-402 and 407-408, if `sed` errors or prints nothing, `[ -n "$new" ] && text="$new"` keeps the **unredacted** text. A regex portability problem (BSD sed) would silently turn redaction off.
- The truncation order is correct: redact first, then `${text:0:300}`. A boundary probe put a keyword-assignment key across the 300-character mark. The cut fell inside the `<redacted:...>` marker, and no key characters leaked. Every one of the 22 single-line shapes (all 20 STRICT, all 5 LOOSE, the keyword pattern with `/` in the value) is fully redacted. `/` inside a bracket expression is fine in GNU sed and BSD sed.
- Fix: replace the whole `redact_denial_text` function (lines 396-411) with the version below. It uses one sed fork instead of 25, extends the marker patterns to consume the rest of the key, fails closed, and runs a residual folded check that reuses `literal_key_hit`'s fold and `loose_key_hit`'s digit gate:
```
redact_denial_text() {
  local text="$1" i script="" out folded
  for i in "${!KEY_LITERAL_STRICT_NAMES[@]}"; do
    script="${script}s/${KEY_LITERAL_STRICT[$i]}/<redacted:${KEY_LITERAL_STRICT_NAMES[$i]}>/g;"
  done
  for i in "${!KEY_LITERAL_LOOSE_NAMES[@]}"; do
    script="${script}s/${KEY_LITERAL_LOOSE[$i]}/<redacted:${KEY_LITERAL_LOOSE_NAMES[$i]}>/g;"
  done
  # A marker is only the START of the key: consume the rest of the run.
  script="${script}s/<redacted:(b64_sk_ant_marker|b64_sk_proj_marker|b64_begin_marker)>[A-Za-z0-9+\/=]*/<redacted:\1>/g;"
  script="${script}s/<redacted:pem_private_key_style>.*/<redacted:pem_private_key_style>/;"
  out="$(printf '%s' "$text" | sed -E "$script" 2>/dev/null)" || { printf '%s' '<redaction failed>'; return 0; }
  if [ -z "$out" ] && [ -n "$text" ]; then printf '%s' '<redaction failed>'; return 0; fi
  # Residual check on a folded copy, same fold as literal_key_hit's second
  # pass: a key split by a newline/escape survives the line-based sed above.
  folded="$(printf '%s' "$out" | sed -E 's/\\[nrt]//g' 2>/dev/null | tr -d '\n\r\t ')"
  if printf '%s' "$folded" | grep -qE -- "$(join_alt "${KEY_LITERAL_STRICT[@]}")" || loose_key_hit "$folded"; then
    printf '%s' '<redacted:unredactable>'; return 0
  fi
  printf '%s' "$out"
}
```
Result on patched.sh: the newline-split AKIA and ghp keys, the base64 tail and the PEM body all come back `False`. All 10 sampled single-line shapes are still redacted, and ordinary text keeps its `<redacted:NAME>` marker (not withheld wholesale). Deny-path cost drops from 102 ms to 47 ms (F8).

### F3 HIGH: a FIFO at the log path hangs the hook, which turns a deny into an allow. Symlinks and directories at that path are followed or chmodded.
- Evidence, lines 436-457: `[ -f "$file" ]` is false for a FIFO, so rotation is skipped. Then `>> "$file"` (line 456) blocks forever opening a FIFO with no reader. Measured: hook `TIMEOUT` at 8 s, where the old hook exits 2 at once. The installer sets `"timeout": 10` (executable_install-secret-guard.sh:113). Under Claude Code's hook contract a timed-out hook is a non-blocking error, so the tool call proceeds and a refusal becomes an allow. I did not exercise this live. Anything in-session can set it up with one mkfifo, which the guard does not deny. This directly contradicts "never changes the deny decision".
- Symlink at `denials.log`: the target is appended to and **chmodded to 600** (victim went from 644 to 600 with an extra line). A directory at `denials.log` gets chmodded to 600 (line 457).
- Also: a pre-existing `$XDG_STATE_HOME/secret-guard` owned by another user (for example XDG_STATE_HOME under a shared /tmp) is written into. `chmod 700` fails silently.
- Fix: patch shown with F6, below. Result on patched.sh: the FIFO case exits 2 with stderr byte-identical to the old hook, and the symlink victim is untouched.

### F4 MEDIUM: an unreadable log file changes the hook's stderr
- Evidence, line 437 `sz="$(wc -c < "$file" 2>/dev/null)"`. Redirections apply left to right, so a failing `< "$file"` reports before `2>/dev/null` takes effect. Measured with log mode 200: stderr gains `new.sh: line 437: .../denials.log: Permission denied`. Lines 439 and 444 have the same shape.
- Patch:
```
old:     sz="$(wc -c < "$file" 2>/dev/null)"
new:     sz="$( { wc -c < "$file"; } 2>/dev/null)"
old:       lines="$(wc -l < "$file" 2>/dev/null)"
new:       lines="$( { wc -l < "$file"; } 2>/dev/null)"
old:           tail -n "$new_lines" "$file.1" > "$file" 2>/dev/null
new:           { tail -n "$new_lines" "$file.1" > "$file"; } 2>/dev/null
```
Result on patched.sh: stderr is identical to the old hook.

### F5 LOW: a relative XDG_STATE_HOME writes the log into the hook's cwd, usually the project repo
- Evidence, line 423. Measured: `XDG_STATE_HOME=rel` created `<cwd>/rel/secret-guard/denials.log`. The XDG spec says relative values must be ignored, and a log in a repo can be committed. The fix is shown with F6.

### F6 LOW: the file is created under the process umask and only then chmodded to 600
- Evidence: `>>` at line 456 and `tail >` at line 444 create the file with the caller's umask (0666 under umask 000). The chmod happens after the write. The 700 directory hides this window, except when chmod 700 has failed (the F3 foreign-owner case). Measured end state under umask 000, and with a pre-existing 755 dir and 644 file: dir 700, file 600, both correct.
- Combined patch for F3, F5 and F6 (lines 423 and 430-431):
```
old:   dir="${XDG_STATE_HOME:-$home/.local/state}/secret-guard"
new:   umask 077
       case "${XDG_STATE_HOME:-}" in
         /*) dir="$XDG_STATE_HOME/secret-guard" ;;
         *) dir="$home/.local/state/secret-guard" ;;
       esac
old:   ( umask 077; mkdir -p "$dir" ) 2>/dev/null
       [ -d "$dir" ] 2>/dev/null || return 0
new:   mkdir -p "$dir" 2>/dev/null
       [ -d "$dir" ] && [ -O "$dir" ] || return 0
       [ -L "$file" ] && return 0
       [ -e "$file" ] && [ ! -f "$file" ] && return 0
```
The process-wide `umask 077` is safe because `deny` and `detect` `exit` straight after logging, and it saves the mkdir subshell fork. (`file=` is already assigned on the line after `dir=`, so the checks see it.) Measured on patched.sh: FIFO and symlink cases exit 2 with unchanged stderr, a relative XDG value falls back to `~/.local/state`, and umask 000 gives 700 and 600.

### F7 MEDIUM (tests): "a check that passes because it isn't looking" applies to 4 of the 6 phase-1 cases
- `t_phase1_one_line_five_fields`: red before phase 1 for the right reason (no file). Green after for the wrong reason: it counts fields but never checks field 5, and its payload lacks the real hook JSON prefix, so F1 is invisible. Fix: build the payload with session_id, transcript_path, cwd, permission_mode and hook_event_name before tool_name. Assert that field 5 contains the command's own marker text and does not contain `transcript_path`. Add a Write case that asserts the content never appears.
- `t_phase1_redacted_fake_key`: one single-line AKIA shape only. Add these cases: a key split with a JSON `\n`; the base64-marker-plus-tail shape; the PEM marker plus a body line; and a keyword assignment. Build each at runtime the way the file already does. Each is red on ab4d67d and green on patched.sh (measured above).
- `t_phase1_off_switch` and `t_phase1_unwritable_dir`: **green on the pre-phase-1 hook** (measured: 16/20 before). The spec requires each test to be red before the change. These two assert only that nothing changed, which a hook that never logs satisfies trivially. Fix: give each a positive control in the same test. First run without the switch, or with a writable dir, and assert that one line appears (this makes them red before). Then run with the condition and assert no line, exit 2, and stderr byte-identical to the control run. Add a FIFO case (run under `timeout 5`) and an unreadable-file case to the unwritable test. Both are red on ab4d67d because of F3 and F4.
- `t_phase1_output_withheld` and `t_phase1_modes`: both red before for the right reason. Consider also running modes under `umask 000`.

## Verified absent or acceptable (first-class findings)
- **ALLOW path cost: none added.** Old 33 ms vs new 33 ms per call (40-run average, twice each). No state dir is created on allow. The new code on that path is only array and function definitions, with no forks.
- **PostToolUse output:** both `detect` call sites log the fixed literal `<output withheld>` (line 319). No output text is logged in any path.
- **Exit code and stdout:** unchanged in every probe except the FIFO (F3). The hook has no `set -e` or `set -u` (header, line 19). No subshell or trap can propagate a failure. `/dev/full` (disk full), read-only file, read-only parent dir, empty HOME, empty XDG_STATE_HOME and the off switch all give exit 2 with stderr byte-identical to the old hook.
- **Rotation:** measured with a 5.6 MB file. The active file drops to 2.8 MB (the newer half plus the new line) with mode 600, and `.1` holds the whole previous file. Concurrency: 30 trials of 3 simultaneous denies against a file over 5 MB lost 0 deny lines. A theoretical loss window remains: a second writer's `>>` landing between one writer's `mv` and its `tail >` truncation. It is not observed, happens at most once per roughly 50k denies, and can't be closed without a lock that is missing on macOS and Git Bash. I accept it. Optional: note it in INSTALL-secret-guard.md. The `.1` file keeping the full old file means about 8.4 MB peak on disk, which reads as within the spec's "one generation".
- **Portability (by inspection, not executed):** everything the diff uses exists in bash 3.2: `${!arr[@]}`, `${v:0:300}` and `$(( ))`. There is no `stat`, `flock` or GNU-only flag. macOS `wc -c` pads with spaces, and bash's `-gt` accepts that. `date -u +%Y-%m-%dT%H:%M:%SZ` is portable. The selftest's `stat -c || stat -f` fallback covers macOS.

## Advisory (not counted)
- F8 (perf, deny path only): 17 ms before phase 1, 102 ms at ab4d67d, from 25 `$(printf | sed)` forks in `redact_denial_text`. Git Bash forks are roughly 10 times slower, so expect around 1 s per refusal there. The F2 patch fixes this: 47 ms measured.
- F9 (Windows, unverified): Git for Windows mounts with `noacl` by default, so `chmod 700/600` is likely a no-op. That would make `t_phase1_modes` red on Windows. Run the selftest there once before calling Windows green, and exempt modes on MSYS if it fails.
- A space-split key is not denied at all (the fold pass is skipped when the payload has no backslash or newline). This predates phase 1 and is out of scope. Nothing is logged for it.

## Live-guard events during this review
- One probe step was **denied** by the live guard: `SECRET-GUARD: blocked — command references a secret file.` The step was a Bash heredoc that built a secret-path sample for the default-deny and content-adjacency probes. I stopped that step and did not retry it in another form. The later probe steps use key-literal deny triggers only and contain no secret-path references. As a result, the content_adjacency leak in F1 rests on code inspection (lines 1240 and 1283 pass `$RAW`) rather than a live probe.
- `PostToolUse` "SECRET DETECTED IN OUTPUT" appeared three times, all false positives with no real value involved. Once was from reading the hook's own source (the documented self-reference to its base64 and PEM markers). Twice it was "punctuation-obscured" on my probe calls, where the denoiser joined my runtime construction of a fake sk-ant-style byte string (`b'prefix'+b'filler'`) into a key shape. Every value was fake filler (`Q7...`) that I built.
