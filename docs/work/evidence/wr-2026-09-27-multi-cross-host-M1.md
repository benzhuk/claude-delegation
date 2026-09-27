VERDICT: APPROVE 8ab8e6cb5f5ac1eedb7b27c2b72ffe0766f94c36

# M1 round 3 re-review: artifact 8ab8e6c

**Scope.** This review covers the diff a7b2242..8ab8e6c in four files: SKILL.md, envelope.md, note-send.mjs and note-send.test.mjs. I checked:
- R2-1 and R2-2
- the thrown-message clause added in this round
- that the JSON hint is still byte-exact
- the R2-2 mutation, rerun against this artifact

**How I ran it.** I made no changes to the worktree. I ran every check on a `git archive` copy of 8ab8e6c in the session scratchpad, then restored it and confirmed the restore with cmp. `git status` in the worktree is clean apart from this report.

**Gate.** I ran `node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/note-flush.test.mjs`: 315 tests, 315 pass, 0 fail.

## C4 fields

Cause: The round-2 docs said `--dry-run` never refuses, which contradicted the F5 code. Separately, the only test guarding the "same-host registration" case used a record with no `host` stamp. A mutation that treats every stamped record as foreign therefore survived. That mutation would refuse every real registered peer.
Discriminating check: I mutated note-send.mjs:514 to `(!localInboxRec.host)`. The suite now reports 1 failure: "Defect 1: a registered inbox stamped with THIS host (as every real registration is) still exempts --to". In round 2 the same mutation failed nothing.
Fix location: skills/multi/SKILL.md:438-440, skills/multi/references/envelope.md:186-187, skills/multi/scripts/note-send.test.mjs:1282-1293 (the new test) and :1271 (the renamed title), skills/multi/scripts/note-send.mjs:532-534 (message text only).
Simplification: The fix is docs, one test and one message clause. No logic changed. Across a7b2242..8ab8e6c the code change in note-send.mjs is limited to the thrown message string.

## Verification

| Item | Status | Evidence |
|---|---|---|
| R2-1 | FIXED | SKILL.md:438-440 and envelope.md:186-187 now carry my patch text verbatim. Both match what the code does. A quiet or `--no-type` dry-run refuses with exit 6; the test "Defect 1: --dry-run on the quiet path reports the exit-6 refusal too" covers this, and my round-2 probe on `--no-type --dry-run` agrees. A typed dry-run in the refusal set exits 1 (round-2 probe). note-send.mjs has no dry-run logic change since a7b2242, so those probes still hold. |
| R2-2 | FIXED | I added the new test with a record stamped `host: os.hostname()`. Rerunning the mutation described above now fails exactly that test. The old test was renamed to "(no host field)", so its title now matches what it covers. |
| Thrown-message clause | PRESENT | At note-send.mjs:532-533 the message now includes "(--sender-host naming the machine you are running on now has no effect)". A probe of a refused FYI shows the clause in `err.message`. |
| JSON hint byte-exact | YES | A probe read the pinned `hint` from spec.md with a regex and compared it to the hint in the thrown error: `true` for `"run note-send on the recipient's machine over ssh, or pass --sender-host <this host>"`. The diff also shows the hint line as unchanged context. |

## Regression hunt

I found no regressions.
- The only production change is the message string. The predicate, Case A, Case B and failureJson are byte-identical to a7b2242, so every round-2 behaviour check carries over unchanged.
- The new test only reads fixture homes. It uses the `os` import already at note-send.test.mjs:6.

No findings.
