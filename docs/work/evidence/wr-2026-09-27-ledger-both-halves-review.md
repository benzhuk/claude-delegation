VERDICT: APPROVE 3c6a5f0f466ec7d2d9f1c2fe165c380d459a9e59

# Integration review: ledger-both-halves-1

Reviewed sha: `3c6a5f0f466ec7d2d9f1c2fe165c380d459a9e59` on branch `build/ledger-both-halves-1` in
`/home/ben/Code/wt-lbh`. I confirmed it with `git rev-parse HEAD`. The base is `026a7a0`. L1 was approved at
`b87791b182b8d81b281842a57df094ce90381495` in `L1-review-3.md`. Reviewed 2026-09-27 02:01 EDT (New York).

This was a read-only review. I edited, staged and committed nothing in the tree. This report is the only file I
wrote. All probes ran against scratch homes and a scratch `git archive` copy under the session scratchpad.

**Counts:** 0 blocker, 0 major, 0 minor.

## 1. The integration diff equals the approved L1 diff: verified

- `diff <(git diff 026a7a0 3c6a5f0 -- ':!docs') <(git diff 026a7a0 b87791b -- ':!docs')` produced no output
  (IDENTICAL).
- The sha256 of each file's diff is the same on both sides:
  - `skills/multi/SKILL.md` `909094e1…85e6e`
  - `skills/multi/scripts/note-send.mjs` `3539538c…61de`
  - `skills/multi/scripts/note-send.test.mjs` `95ac2c19…b533`
- `git diff --stat b87791b 3c6a5f0 -- ':!docs'` is empty, so the two code trees are equal.
- Both `026a7a0` and `b87791b` are ancestors of `3c6a5f0`. The range holds 097f654, 158d56e (docs only), b667652,
  b87791b and the merge 3c6a5f0.

## 2. The territory holds: verified

Outside `docs/`, the range `026a7a0..3c6a5f0` changes exactly three files:
- `skills/multi/SKILL.md` (+29/-16 combined)
- `skills/multi/scripts/note-send.mjs` (+248)
- `skills/multi/scripts/note-send.test.mjs` (+439)

`references/envelope.md` is not touched, which is correct because no envelope field was added.
`transport.mjs` and `envelope.mjs` are imported but not edited, as R4 requires.

Every other changed path is under `docs/specs/ledger-both-halves-1/` or `docs/work/`.

## 3. SKILL.md carries the spec author's addendum: verified

I ran a word diff from `097f654` (the SKILL.md before the addendum) to `b87791b`, which has the same content as
3c6a5f0. It shows exactly one change: `kind,` became `kind and stamped at or after the ASK,` in lane thirteen's
overdue paragraph. No other word in that paragraph changed.

The other text this range adds to that paragraph is ", until the sender's host has the thread too, which the mirror
now gives it." That is the spec's own item 6, which predates the addendum. The spec also asks for two new sentences
in the cross-host paragraph. They are present: the line lands on both hosts, the repo ledger is never mirrored, and
the meaning of `mirrorLedger` is spelled out.

## 4. contracts.md R2 and the spec author's two constraints: verified

**`--append-ledger` reads exactly one stdin line, accepts it only if parseEnvelope does, writes only that line, and
has no other side effect.**
- The mode dispatches at `note-send.mjs` `runNoteSend`, straight after `parseArgs` and before any other validation,
  env read, orca call, drain or mirror.
- `runAppendLedgerMode` checks the input in this order:
  1. The day must match `^\d{4}-\d{2}-\d{2}$`.
  2. It refuses a raw input longer than `MAX_LINE + 1`.
  3. It strips one trailing `\n`.
  4. It refuses an empty body, any remaining `\n` or `\r`, or a body longer than `MAX_LINE`.
  5. It refuses anything `parseEnvelope` rejects.
- Only then does it call `appendLine(notesMirrorPath(home, day), body)`. That is the same helper the normal ledger
  write uses.
