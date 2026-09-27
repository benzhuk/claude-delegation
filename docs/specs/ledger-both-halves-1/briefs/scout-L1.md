# Scout — L1 (note-send both-halves mirror)

Read at 026a7a0717964a5bcf3d70a93240f9ff1cfa8004 (/home/ben/Code/wt-ledger-both-halves-1-L1, Linux).

## 1. Files and symbols
- `note-send.mjs` (879 lines): `STRING_FLAGS`/`BOOL_FLAGS` at :118-122 — `--sender-host` and
  `--no-mirror` are not there yet, add both. `runNoteSend` args parsed :213-236; `env.ORCA_SENDER_HOST`
  already exists (:236) for a DIFFERENT purpose — flipping `isLocalPane` for delivery routing, unrelated
  to the new sender-HOST-for-mirroring concept. Naming collision risk: pick a distinct internal name.
  Ledger write loop is `for (const t of ledgerTargets) appendLine(t, envelope, fsImpl);` at :542 — the
  `base` object built right after (:544-547) is spread (`...base`) into EVERY return past this point
  (isBen, quietKind, inbox-delivered/not, paneError, noType, permission-deferred, two-phase-delivered) —
  attaching `mirrorLedger` to `base` once, right after the local write, reaches every exit path
  including `--to ben` (contracts R3: no special case by recipient). Dry-run returns EARLY at :488-515,
  before the ledger write — the planned-mirror report (spec item 4) needs its own lines in that block.
- `transport.mjs`: `mainCheckout` (already fixed, :422-449, matches merged linux-green-1). `appendLine`
  (:843-849) does mkdir + `wx` day-header + append — reusable as-is for `--append-ledger`'s write.
  `makeOrcaRunner` (:554-586) is the execFile-with-timeout/kill pattern to model the ssh spawn on
  (`deps.execFile` injection, `err.killed` → timeout message) — note async `execFile`'s promisified
  return exposes `.child` for writing stdin; there is no `input:` option on the async form (that's
  sync-only).
- `SKILL.md`: the "cross-host paragraph" (spec item 6) is :306-308 ("A peer on another machine: run
  note-send ON that machine over ssh... There is no `<host>:` path form."). The "lane thirteen
  overdue-cross-host sentence" is :140-143, ending "...since a cross-host pair's ledger here is only
  half the conversation." — append the mirror clause there, verbatim per spec item 6's wording.
- `envelope.md`: spec's territory line makes it in-scope "only if a field is added" — no field is
  added (`mirrorLedger` is a JSON result field, not envelope grammar), so this file is OUT of scope.

## 2. Helpers to reuse
- `appendLine` (transport.mjs:843) for the `--append-ledger` write; `notesMirrorPath(home, day)` for its
  target path; `parseEnvelope` (envelope.mjs:185) for the one-line validation R2 requires.
- `makeOrcaRunner`'s timeout/kill pattern (transport.mjs:554-586) for the ssh child's 5 s bound.

## 3. Tests that police this area
- `hooks.test.mjs:429` "N2" scans every `.test.mjs` in the repo for a literal `process.env` spread and
  fails repo-wide if found — any new test building a fake child env must use `childEnv()`
  (test-child-env.mjs), never spread `process.env` itself.
- `note-send.test.mjs:240` "M4" already pins `ORCA_SENDER_HOST`'s existing, unrelated meaning — do not
  repurpose that variable or that test.

## 4. Open questions for the spec
- **note-flush.mjs:1512** (`runOverdueAsks`, out of L1's file map) calls `runNoteSend` directly to send
  its own BLOCKED nudges — a genuinely NEW send, not a retry. Contracts R3 says mirror fires only on
  "note-send's own send path" and lists note-flush/outbox-retry/drainQuietly as exclusions, plus "test
  that the outbox or retry code path never calls the mirror dependency." The outbox retry and
  `drainQuietly` never call `runNoteSend` at all (they call `deliverToInbox`/`twoPhaseSend` directly), so
  they are safe by construction. But `runOverdueAsks`'s nudge send is NOT a retry — it goes through
  `runNoteSend`'s normal path. In practice its process has no `SSH_CONNECTION`/`--sender-host`, so
  sender-host resolves local and mirror never fires — but nothing pins this. The spec/contracts do not
  resolve whether this is an accepted consequence of the design or needs an explicit suppression; L1
  cannot fix it by editing note-flush.mjs (out of territory) if the answer is "needs suppression."
