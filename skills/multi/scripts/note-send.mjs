#!/usr/bin/env node
// note-send — PINNED CLI CONTRACT v2 (2026-09-13). Builder T1 implements the body; the interface below is frozen.
//
// Compose one peer-note envelope (see ../references/envelope.md), write it to the ledger(s), then type it
// into the recipient's Orca pane through the plain terminal path. The SENDER is the safety gate; nothing is
// ever dropped silently.
//
// USAGE
//   note-send --from <slug> --to <slug|term_handle> --kind ASK|ACK|RESULT|BLOCKED|FYI --topic <slug> --text "<substance>"
//             [--n <int>] [--re <parent-id>] [--supersedes <id>] [--goal "<why>"] [--details <path>]
//             [--needs decision|review|ack|none] [--by "<time>"] [--recipient-repo <dir>] [--sender-repo <dir>]
//             [--tz NYC] [--orca <cmd>] [--wait-max <seconds>=600] [--dry-run] [--json]
//
//   The id is derived: <from>-<topic>-<n>; --n defaults to (highest n already in the ledgers for that prefix) + 1.
//   Text for any field is passed as an argv value and forwarded to `orca` with execFile(argv[]) — never through a
//   shell string, so quotes, `$` and backticks in the substance are safe.
//
// BEHAVIOUR (in this order)
//   1. Validate: id lowercase (exit 1 with the lowercase form suggested); kind/needs pairing (only ASK may carry
//      decision/review/ack); Details path format (see envelope.md); no \n \r \t or reserved words in any field;
//      whole line ≤ 500 chars. Build the envelope; it must match the pinned regex (exit 1 otherwise).
//   2. Resolve the recipient pane (`<orca> terminal list --json`): slug match on title with leading glyphs and
//      whitespace stripped, case-insensitive, or a raw `term_…` handle. Ambiguous → exit 2 listing every candidate
//      handle+title; not found → exit 2 listing the panes that exist. Reserved `--to ben`: skip 2–6, write ledger
//      + packet, print the line, exit 0 with delivered:false, notified:true.
//   3. Decide where files go. Recipient repo = the pane's `worktreePath` main checkout (`git rev-parse
//      --git-common-dir`), unless --recipient-repo overrides; empty worktreePath → require --recipient-repo (exit 1).
//      If the pane's `executionHostId` differs from the sender's host: packet + ledger go to --sender-repo,
//      Details must be `<host>:<abs path>`, and passing --recipient-repo is exit 5 (cross-host).
//   4. Ledger first: append the line to <repo>/docs/ledger/<YYYY-MM-DD>.md (mkdir -p) in the recipient repo and,
//      when --sender-repo differs, in the sender repo; always also to ~/.agents/notes/<YYYY-MM-DD>.md. Then
//      classify the pane from `<orca> terminal show --terminal <h> --json` (agentIdentity, agentWait, connected,
//      writable, preview, lastOutputAt) + the tail of `<orca> terminal read` into
//      agent-idle | agent-working | permission | shell | hibernated | unknown.
//   5. Gate: send only on agent-idle or agent-working. permission → poll every 10 s up to --wait-max, then exit 3
//      "deferred". shell / hibernated / unknown → exit 3 with the classification (never type). Codex recipients
//      (agentIdentity codex): additionally wait for idle (`<orca> terminal wait --for tui-idle`) within --wait-max.
//   6. Two-phase delivery: `<orca> terminal send --terminal <h> --text <line> --json` (NO --enter); re-read the pane
//      (`terminal read`); if the line is visible and the classification is unchanged, `<orca> terminal send
//      --terminal <h> --text "" --enter --json` (or the equivalent Enter-only send the CLI supports). If the state
//      changed between reads, do NOT press Enter; exit 3. CLI error → exit 4 with the CLI's message. Success → exit 0.
//   7. Output: one human line by default; with --json exactly one object
//      { ok, exitCode, envelope, id, to, handle, classification, delivered, deferred, notified,
//        ledgers: [paths], packetPath, error }.
//
// ORCA COMMAND RESOLUTION
//   --orca <cmd>  >  $ORCA_CLI  >  "orca" on PATH. Hetzner needs ~/.local/bin/orca-native-fixed; Windows may pass
//   "node C:/Users/benzh/.local/share/orca-fork-cli/out/cli/index.js" (split on whitespace; first token is the
//   executable). Node ≥ 20, zero npm dependencies; macOS, Linux, Windows (Git Bash or cmd).
//
// EXIT CODES: 0 delivered (or notified for ben) · 1 bad arguments/envelope · 2 pane not found or ambiguous ·
//             3 deferred / unsafe pane state · 4 orca CLI error · 5 cross-host misuse
//
// NEVER: print or log token material; use orca orchestration commands; press Enter into a pane whose state you
//        did not just verify; pick one of several matching panes.

process.stderr.write('note-send: not implemented yet (contract stub v2)\n');
process.exit(1);
