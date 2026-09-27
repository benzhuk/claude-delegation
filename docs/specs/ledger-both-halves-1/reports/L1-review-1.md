VERDICT: NEEDS_FIXES (8) 097f6541f03467de66d06c39eceddeca4917ddd0

NEEDS_FIXES

# L1 review, round 1: ledger-both-halves-1

Reviewed at `097f6541f03467de66d06c39eceddeca4917ddd0` (`git rev-parse HEAD` in
`/home/ben/Code/wt-ledger-both-halves-1-L1`, run by me). The worktree was clean before and after the review. Every trial
edit was made on a scratch copy (`git archive HEAD skills`) under the session scratchpad. No file in the reviewed tree was
touched.

Gate re-run by me: `node --test skills/multi/scripts/note-send.test.mjs` gave 141 pass and 0 fail.
`node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` gave 1 pass and 0 fail. The builder's gate log
agrees.

Counts: 0 blocker, 4 major, 4 minor. The fixes for MAJOR-1/2/3 and MINOR-1/2 below were applied together on the scratch
copy. The suite on that copy stayed at 141/141, and every probe gave the predicted result. The results are quoted with
each finding.

---

## MAJOR-1: a fast-exiting ssh child crashes note-send after the ledger write. The exit code changes and the note is neither delivered nor queued.

- File: `skills/multi/scripts/note-send.mjs:192-212` (`defaultSpawnMirror`). `child.stdin` has no `'error'` listener. If
  the child exits before it reads stdin, the async write fails with EPIPE. That error is emitted on `child.stdin`, and with
  no listener it becomes an uncaught exception that kills the process.
- Measured: I ran the real CLI in a scratch HOME with a stand-in `ssh` first on PATH. The stand-in is `echo … >&2; exit 3`
  and never reads stdin. The command was `note-send --from taxonomy --to ben --kind FYI … --sender-host ben-desktop --json`.
  **3/3 runs:** `Error: write EPIPE … at defaultSpawnMirror (note-send.mjs:183)`, `exit=1`, and no JSON on stdout. The
  ledger line was written (3 lines in the scratch `~/.agents/notes/2026-09-27.md`). The mirror runs before any delivery
  branch (`:730` comes before `:751`), so the ben-inbox append or outbox queue never happens. The result is a note that is
  recorded but never delivered or queued. That is the stall this lane exists to remove, and it breaks R3: "the exit code
  and the delivery outcome are unchanged by any mirror outcome".
- Real OpenSSH early failures did not trigger it in 3/3 runs each: connection refused on `127.0.0.1:1`, and
  `-F /nonexistent`. Both took about 9 ms, so the write reached the pipe first. This is a race. It is not a guaranteed
  crash, but the code comment's promise to "never throw" is false.
- Patch (exact):
  - old:
    ```js
        child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    ```
  - new:
    ```js
        // A child that exits before reading stdin (ssh failing fast) makes the write EPIPE asynchronously;
        // with no listener that is an uncaught 'error' that kills note-send after the ledger write.
        child.stdin.on('error', () => { /* best effort: 'close'/'error' on the child still resolves */ });
        child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    ```
- Verified on the scratch copy: the same stand-in `ssh`, 3/3 runs, gave `exit=0` and
  `"mirrorLedger":{"host":"ben-desktop","ok":false,"error":"exit 3: fake ssh: refusing"}`.

## MAJOR-2: `mirrorLedger` is dropped from the CLI's JSON on every thrown path (exit 3/4), including the default no-inbox deferral.

- File: `skills/multi/scripts/note-send.mjs:1007-1018` (`failureJson`). The thrown `NoteError`s at `:821`, `:869`,
  `:920`, `:941`, `:954`, `:960` and `:965` all carry `...base`, so they carry `mirrorLedger` too. `failureJson` lists its
  fields one by one and leaves `mirrorLedger` out. `main()` prints only `failureJson(err)`.
- Measured with a scratch probe using the no-inbox path, which is the default deferral when `MULTI_ALLOW_TYPING` is unset:
  `threw exit 3 classification no-inbox`,
  `err.mirrorLedger = {"host":"ben-desktop","ok":false,"error":"exit 255: …"}`, and
  `CLI stdout JSON has mirrorLedger key: false`.
- Impact: a remote send that defers (the USAGE text calls this "normal") reports no `mirrorLedger` at all. SKILL.md's new
  sentence says a missing key means a local send, so a failed mirror is misread as "local, nothing to mirror". Spec item 2
  requires the failure to be logged in the JSON result. No test covers a thrown path, because every new test asserts on a
  resolved `runNoteSend` return.
