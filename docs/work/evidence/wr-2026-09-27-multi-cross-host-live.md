VERDICT: PASS (live proof for lane 25, run by skills-h on zhuk-vps32 (Hetzner), 2026-09-27 16:51 to 17:10 NYC)

## Defect 1: note-send refuses a note nobody here can read
Command, run from /home/ben/Code/claude-delegation on Hetzner with the branch code (3ba1cb4):
  env -u ORCA_TERMINAL_HANDLE -u NOTE_SLUG node <worktree>/skills/multi/scripts/note-send.mjs --from skills-h --to skills-fable --kind FYI --topic lane25-refusal-probe --text "probe, should be refused"
Result: exit 6, {"refused":"no-local-recipient","to":"skills-fable","hint":"run note-send on the recipient's machine over ssh, or pass --sender-host <this host>"}. docs/ledger/2026-09-27.md had 9 lines before and 9 after.
Finding (F2): the same send with --sender-host zhuk-vps32 is also exit 6. --sender-host names the host the sender came from and only mirrors when note-send runs on another machine, so the pinned hint's "or pass --sender-host <this host>" is wrong for a local run. The prose and docs were corrected in round 2. The pinned JSON hint is unchanged, pending the spec owner.

## The documented route reaches the Windows ledger
ACK (lane pickup), 16:31 NYC:
  ssh benzh@ben-desktop.tail219acd.ts.net "note-send --from skills-h --to skills-fable --kind ACK --topic multi-cross-host --re skills-fable-lane-25-1 --text \"...\""
  -> recorded in C:/Users/benzh/Code/claude-delegation/docs/ledger/2026-09-27.md
Live-proof ASK, 16:52 NYC:
  ssh benzh@ben-desktop.tail219acd.ts.net "note-send --from skills-h --to skills-fable --kind ASK --topic lane25-live-proof --needs ack --by 17:45 --sender-host zhuk-vps32 --text \"...\""
  -> skills-h-lane25-live-proof-1, delivered to skills-fable's inbox on ben-desktop, line 103 of C:\Users\benzh\.agents\notes\2026-09-27.md, mirrored to line 17 of Hetzner ~/.agents/notes/2026-09-27.md
ACK: skills-fable-lane25-live-proof-1 re skills-h-lane25-live-proof-1, 16:52 NYC, sent by skills-fable on Hetzner (line 18 of ~/.agents/notes/2026-09-27.md, line 10 of docs/ledger/2026-09-27.md).

## Defect 2: the on-time ACK answers the ack ask
runOverdueAsks was run twice (the first pass seeds) against a scratch home holding a copy of Hetzner's real ~/.agents/notes/2026-09-27.md, with now = 2026-09-27T22:05:00Z (18:05 NYC, 20 minutes past the deadline) and a stubbed send:
- base 0c92605 note-flush.mjs: open 1, nudged 1 (the false overdue alarm)
- branch note-flush.mjs: open 0, nudged 0
The installed flushers on Hetzner and ben-desktop still run 0.20.15 (the old rule) until the next release is installed, so their own flush.log can still show an overdue line for this ASK after 17:45. That is recorded below at close if it happens.
