VERDICT: PINNED

# Lane 29 interface contract — inbox truth

Scope is limited to `skills/multi/scripts/note-inbox.mjs` and its test,
`hooks/multi-hook-core.mjs` line 49 and its test, and the one paragraph in
`skills/multi/SKILL.md` specified below. No transport, hook entrypoint,
sender, flusher, module, or record interface is added.

## Packet state

For every emitted note, the additive `packetChecked` field is boolean. It is
`false` when no repository source was consulted, including `--no-repo` or no
resolved repository; otherwise it is `true`. A note without `Details:` also
uses `packetChecked: false`.

For a note with `Details:`, `packetExists` is strictly three-valued:

| `packetChecked` | `packetExists` | Meaning |
| --- | --- | --- |
| `false` | `null` | No repository source was consulted; packet existence is not checked. |
| `true` | `true` | A consulted repository source contains the packet; `packetPath` is that path. |
| `true` | `false` | At least one repository source was consulted and none contains the packet. |

`packetLocation` returns `exists: null` in the first case. The inbox result
adds `packetChecked` without changing unrelated fields. The `problems` list
may add a missing-packet problem only when `packetExists === false`; `null`
never represents a missing packet.

## Strict renderer contract

For a note with `Details:`, both `summarise` and `formatInbox` select text by
strict equality, never truthiness:

| State | Required rendering meaning |
| --- | --- |
| `packetExists === true` | `(packet: <path>)` |
| `packetExists === false` | `(packet MISSING: <details>)` |
| `packetExists === null` | `(packet: <details>, not checked here)` |

The existing renderer-specific surrounding punctuation may remain, but the
state meaning and the shown parenthesized text are exact. Notes without
`Details:` retain their existing rendering.

## Skill paragraph

Place this single paragraph immediately after the existing idle bullet in
`skills/multi/SKILL.md`, without restating that bullet's existing next-turn
clause:

> A Codex peer sees nothing mid-turn. `codex queue` stores the row at once (`delivered: true`) and the Codex TUI starts it only when the current turn ends, however long that turn runs. Silence from a Codex peer after a delivered note means it is still in a turn. Re-asking queues a second turn behind the first; check the ledger for its ACK instead. `delivered to null` on a sender's receipt is the inbox path: no pane was resolved, so there is no handle to print.

## Acceptance boundary

Focused tests cover all three packet states in both renderers and the exact
skill paragraph location. The live proof uses recipients that can actually
read the sent note; the scout identified that a note addressed only to
`proof-1` cannot be read by `proof-2`, so its final recipient setup must be
corrected before live proof. No release or installed-hook behavior is claimed
by this contract.
