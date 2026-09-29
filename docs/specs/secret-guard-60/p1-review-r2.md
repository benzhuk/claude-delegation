VERDICT: NEEDS_FIXES f7ca1eb21de226122ac037c146b89b6d66089562 (1)

# Lane 60 phase 1 (denial log): delta re-review r2

Scope: the one commit f7ca1eb on top of ab4d67d in /var/tmp/lane-60/dot, checked against my findings F1-F7 in `/var/tmp/lane-60/p1-review.md`. Nothing in the reviewed tree was modified. Scratch copies are in `/var/tmp/p1rev-BlkRFS/`: `ab.sh` (ab4d67d), `f7.sh` (f7ca1eb) and `f7p.sh` (f7.sh plus the R2-1 patch below). Probe fixture dirs (`r2probe-*`, `agent-*`) were left in place because the brief says to delete nothing. Every probe used fake keys built at runtime and printed booleans only.

## Gate
- `TMPDIR=/var/tmp bash dot_claude/hooks/executable_secret-guard-selftest.sh` in /var/tmp/lane-60/dot gives **30 passed, 0 failed (of 30)**. No `secret-guard-selftest-*` fixture dirs were left behind.
- The same corpus fails 10/30 against ab4d67d and 12/30 against b29f3f8 (the pre-phase-1 hook). This matches the builder's report. Each named failure is the case written for that F-finding, so the new tests are red before the change for the right reason.
- Leaving comments aside, the code in f7ca1eb's hook is **byte-identical to the patched copy I built and measured in r1**. The diff against my `patched.sh` differs only in one comment line.

## F1-F7 status (re-probed against f7ca1eb)
| Finding | Status | Evidence (f7.sh) |
|---|---|---|
| F1 field 5 raw envelope / file content | **Closed** | With a realistic envelope, field 5 holds the command marker and no transcript_path or session_id. Write, Edit and NotebookEdit each log only their path (`/tmp/x.md`, `/tmp/n.ipynb`), with content absent. |
| F2 redaction misses | **Closed** | All 22 single-line shapes are denied and redacted, and none leak. Base64 tail, PEM body, and newline-split keys (AKIA, ghp, JWT, keyword) are not in the log. At the 300-char boundary no key characters leak. PostToolUse field 5 is exactly `<output withheld>`. |
| F3 FIFO / symlink / dir | **Closed** | FIFO: exits 2 at once, stdout empty, stderr byte-identical to b29f3f8. Symlink victim is unchanged (644, 1 line). A directory at the log path stays 755. `/dev/full`: unchanged. |
| F4 stderr on an unreadable file | **Closed** | stderr is byte-identical to b29f3f8. |
| F5 relative XDG_STATE_HOME | **Closed** | Nothing is created under the cwd, and it falls back to `~/.local/state/secret-guard/denials.log`. |
| F6 umask window | **Closed** | umask 000 gives dir 700 and file 600. The file is now created under umask 077. |
| F7 vacuous tests | **Closed** | off_switch and unwritable_dir now carry a positive control and are red on b29f3f8. five_fields uses the full envelope and checks what field 5 contains. The FIFO, symlink, dir, unreadable-file and relative-XDG cases are red on ab4d67d. |

## Regression hunt (the coordinator's three questions)
1. **Does `umask 077` leak to a path that doesn't exit? No (verified).** `write_denial_log` has exactly two call sites. `deny()` calls it at f7.sh:310 with `exit 2` on the next line. `detect()` calls it at :319 with `exit 2` on the next line. No other caller exists. After `umask 077` (:452), nothing else in the process runs except the rest of `write_denial_log`, whose rotation `tail >` should run under 077 anyway.
2. **Can the folded residual check fire or fork on the ALLOW path? No (verified).** `redact_denial_text` is called only from `write_denial_log` (:499), which runs only from deny or detect. Measured allow path, `ls -la src` payload, 40-run average, twice each: ab4d67d 33/33 ms, f7ca1eb 33/32 ms. No state dir was created on allow. The deny path went from 100 ms to 45 ms, because one sed fork replaced 25. The residual check can wrongly withhold an ordinary denied command's text, but that affects only what the log says, never the decision.
3. **Does `denial_target_text` carry prompt bodies for Agent and other tools? Yes.** This is R2-1 below.

## Finding

### R2-1 MEDIUM: Agent, Task and MCP tool inputs log their body text, including pasted file contents and non-key secrets
- Evidence: f7.sh `denial_target_text` (:426-439). The `*)` arm logs the `tool_input` fragment for **every** tool other than Write, Edit, MultiEdit and NotebookEdit. For Agent and Task that fragment is the `prompt` body (after `description` is stripped). For MCP tools such as `mcp__notion__create_page` it is the page `content`. Such a call is denied when a key literal appears anywhere in it, or through `content_adjacency_other`. The log then keeps up to 300 chars of the body.
- Measured with fake data: a prompt holding a pasted file body, a `DATABASE_URL=postgres://user:<fake password>@host/db` line and one fake key. The key is redacted, but the pasted body and the password are logged. Result: `body_in_log True, password_in_log True` for all three of Agent, Task and mcp__notion__create_page. A connection-string password is not one of the guard's key shapes, so redaction cannot catch it.
- This breaks the spec's "never holds file contents" rule. A prompt or page body is also not "the command or target text". The gap came from my own r1 F1 patch, whose `*)` default was too broad. The builder applied that patch verbatim.
- Fix (mechanical): allowlist the tools whose `tool_input` is a command or a target, and withhold everything else.
```
old:
    *)
      t="${CMD_SCOPE#*\"tool_input\"}"
      if [ "$t" = "$CMD_SCOPE" ]; then printf '%s' '<target unavailable>'; return 0; fi
      printf '%s' "${t#*:}"
      ;;
  esac
new:
    Bash|Read|Grep|Glob|LS)
      t="${CMD_SCOPE#*\"tool_input\"}"
      if [ "$t" = "$CMD_SCOPE" ]; then printf '%s' '<target unavailable>'; return 0; fi
      printf '%s' "${t#*:}"
      ;;
    *) printf '%s' '<input withheld>' ;;
  esac
```
- Add a selftest case `t_phase1_agent_prompt_withheld`. It sends an Agent payload whose `prompt` holds a marker string plus a runtime-built fake key, then asserts exit 2, field 5 exactly equal to `<input withheld>`, and the marker absent. It is red on f7ca1eb.
- Measured on `f7p.sh` (f7ca1eb plus this patch): selftest **30/30**. The Agent probe logs `PreToolUse  Agent  key_literal  <input withheld>`. Bash, Read, Grep and Write logging is unchanged, since the selftest covers all four.

## Verified acceptable, not findings
- If `secret-guard/` is itself a symlink to a directory the user owns, the log is written through it (`[ -d ]` and `[ -O ]` follow the link). That is the user's own choice of state location, and a symlink at the *file* path is still refused. I accept this.
- A Bash heredoc command can still carry file-like text in field 5. The spec defines field 5 as "the command", so this is within the contract.

## Live-guard events during this round
- `PostToolUse` "SECRET DETECTED IN OUTPUT" fired once, on my big probe call. The trigger was my own probe *input*, which assembled fake keys from runtime fragments. The output was booleans and paths only. All values were fake `Q7` filler, and no real value was involved.
- There were no PreToolUse denials this round. I made no secret-path probes.
