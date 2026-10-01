VERDICT: NEEDS_FIXES (1) 9ac14c3fbd12621066675ebfcee531a3d60a176d

# Lane40 recipe and scheduled-invocation text review (commit 9ac14c3)

Scope: the prepared text only. `recipe-only.patch` and `scheduled-only.patch` against the maintained base. This review does not approve installation, live delivery, or a proof run, and it does not change the scope ruling. Reviewed tree `git status --porcelain` = 0 entries; HEAD = 9ac14c3fbd12621066675ebfcee531a3d60a176d. Code paths (`scripts skills hooks agents codex templates`) have an empty diff against 80760b3. No live file, note, guard, setting, SSH, Notion or dotfile was written. The scratch apply copies are under `recipe-review/review-run-9ac14c3-8fb090ba/scratch/`, left for the lead's closeout.

## 1. Hash and applicability checks (measured)

| Item | sha256 | Match |
|---|---|---|
| committed `recipe-only.patch` | 39142bd9…c766 | = scratch `r2-recipe-only.patch`, = prep-r2 §1 |
| committed `scheduled-only.patch` | b7421a67…3663 | = scratch `r2-scheduled-invocation.patch`, = prep-r2 §1 |
| base SKILL.md (scratch) | f9924f92…6ec9 | = live chezmoi source, = `~/.claude/skills/triage/SKILL.md`, = `~/.agents/skills/triage/SKILL.md` |
| base README.md (scratch) | cd295aef…0430 | = live chezmoi source `docs/windows-knowledge-update/README.md` |

The worktree `.gitattributes` marks both patches `-text`, so they check out with CRLF preserved. The hashes above confirm the bytes are unchanged.

Each apply ran on fresh copies of the base using `patch --binary -p1`:
- recipe alone: clean. SKILL bb7511fa…be0 (= `r2-recipe-SKILL.md`). README unchanged.
- scheduled alone: clean. SKILL 23e69203…ce27, README e2fa120b…8e92 (= `r2-sched-*`).
- recipe, then scheduled: clean. SKILL **f1debc66cd033775aad67dcf78e6e242284888ad28c3843e5fff86807f4afbef**, README e2fa120b…8e92.
- scheduled, then recipe: clean (recipe hunk offset +2). The result is byte-identical to the line above (f1debc66…, e2fa120b…).
- `git apply --check` on the base passes for both patches.

**The combination is well-defined and order-independent.** The two patches edit disjoint regions: SKILL line 33 and step 2 at line 140.

## 2. Scheduled sentence (F11)
- The added line is byte-for-byte the F11 sentence in `spec-r1-adjudication.md:65`. It appears in both allowed locations: SKILL.md, after the "Do not auto-trigger" paragraph, and README.md, appended to the paragraph containing "No … unattended triage".
- **It resolves the automatic-invocation conflict.** The base restrictions are at SKILL:3 ("Never runs unprompted"), SKILL:27-31 ("runs only when Ben asks") and SKILL:38 ("Ben must still explicitly invoke"). The sentence defines a job run as Ben's explicit invocation and states itself as the exception. SKILL:169 ("Don't auto-schedule runs from inside this skill") is not contradicted, because scheduling lives outside the skill.
- "at most 60" equals the production `CAP = 60` (`scripts/knowledge-triage.mjs:23`). There is no cap change.
- **The hold is intact.** `rev4.md:25` and `install-authority.md:9` put publication of this amendment after acceptance, merge and the next release, and before scheduler registration. The prep report marks it "Not delivered". This review adds nothing that releases it.

## 3. Recipe text: preservation of existing contracts
- The text is the adjudication's item-3 wording verbatim, placed in step 2 before "Never rewrite or delete EXISTING…".
- **Existing contracts are preserved.** The lock script (SKILL:48-92), release (:105-121), exact-file `chezmoi add` publication with the allowlist and staged-set rules (:94-103), archive-never-delete (:150-152), and the "curated files grow" preservation rule (:145-147) are all unchanged. The new text explicitly says the lock, archive and exact-file publication steps stay unchanged.
- **Publication is not narrowed.** Bash is not restricted to moves and hashes, so Git/chezmoi publication keeps its original commands.
- The text does not claim that every shell prose write is refused, and it does not require a DIGEST write after a denial.
- **Denial handling holds.** "never retry the refused operation through another tool, command shape, shell or permission mode" agrees with the job prompt at `knowledge-triage.mjs:158`. Nowhere does it tell an agent to reroute a refusal.
- It adds no helper, scheduler, cap, flag or dependency seam. The patches touch only two text files, and the README sits under `docs/` (excluded by `.chezmoiignore`).