- The function never references `runMirror`, the outbox, delivery or the repo ledger.
- I ran the real CLI against a scratch `HOME`:
  - A valid line exits 0. The only file created is `.agents/notes/2026-09-27.md`. It holds the standard header that
    `appendLine` writes (the same one a normal send writes) plus the byte-identical line.
  - Two lines on stdin exit 1 and create no files.
  - A non-envelope line exits 1 and creates no files.
- Tests cover these cases at `note-send.test.mjs:1745-1826`, including the test that the mode never calls
  `spawnMirror` and writes no outbox entry.

**A mirror against an older peer without the mode fails open.**
- At base `026a7a0`, `parseArgs` throws `unknown flag --append-ledger` (exit 1) before it does anything else. I ran
  the base script from a scratch `git archive`: exit 1, and it wrote no files.
- End to end, I injected a `spawnMirror` that runs that old peer in place of ssh, then sent
  `--to ben --sender-host ben-desktop`. The result was `ok:true, exitCode:0, notified:true`, with
  `mirrorLedger: {host:"ben-desktop", ok:false, error:"exit 1: note-send: unknown flag --append-ledger"}`.
- `runMirror` never throws. `defaultSpawnMirror` never rejects: it has an EPIPE listener and a SIGKILL plus pipe
  destroy at 5 s. `failureJson` carries `mirrorLedger` on thrown paths. Tests are at `:1633-1735`.

**The Windows remote command.** `remoteAppendCommand` returns `note-send --append-ledger <day>` only for the
`os: 'windows'` row (ben-desktop, `benzh@100.78.52.18`). Every other row gets
`~/.local/bin/note-send --append-ledger <day>`. The PATH shim, not `cat`, matches R2 and the contract Facts
(cmd shell, `C:\Users\benzh\.local\bin` on PATH). The test is at `:1495-1498`.

**The ssh argv carries no note content.**
- The argv is `['-o','BatchMode=yes','-o','ConnectTimeout=3','<user>@<addr>', remote]`.
- `remote` is built only from fixed text and `ymd`. `ymd` is the internally computed day key the local ledger write
  used, and the peer validates it again.
- The envelope travels only as `input` on stdin, spawned with no shell (`spawn(cmd, args)`).
- The error text carries the exit code and the first stderr line, cut to 120 characters. Neither the old peer's nor
  the new peer's refusal messages contain the line.
- My old-peer probe asserted that no argv element contained the note text, and it passed. The test at `:1518-1538`
  pins the exact argv and checks `input === envelope + '\n'`.

## 5. Gate: verified

`node --test skills/multi/scripts/note-send.test.mjs` at 3c6a5f0 exited 0 with 147 tests, 147 passed, 0 failed.
`git status --short -- skills` is clean before and after.

## Observations (no action)

- The worktree has uncommitted changes to docs files (`L1.md`, `L1-gate.log`, `L1-state.md`, the record) and
  untracked reports. None of them are code. They do not affect the sha reviewed here, but the orchestrator should
  commit them deliberately.
- I could not run the Windows shim resolution in cmd from this host. The lead's real-ssh smoke to ben-desktop (R5)
  is the evidence for that.

## Bug-fix fields (C4)

Cause: The integration merged an approved L1 whose fix rounds addressed an EPIPE crash, `mirrorLedger` being dropped
in `failureJson`, self-mirroring by interface address, the R3 retry blind spot, and the 701-character or CR
append-ledger input. The merge introduced no new code.
Discriminating check: The code diff is byte-identical to `026a7a0..b87791b` per file. The gate passes 147/147. An
old-peer end-to-end probe returns exit 0 and `notified:true` with `mirrorLedger.ok:false`.
Fix location: None at integration. The code equals L1 at `b87791b` (`skills/multi/scripts/note-send.mjs`,
`note-send.test.mjs`, `skills/multi/SKILL.md`).
Simplification: None needed. The merge is clean and no-ff with no conflict resolution, so there is nothing to
simplify.
