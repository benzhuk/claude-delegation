# Lane 51 lead ruling on the spec red-team (NEEDS_FIXES da0e0e1)

The red-team is docs/specs/fable-wave-51/redteam.md, a copy of the reviewer's report. The spec in the record's "## Spec" section is amended by every finding, B1 to B3, M1 to M6 and m1 to m5, using each finding's replacement text. Where this ruling and the record's spec disagree, this ruling wins.

Lead choices the red-team left to the lead:

1. The gate (M4) is the W1b upper bound: under 10.0 percent of the window's claude-fable-5-1 tokens means NO-BUILD. The 25 percent wake share is printed only as context.
2. The step 2 design, if built, is the trailing debounce from M5, not the leading-edge hold:
   - the first RESULT to a listed slug posts at once;
   - a RESULT arriving within N minutes of the last post to that slug is queued;
   - queued RESULTs are released together at last post + N.

   B1 (the decision sits in `deliverToInbox`, and note-send's not-delivered branch queues it), B2 (a held entry is not an attempt), B3 (no hold while the timer heartbeat is stale), M1 (cap 20, measured from outbox `createdAt`), M2 (RESULT only) and M6 (the cache_creation guard) all apply to it unchanged. N6's tests are restated for the debounce by the step 2 builder, with the same coverage: release at N, cap, absent file or no-wave byte for byte, stale heartbeat, not an attempt across 25 drains, and ASK/BLOCKED never queued.
3. The territory adds skills/multi/SKILL.md (one line: exit 3 reason held) and one note-send.test.mjs test, both only if step 2 is built.

Step 1 is W1 with m2's pinning and M6's per-turn cache_creation, plus W1b, W2 and W3. It is built now. Step 2 waits for the read and the gate.