## 4. Nine-note preservation (metadata only; no note contents read)
- `live-proof/20260929-201431/10b-selected-dispositions.json` records: selected 60, archived 51, pending 9, `everySelectedExactlyOnePlace` true. The 9 pending rows have `inbox: true`.
- I hashed each current `_inbox/<name>`. For all **9 of 9**, the hash is a key in `after-gather-state.json` `notes`, its `sha` field equals it, and the record names that file. The prefixes match prep-r2 §3: 5c30c67d, bc28d2ea, 08ee64a1, 9502fd31, 8ca77d01, daf38194, acb57cb0, bba9b349, 5b044e6b. The current local inbox has 37 `.md` notes, as the adjudication states.
- Conclusion: no note has changed since R1 recorded it. The caveat in prep-r2 §3 and the adjudication receipt is accurate: this is equality with R1's gather/selection state, not an independent pre-run inventory.

## 5. Execution boundary (not a text defect)
- The candidate states the boundary correctly (prep-r2 §4; adjudication paragraph 1). The production CLI gathers, sorts by ageMs, and takes the oldest 60 (`knowledge-triage.mjs:214-225`). It accepts only `--manual` (`:425-430`). Remote ages and final eligibility are unknown, so no ordinary run can promise to select the nine, or only the nine.
- I do not endorse a broader capped run as authorized. That question is ASK skills-a-lane40-proof-scope-1 and is still pending. I do not recommend a flag, seam, state edit or inbox move.
- **Approving this text is not permission to replay the R1 payload.** The R1 refusal (`live-proof-r1-denial.md`: secret-guard PreToolUse on a 13,567-byte Bash append to `orca.md`) and the R1 FAIL stay as recorded. If a future authorized run re-triages the same notes, it writes that material fresh through the prescribed tool. If any guard refuses, the run stops and reports. It does not carry the denied command forward. That run needs its own scope and proof authorization.

## Findings

### F1 (Medium, blocks text approval): Claude-only tool names in a skill mirrored verbatim to Codex
**Evidence.** `~/.agents/skills/triage/SKILL.md` has sha256 f9924f92…, identical to the Claude copy. The mirror script `run_onchange_after_mirror-shared-skills.ps1.tmpl:14-15,48` copies `triage` unchanged. The skill itself says Codex sessions use this mirror (SKILL:16-19).

**Problem.** The new line "Use the Write or Edit tool…" names tools Codex does not have. For Codex, the only file-writing route left is `apply_patch`, sometimes issued as a shell command. The very next sentence tells it to keep knowledge text out of shell command strings. That can stall or confuse a manual Codex `/triage` on the designated writer host.

This conflicts with the goal card ("NOT: a host-specific primitive as the shared contract"; "work lost or stalled"). Sibling shared skills already use the host-neutral pattern "(or AGENTS.md for Codex sessions)" (learn/SKILL.md:55; triage SKILL:138).

The scheduled job itself is not affected: it runs `claude` (`knowledge-triage.mjs:22,130`), and Write and Edit are not in its `--disallowedTools` (`:132`).

**Fix.** Root amends the item-3 wording with one parenthetical, then re-pins the recipe patch.

Current lines 4-8 of the `recipe-only.patch` hunk (each ends CRLF):
```
+   - Use the Write or Edit tool to add or update topic, INDEX and DIGEST prose. Keep
+     knowledge text out of shell command strings and heredocs. The lock, archive and
+     exact-file publication steps remain unchanged. If any tool refuses a step, stop
+     that step and report the exact denial; never retry the refused operation through
+     another tool, command shape, shell or permission mode.
```
Replacement (each line ends CRLF). Also change the hunk header `@@ -135,6 +135,11 @@` to `@@ -135,6 +135,12 @@`:
```
+   - Use the Write or Edit tool (apply_patch in Codex sessions) to add or update
+     topic, INDEX and DIGEST prose. Keep knowledge text out of shell command strings
+     and heredocs. The lock, archive and exact-file publication steps remain
+     unchanged. If any tool refuses a step, stop that step and report the exact
+     denial; never retry the refused operation through another tool, command shape,
+     shell or permission mode.
```
**Predicted outcome.** The patch applies cleanly to base f9924f92 with `--binary`. It still combines with `scheduled-only.patch` in either order, since the regions stay disjoint and only the offset changes. Result hashes change, so re-pin the new recipe patch sha256 and the result SKILL sha256. Denial semantics, the preserved-contract sentence and the no-retry clause are unchanged. `scheduled-only.patch` needs no change.

## Non-blocking notes (not counted)
- **N1.** "stop that step" does not say what happens to the note whose topic write was refused. The safe reading is the one R1 followed: leave it in `_inbox/` as pending, and do not archive it as merged. The adjudication chose narrow text on purpose, so no change is required. If root wants it explicit, append "; leave that note in `_inbox/`". That adds no DIGEST write.
- **N2.** In README.md the F11 sentence says "this skill", but the README is not a skill. F11 mandates the one sentence for both locations, and the paragraph already names the triage/learn boundary, so the meaning is clear. Keep it as-is for F11 exactness.

## Approval boundary
Nothing here approves installation, live delivery, release, scheduler registration or a proof run. `scheduled-only.patch` is correct as prepared text and stays held until acceptance, merge and the next release. `recipe-only.patch` gets text approval only once F1 is applied and re-pinned; a delta check of that single hunk is enough. Proof scope is still with root and the peer.