- Patch (exact), in `failureJson`:
  - old:
    ```js
        warnings: err.warnings ?? [], error: err.message,
    ```
  - new:
    ```js
        warnings: err.warnings ?? [], error: err.message,
        ...(err.mirrorLedger !== undefined ? { mirrorLedger: err.mirrorLedger } : {}),
    ```
  - Add one test: a no-inbox send (env `{}`, `--sender-host zhuk-netcup`, a failing `spawnMirror`) that
    `rejectsWith(…, 3)`. Assert `err.mirrorLedger.ok === false` and assert that `failureJson` keeps it. `failureJson` is
    not exported; either export it, or assert via a child-process CLI run with the `childEnv()` helper.
- Verified on the scratch copy: `CLI stdout JSON has mirrorLedger key: true`.

## MAJOR-3: the "this machine" check (R1) never fires on Netcup, so a Netcup sender resolved on Netcup ssh's to itself and writes the line twice to the same file.

- File: `skills/multi/scripts/note-send.mjs:432-434`. Self-detection compares the table name only with `os.hostname()`'s
  first label.
- Measured on this host (the lead's Netcup box): `os.hostname()` first label = `v2202608391056492408`, not `zhuk-netcup`.
  `os.networkInterfaces()` does contain `100.69.249.18`.
- Probe: `runNoteSend([... '--sender-host','zhuk-netcup'], {…spawnMirror})` with no `hostname` injected gave
  `spawn calls: [ 'ben@100.69.249.18' ]` and `mirrorLedger: {"host":"zhuk-netcup","ok":true}`. In production, that is an
  ssh to this same machine whose `--append-ledger` appends a second copy of the line to the same
  `~/.agents/notes/<day>.md`. That is a double line, from the attack brief's double-mirror class.
- Triggers: `--sender-host zhuk-netcup` passed on Netcup, which is easy to do by habit after reading the new SKILL.md
  sentence, or an ssh from Netcup to its own tailnet address. Windows and vps32 hostnames were not measured here. If
  either is not literally `ben-desktop` / `zhuk-vps32`, the same failure applies there.
- Fix: match on the host's own interface addresses as well as the hostname. This reads no environment variable, and it is
  injectable so the tests stay hermetic.
  - old:
    ```js
      const mirrorIsLocal = Boolean(mirrorSenderHost) && mirrorSenderHost.name.toLowerCase() === localHostLabel;
    ```
  - new:
    ```js
      const localAddrs = deps.localAddrs ?? Object.values(os.networkInterfaces()).flat().map((i) => i?.address);
      const mirrorIsLocal = Boolean(mirrorSenderHost)
        && (mirrorSenderHost.name.toLowerCase() === localHostLabel || localAddrs.includes(mirrorSenderHost.addr));
    ```
  - The tests must be made host-independent in the same change. With this patch alone, 9 L1 tests fail on Netcup: the dry-run
    test, `--sender-host given explicitly…`, the 4 failure/timeout/spawn-error tests, `--to ben`, ledger-only, and the R3
    drain test. They fail because they use `--sender-host zhuk-netcup` and rely on the real host. In the L1 block
    (`note-send.test.mjs:1497-1780`), replace `now: NOW,` with `now: NOW, hostname: 'test-host', localAddrs: [],`. The
    self test at `:1569` keeps its later `hostname: 'zhuk-netcup.tailnet'` key, which wins in the object literal. Also add
    one test with `localAddrs: ['100.69.249.18']` and `hostname: 'v2202608391056492408'`: it expects no spawn and no
    `mirrorLedger` key.
- Verified on the scratch copy: the self probe gave `spawn calls: []` and `mirrorLedger: undefined`. The suite was 141/141
  after the test-deps edit.
- This goes beyond the literal wording of R1 ("its `name` equals `os.hostname()`'s first label"). It keeps R1's intent,
  but the lead should confirm it.

## MAJOR-4: the R3 "outbox/retry never calls the mirror" test does not exercise the outbox or retry path.

- File: `skills/multi/scripts/note-send.test.mjs:1746-1766`. The test injects a stub `flush` that returns `{drained:0}`.
  It then asserts that the stub was called once and `spawnMirror` once. That stub cannot reach `spawnMirror` whatever the
  production code does. The test would still pass if `drainQuietly`/`runNoteFlush` were changed to call `runNoteSend` and
  mirror again. Contracts R3 requires this test: "Test that the outbox or retry code path never calls the mirror
  dependency." Attack brief item 3 asks for a real one.
- Independent check of the claim: the claim itself holds. `drainQuietly` (`note-flush.mjs:1624-1635`) goes into
  `runNoteFlush`, which does not import or call `runNoteSend`. The only `runNoteSend` use in `note-flush.mjs` is the
  overdue-nudge `send` at `:1512`. A nudge is a new id, so it is not a double mirror of the ASK's line (see MINOR-4).
- Fix (instruction): in `note-send.test.mjs`, import `runNoteFlush` from `./note-flush.mjs`. Importing it is allowed;
  editing it is not.
  1. Queue a deferred send with `runNoteSend`: no-inbox path, env `{}`, `--sender-host zhuk-netcup`, a counting
     `spawnMirror`, `hostname: 'test-host', localAddrs: []`. Assert exit 3, one outbox entry, and a mirror count of 1.
  2. Run `runNoteFlush([], { home, orca: <delivering mockOrca>, env: { SSH_CONNECTION: '100.69.249.18 1 2 3' }, spawnMirror: <same counter>, … })`
     against the same `home`. This is the real retry.
  3. Assert that the count is still 1 and that the day's `~/.agents/notes` file holds exactly one line carrying the id.
  Passing the counter in the flush deps also catches a future change that sends retries through `runNoteSend` with
  forwarded deps. Predicted result: it passes today and fails if the retry is ever routed through `runNoteSend`.

---

## MINOR-1: `--append-ledger` accepts a 701-char line with no trailing newline, and accepts a trailing CR.

- File: `skills/multi/scripts/note-send.mjs:253-258`. The length check is on `raw` (`> MAX_LINE + 1`), so a 701-char body
  without `\n` gets through. `parseEnvelope` has no length check, because `ENVELOPE_RE` does not bound length.
- The `Goal:`/`by` groups are `[^\t\n]`, so they match `\r`.
- Measured:
  - `701 chars, no newline -> ACCEPTED, len 701`.
  - `…Goal: g\r\n -> ACCEPTED`, and `od -c` of the ledger shows `g \r \n`: a stray CR written into the ledger.
- Patch:
  - old: `  if (!body || body.includes('\n')) {`
  - new: `  if (!body || body.includes('\n') || body.includes('\r') || body.length > MAX_LINE) {`
- Add a 701-char no-newline case to the test at `:1719`.
- Verified on the scratch copy: both cases are rejected with exit 1. A 700-char line plus `\n` is still accepted and
  byte-identical.

## MINOR-2: the L1 tests are not hermetic. They can run real ssh on a regression and depend on the host's name.

- `note-send.test.mjs:1497-1510`: the dry-run test injects no `spawnMirror`. If a regression reached `runMirror`,
  `defaultSpawnMirror` would run a real `ssh ben@100.69.249.18 … --append-ledger` from the suite. On Netcup, with keys
  loaded, that would append to the real `~/.agents/notes`. The test also cannot fail on a spawn, because its only guard is
  `res.mirrorLedger === undefined`.
- Every mirror-expecting test takes `os.hostname()` from the real host. The `SSH_CONNECTION` test at `:1534` would fail on
  a host whose hostname is `zhuk-vps32`.
- Patch for the dry-run test deps:
  - old: `{ orca: mockOrca({}), home: tmp(), git: () => '.git', now: NOW },`
  - new: `{ orca: mockOrca({}), home: tmp(), git: () => '.git', now: NOW, hostname: 'test-host', localAddrs: [], spawnMirror: async () => { throw new Error('dry-run spawned'); } },`
- For the rest, apply the `hostname`/`localAddrs` injection from MAJOR-3. Verified on the scratch copy: 141/141.

## MINOR-3: the 5 s bound resolves only on `'close'`, so a grandchild that holds stderr outlives it.

- File: `note-send.mjs:187-206`. On timeout, the child gets SIGKILL, but the promise resolves only on `'close'`. That event
  waits for every holder of the stderr pipe to close.
- Measured with the verbatim function:
  - `spawn('sleep',['60'])` with a 1000 ms bound resolved in 1003 ms (`timedOut:true`). This is correct for a
    single-process child, and attack item 5 is otherwise satisfied: it is a real kill, not an abandoned race.
  - `sh -c 'sleep 60'` with a 1000 ms bound was still pending at 25 s.
- Real-world trigger: `ProxyCommand`/`ProxyJump`. The measured count for the four addresses on this host is 0/4, and
  ControlMaster is `false`, hence minor.
- Patch, timer body:
  - old:
    ```js
          timedOut = true;
          try { child.kill('SIGKILL'); } catch { /* already gone */ }
    ```
  - new:
    ```js
          timedOut = true;
          try { child.kill('SIGKILL'); } catch { /* already gone */ }
          try { child.stdin?.destroy(); child.stderr?.destroy(); } catch { /* ignore */ }
          resolve({ ok: false, code: null, stderr, timedOut: true });
    ```
  A second `resolve` from `'close'` is a no-op.

## MINOR-4 (lead ruling): an inherited `SSH_CONNECTION` makes a host-local send, including a note-flush nudge, mirror to the ssh client's host.

- The builder's section-4 resolution is correct for the timer-driven flusher. `runOverdueAsks` (`note-flush.mjs:1605`)
  passes note-flush's own `env` to `runNoteSend`. A systemd timer or scheduled task has no `SSH_CONNECTION`, so the send
  resolves as local. There is no double mirror in any case: the nudge is a new `note-flush-…-overdue-n` id, and the outbox
  retry never calls `runNoteSend`.
- Not covered: `note-flush` run by hand in an ssh shell, or any agent in a tmux started over ssh. tmux's default
  `update-environment` includes `SSH_CONNECTION`. These processes inherit the client's address, and their local sends
  (nudges included) mirror to that client host. R3 says "never from note-flush".
- Measured: this session has `SSH_CONNECTION` unset (presence checked only, no value read out), so the exposure is not
  universal.
- One option inside L1's territory that is not a note-flush edit: skip the mirror when `args.from === 'note-flush'`. The
  nudge always sends `--from note-flush`, and a note-flush process is host-local by definition. Section 4 of the brief
  forbids this special case, so it is for the lead to decide. I did not count it against the builder.

---

## Verified clean (attack brief)

1. **Remote append is inert.** `spawn(cmd, args)` takes an argv array and no shell. The remote string is fixed text plus
   `ymd` (`:387`, digits only from `timeParts`). The envelope goes only on stdin (`:735`).
   - The peer checks independently: an embedded `\n` gets exit 1, an over-length line gets exit 1 (see MINOR-1 for the
     off-by-one), and a non-envelope line gets exit 1 with nothing written.
   - A body carrying `` `id` $(rm -rf ~) ; echo pwned `` is a valid envelope. It is appended as data, byte-identical, and
     never enters a command.
   - A malformed day (`../../x`, `2026-09-27\n`) is rejected. `2026-13-45` is accepted; R2 asks only for the regex.
2. **Host table.** `MIRROR_HOSTS` (`:135-140`) is frozen, has 4 rows, and matches contracts' Facts exactly: names, addrs,
   users and os. An unmapped address gives `{host:null, ok:false, error:'unknown-sender-address'}` with no spawn (test
   `:1546`). An unknown `--sender-host` name gives `NoteError(1)`.
3. See MAJOR-4 and MINOR-4.
4. **No `--to ben` carve-out.** `isBen` does not appear in the mirror logic. The mirror at `:730` comes before the `isBen`
   branch at `:751`. The test at `:1663` covers it.
5. **The kill is real.** SIGKILL fires on timeout, and a single-process child was measured bounded at 1003 ms. For the
   grandchild case, see MINOR-3.
6. **No environment leaks.** The diff has one environment read: `env.SSH_CONNECTION || env.SSH_CLIENT` (`:170`). No other
   env var is read for this feature. Neither raw value goes into a result, a log, stdout/stderr, or an error message. Only
   `host.name` is output, plus the table `addr` in the dry-run plan string.
7. **Dry run and `--no-mirror`.** Dry run returns at `:684-693`, before `runMirror` at `:731`: the plan line is there and
   nothing is spawned. The test itself lacks a tripwire (MINOR-2). `--no-mirror` is silent, including for an unknown
   address (tests `:1583` and `:1597`).
8. **Byte-identical and no re-mirror.** `input === envelope + '\n'` (test `:1528`). `--append-ledger` returns at `:367`,
   before anything else, and never calls `runMirror`. The test at `:1729` asserts no spawn and no outbox.
9. **Absent versus `ok:false`.** For a plain local send the key is absent (test `:1561`), which is distinct from the
   unknown-address `ok:false` case.
10. **Territory.** `git diff --stat 026a7a0` shows 3 files: `SKILL.md`, `note-send.mjs` and `note-send.test.mjs`.
    `transport.mjs`, `note-flush.mjs`, `envelope.mjs` and `references/envelope.md` are untouched (empty diff).
11. **N2.** Green, 1/1. There is no `process.env` in the test diff, and no existing test line was removed.
12. **SKILL.md.**
    - `:143-144` adds "…only half the conversation, until the sender's host has the thread too, which the mirror now gives
      it." This matches spec item 6 verbatim.
    - `:309-314` states that the line "now lands on both hosts", that `docs/ledger` is never mirrored, and what
      `mirrorLedger`'s three shapes mean. It also says the mirror never changes the exit code or delivery outcome.
    - Nit, not counted: "absent for a local send". The key is also absent for `--no-mirror` and the self-host case.

## Section-4 resolution

The builder's report states the resolution explicitly: no special case, and in practice the flusher resolves as local. It
also flags the residual risk honestly. My independent check confirms it for timer-driven runs. The remaining gap is
MINOR-4, which is for the lead to decide.
