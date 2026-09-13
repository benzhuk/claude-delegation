#!/usr/bin/env node
// note-send — PINNED CLI CONTRACT (2026-09-12). Builder T1 implements the body; the interface below is frozen.
//
// Compose one peer-note envelope (see ../references/envelope.md), write it to the ledger(s),
// then type it into the recipient's Orca pane. Never drops a note silently.
//
// USAGE
//   note-send --from <pane> --to <pane> --kind ASK|ACK|RESULT|BLOCKED|FYI --id <slug-n> --text "<substance>"
//             [--re <parent-id>] [--goal "<why>"] [--details <path>] [--needs decision|review|ack|none] [--by "<time>"]
//             [--recipient-repo <dir>] [--sender-repo <dir>] [--tz NYC] [--orca <cmd>]
//             [--wait-max <seconds>=600] [--dry-run] [--json]
//
// BEHAVIOUR (in this order)
//   1. Build the envelope line; validate it against the regex in envelope.md (exit 1 on a malformed field).
//   2. Append the line to <recipient-repo>/docs/ledger/<YYYY-MM-DD>.md (mkdir -p) and, when --sender-repo
//      is given and differs, to <sender-repo>/docs/ledger/<YYYY-MM-DD>.md. Ledger first, delivery second.
//   3. Resolve the recipient pane: `<orca> terminal list --json`, match --to against the pane title with
//      leading status glyphs/whitespace stripped (case-insensitive); accept a raw `term_…` handle too.
//      Not found → exit 2 (ledger already written; message names the panes that DO exist).
//   4. Read the pane's agent state from the same listing (field name to be confirmed by the builder from
//      the live JSON). If it is a permission prompt, poll every 10 s up to --wait-max; still blocked → exit 3
//      "deferred". Working/idle → proceed (Claude Code queues typed input during a turn).
//   5. `<orca> terminal send --terminal <handle> --text "<line>" --enter --json`. CLI error → exit 4 with the
//      CLI's message. Success → exit 0.
//   6. Output: human line by default; with --json one object
//      { ok, exitCode, envelope, to, handle, delivered, deferred, ledgers: [paths], error }.
//
// ORCA COMMAND RESOLUTION
//   --orca <cmd>  >  $ORCA_CLI  >  "orca" on PATH. Hetzner needs ~/.local/bin/orca-native-fixed; Windows may
//   pass "node C:/Users/benzh/.local/share/orca-fork-cli/out/cli/index.js" (split on whitespace, first token
//   is the executable). Node ≥ 20, zero npm dependencies, works on macOS, Linux, Windows (Git Bash or cmd).
//
// EXIT CODES: 0 delivered · 1 bad arguments/envelope · 2 pane not found · 3 deferred (permission prompt) · 4 orca CLI error
//
// NEVER: print or log token material; use orca orchestration commands; type into a pane at a permission prompt.

process.stderr.write('note-send: not implemented yet (contract stub)\n');
process.exit(1);
