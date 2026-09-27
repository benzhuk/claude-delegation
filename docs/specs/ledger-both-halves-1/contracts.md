# ledger-both-halves-1: pinned contracts (lead's rulings on the spec)

Spec: `docs/specs/ledger-both-halves-1/spec.md` (lane fifteen, origin/docs/lane-specs-0925 ad0bf95). Base 7aad49b (origin/main, lane thirteen merged). One territory, L1. The spec stands except where these rulings pin or correct it. Facts measured by the lead on 2026-09-27 00:30 NY drive them.

## Facts
- Bitvise on Windows sets `SSH_CLIENT` and `SSH_CONNECTION` (client address first field). OpenSSH on Linux does too.
- Tailnet addresses: zhuk-netcup 100.69.249.18, ben-desktop 100.78.52.18 (the spec's table omitted it), zhuk-vps32 100.111.119.54, bens-m2-air 100.116.13.27.
- ssh users: `ben` on the Linux boxes, `benzh` on ben-desktop, `benzhuk` on the Mac.
- Remote shells: bash on Linux and macOS; cmd on Windows. Windows has NO `cat` on PATH. Netcup's non-login ssh shell has NO bare `node` on PATH. The installed shim exists on each: Linux/macOS `~/.local/bin/note-send`, Windows `note-send` (C:\Users\benzh\.local\bin is on PATH).

## R1. Host table, one place
One frozen constant in note-send.mjs: `{ name, addr, user, os }` for the four hosts above. `--sender-host <name>` looks up by name. Otherwise, the first field of `SSH_CONNECTION`, or else `SSH_CLIENT`, is looked up by addr. Read no other environment variable. Never print either value; the result names only the mapped host `name`. Unknown address: no mirror, `mirrorLedger: {host: null, ok: false, error: 'unknown-sender-address'}`. When the mapped host is this machine (its `name` equals `os.hostname()`'s first label, case-insensitive), there is no mirror, and `mirrorLedger` is absent.

## R2. Remote append goes through the peer's own note-send, stdin only (corrects spec item 2's `cat`)
- New mode: `note-send --append-ledger <YYYY-MM-DD>`. It reads exactly one line from stdin (at most 700 chars plus the newline). It refuses (exit non-zero, nothing written) unless the line parses with `parseEnvelope` and the date arg matches `^\d{4}-\d{2}-\d{2}$`. It appends the line plus `\n` to `notesMirrorPath(os.homedir(), day)`, using the same append the normal ledger write uses (same encoding, no BOM, same locking if any). It does nothing else: no delivery, no outbox, no repo ledger, and no mirror. That last point is the "never re-mirrored" guarantee by construction.
- Mirror call, after the local ledger write succeeded: spawn `ssh -o BatchMode=yes -o ConnectTimeout=3 <user>@<addr> <remote>`, where `<remote>` is `~/.local/bin/note-send --append-ledger <day>` for Linux and macOS, and `note-send --append-ledger <day>` for Windows. The line goes on stdin; the command string contains only fixed text and the validated day, never note content. Hard timeout 5 s: kill the child and report `error: 'timeout'`. No retry.
- `<day>` is the same day key the local ledger write used for this line.
- Version skew is expected until the peer is upgraded. The peer's old note-send rejects the unknown flag, so the mirror reports `ok: false` with a short error (exit code, first stderr line truncated to 120 chars and never including the note). It is best effort.
- The ssh spawn is an injected dependency (`deps.spawnMirror` or equivalent). Tests never run ssh.

## R3. Where it runs
- Only on note-send's own send path, once per invocation, after the local host-ledger write.
- Never from note-flush, the outbox retry, or `drainQuietly`. A deferred send retried later by the flusher does not mirror again. Test that the outbox or retry code path never calls the mirror dependency.
- `--dry-run` reports the planned mirror (host name, remote command) without spawning. `--no-mirror` skips it. No special case by kind or recipient: `--to ben` mirrors like any other note. The line is a ledger fact, and the reviewer may challenge this.
- The exit code and the delivery outcome are unchanged by any mirror outcome.

## R4. Territory and gates
- L1 (Sonnet): `skills/multi/scripts/note-send.mjs`, `skills/multi/scripts/note-send.test.mjs`, `skills/multi/SKILL.md`, and `skills/multi/references/envelope.md` only if a field is added. Import helpers from transport.mjs; do not edit it.
- Gate: `node --test skills/multi/scripts/note-send.test.mjs`.
- Integration: `node scripts/run-tests.mjs`, zero failures on Linux; the known delegation-reminder flake is rerun alone. Second host: the lead's Windows runner, from a bundle with `refs/remotes/origin/main`.

## R5. Live check (changes the spec's acceptance order)
The live check needs the new build installed on both hosts. So the lane is accepted on the suites and Opus, merged, then released by skills-fable. The live check (one real ASK from skills-fable sent on Netcup, and the same id grep'd from both hosts' `~/.agents/notes/<day>.md`) lands as a post-merge Log line and in a follow-up FYI. The lead also runs, before accept, one real-ssh smoke from Netcup to ben-desktop with the worktree's `--append-ledger` invoked by absolute path on BOTH ends. That proves the transport, not the installed shim.
