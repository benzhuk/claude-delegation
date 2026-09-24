VERDICT: APPROVE — generated packet Details repair at the exact hashes below.

Independent Astra review, September 23, 2026 (America/New_York). Reviewed the two-file dirty diff and surrounding sender/validation/write/inbox paths. No source edit, live message, real ledger mutation, provider call, installed change or full suite.

SHA-256:
- skills/multi/scripts/note-send.mjs: 47574A8871EC243EA29D5671817263703771B4F9F73DC6779F257C9C5F80267A
- skills/multi/scripts/note-send.test.mjs: 0633BDF6B5232272C104E3C70A78868771CCB1467960FE71CEBFC2975CC3B0F1

No required fixes.

The root cause is corrected at the actual boundary: once the final ID is known, --packet-file without an explicit --details adds docs/notes/<resolved-id>.md to the envelope. The packet target and generated Details therefore derive from the same ID. A caller's explicit Details remains unchanged, including the supported case where it intentionally points to a different artifact. Dry-run constructs the same pointer without writing it.

buildEnvelope still runs before read/write of this packet and before appendLine to this note's ledgers. Thus generated Details participates in path and total-envelope-length validation instead of being tacked onto an already-recorded line. Packet creation still precedes ledger append; existing overwrite refusal and --force behavior are unchanged.

Meaningful checks performed

1. Ran the two new packet-file regression tests directly: 2/2 pass. The first uses actual runNoteSend to write a fixture packet and ledger, parses the envelope, then uses actual runNoteInbox to read the fixture ledger and resolve the packet. It asserts matching Details, matching writer/reader packetPath and packetExists=true. This is the sender -> persisted fixture ledger -> inbox path, not an expected-vector toy. Orca/transport endpoints remain mocks; no real message was sent.
2. Independent filesystem-spy checks: overlong envelope and invalid explicit ../outside Details both reject with zero filesystem mutations. No packet or ledger is created.
3. Independently found the new length boundary: a 604-character body yields a 663-character envelope without packet Details; adding the generated Details produces 701 characters and rejects against the 700-character cap. The dry-run boundary check recorded zero writes. This establishes that the added pointer cannot bypass the existing cap.
4. Scoped git diff --check: pass.

The builder reports its sealed focused suite passed 114/114; that full focused count is attributed, not independently rerun here.

Limits

This repairs future packet-file envelopes; it cannot retrofit a missing Details field in an already-written historical line. The lead reports a separate quiet FYI pointer repair for that event. No extra automatic wake or retry is introduced by this patch.

Validation-order claims above concern this note's packet and ledger writes. The sender's pre-existing optional piggyback drain of other queued notes is unchanged and is not a new all-process transactional guarantee.

