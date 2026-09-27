Verdict: SPEC CORRECTION NEEDED — the requested live proof cannot work as written because the note is addressed to `proof-1` but the second read filters for `proof-2`.

## Files and symbols
- `skills/multi/scripts/note-inbox.mjs` exists. `sources` omits the repo under `--no-repo` (212-225); `packetLocation` then returns `{ exists: false }` even when no repo was checked (330-336), and notes expose only `packetExists`/`packetPath` (256-262). The three-valued premise is valid but `packetChecked` is not yet present.
- Its missing-packet problem is already strict (`packetExists === false`, 265-269), but `formatInbox` uses a truthiness test and renders `null` as MISSING (344-375; especially 366).
- `hooks/multi-hook-core.mjs` exists. `summarise` at 46-63 has the same truthiness/MISSING behavior at 49; this is the single permitted source line area and the spec premise holds.
- `skills/multi/SKILL.md` exists. The idle bullet is 112-115, matching the requested insertion point directly after it.
- `hooks/multi-inbox.js` and `hooks/multi-codex-hook.mjs` are outside territory; the latter still supplies `--no-repo` on PostToolUse (162), supporting the regression case.

## Helpers to reuse
- `runNoteInbox`, `formatInbox`, fixture `line`, `mirror`, `repoLedger`, and `deps` in `skills/multi/scripts/note-inbox.test.mjs:27-48` support all packet-state cases without live infrastructure.
- `resultOf`/`noteOf` in `hooks/multi-hook-core.test.mjs:24-32` construct `summarise` inputs; current fixture already carries nullable packet fields.
- `addressedToMe` in `note-inbox.mjs`, policed by test 54-65, is the authoritative recipient filter for the proof concern.

## Tests that police this area
- `skills/multi/scripts/note-inbox.test.mjs:130-146` asserts existing `true` and missing `false` packet states plus MISSING rendering; extend it for unchecked `null`, `packetChecked: false`, and strict rendering.
- `hooks/multi-hook-core.test.mjs:79-87` asserts the false/MISSING `summarise` case; add true/null variants here.
- `skills/multi/scripts/note-inbox.test.mjs:54-65` enforces a reader only sees notes addressed to its own slug; it makes the stated proof-1 → proof-2 read impossible.

## Open questions for the spec
- Must the live proof address one note to both `inbox-truth-proof-1,inbox-truth-proof-2`, or send two separate notes (one per fresh slug)? As written, `proof-2` cannot read a note addressed only to `proof-1`.
- Is `packetChecked` required on notes with no `Details:` path too, or only on packet-bearing notes? The pinned wording specifies it for “such notes” but current output has no field.
