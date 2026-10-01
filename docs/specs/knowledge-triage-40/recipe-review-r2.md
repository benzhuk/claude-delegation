VERDICT: APPROVE 6a46fdac30c58334d801eee915079969286e4566

# Lane40 recipe F1 delta review (9ac14c3..6a46fda)

Scope: this checks only F1 from `recipe-review-r1.md`. Everything else r1 approved (the scheduled sentence, preserved contracts, nine-note metadata, execution boundary) is not re-reviewed. The reviewed tree has 0 entries in `git status --porcelain`. HEAD is 6a46fdac30c58334d801eee915079969286e4566. The code paths (`scripts skills hooks agents codex templates`) have an empty diff against 9ac14c3. No production source changed.

Writes: none to live files, notes, guards, settings, Notion or the dotfiles repo. There was no SSH, no cleanup, no proof run and no replay of the R1 denied payload. Live files were only hashed, never written. All apply copies are under `recipe-review-r2/review-run-6a46fda-4d7c42ce/scratch/` and are left for the lead's closeout.

## Delta since 9ac14c3 (7 files, all under docs/specs/knowledge-triage-40/)
- `recipe-only.patch`: changed. See the section below.
- `scheduled-only.patch`: **no diff**. The sha256 at 9ac14c3 and at HEAD is the same, b7421a67bdfdc1a5201efa4e6293df0ddbb774cc5ac3ef75611634d9d3a53663. This also equals Scratch `r2-scheduled-invocation.patch`.
- New files: `recipe-f1-adjudication.md`, `recipe-recovery-prep-r3.md`, `recipe-review-r1.md` (+identity.json), `recipe-review-delta-brief.md`, `recipe-delivery-brief.md`. They are text only. The delivery brief is prepared but not executed. This review does not execute or approve it.

## F1 fix: byte-exact verification
- I rebuilt the patch mechanically. I took `recipe-only.patch` at 9ac14c3 (sha 39142bd9…c766, as r1 pinned it) and swapped the five `+` lines r1 quoted (CRLF) for the six replacement lines r1 gave (CRLF, including "(apply_patch in Codex sessions)"). I also changed the header `@@ -135,6 +135,11 @@` to `@@ -135,6 +135,12 @@`.
- The result is byte-identical to the committed HEAD `recipe-only.patch`: 983 = 983 bytes, and `===` returned true. Its sha256 is **123b1a2946e4af60330eab03f3a80166031e1dcc4c7e5eaa0404033ef800a2ab**. That equals Scratch `recipe-recovery/r3-recipe-only.patch` and the pin in prep-r3.
- The layout is 16 split segments: 12 CR-terminated content lines and LF headers, the same shape as earlier patches. `.gitattributes` gives `text: unset`, so the checked-out bytes are the committed bytes.
- The header count is right: 3 leading context lines, 6 added lines and 3 trailing context lines make 12.

## Base and applicability (fresh scratch copies, `patch --binary -p1`)
| Item | sha256 |
|---|---|
| base SKILL (Scratch base) | f9924f92…6ec9, the same in the live chezmoi source, `~/.claude/skills/triage/SKILL.md` and `~/.agents/skills/triage/SKILL.md` |
| base README (Scratch base) | cd295aef…0430, the same in the live chezmoi `docs/windows-knowledge-update/README.md` |

- recipe alone: clean. SKILL = **c60feb3be5fd5f6808bb490c5147c1e3e72be53d8ba64fa909f1ead2398d3b8a**. `cmp` shows it identical to `r3-recipe-SKILL.md` (the pinned r3 result). README unchanged (cd295aef…). The result is 168 lines, all CRLF, checked by byte count in Node.
- scheduled alone: clean. SKILL 23e69203…ce27, README e2fa120b…8e92. Both are unchanged from r1.
- recipe, then scheduled: clean. SKILL **20856eb943be85187dd32c0ef9314a33f154c76197ef119bc27fd944198283f1**, README e2fa120b…8e92.
- scheduled, then recipe: clean. The recipe hunk applies at offset +2 (line 137), with no fuzz and no `.rej`. The result is byte-identical to the previous check (`diff` shows no difference). The only side file is `patch`'s `.orig` backup in scratch.
- `git apply --check` on a fresh base copy exits 0 for both patches.
- All of this matches the prep-r3 table exactly.

The rendered bullet (SKILL:138-143) is r1's replacement text. The refusal semantics, the sentence that keeps the lock, archive and exact-file publication steps unchanged, and the no-retry clause are all unchanged. The Codex route is now named, so the shared mirror no longer names only Claude tools. **F1 is resolved.**

## Findings
None blocking (0).

## Non-blocking notes (not counted)
- **N1** (kept from r1): "stop that step" does not say what happens to the note whose write was refused. The safe reading is to leave it in `_inbox/`. No change is required.
- **N2** (kept from r1): the README's F11 sentence says "this skill". It stays as-is so the text matches F11 exactly.
- **N3** (new, outside this text's scope): `recipe-delivery-brief.md` lists `recipe-recovery-prep-r2.md` as an input. That file pins the superseded recipe result (bb7511fa…). The brief requires source/live to equal "the reviewed recipe-only candidate byte hash". A delivery agent that takes its pin from prep-r2 would halt on the mismatch. That failure is safe but causes a stall. Fix: before launch, root changes the input to `recipe-recovery-prep-r3.md`, or states the pins in the launch prompt: patch 123b1a29…a2ab, result c60feb3b…3b8a. Also, prep-r3's line "the file committed … still has the old sha 39142bd9" is now stale. Root has since committed the r3 bytes (verified above), so nothing needs to be done.

## Approval boundary
This approves the `recipe-only.patch` text at 6a46fda, sha 123b1a29…a2ab, result c60feb3b…3b8a, and nothing else. It does not approve delivery, installation, release, scheduler registration or a proof run. It does not change proof scope (ASK skills-a-lane40-proof-scope-1 stays with root). It does not permit replaying the R1 denied payload. `scheduled-only.patch` stays byte-unchanged and held until acceptance, merge and the next release.
