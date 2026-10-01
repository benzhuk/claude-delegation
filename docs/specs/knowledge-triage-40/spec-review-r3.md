VERDICT: NEEDS_FIXES (3) cbab6c07b7e4f57002c61c94af711fe9d623ae38

# Lane40 rev4 delta spec review, round 3 (Opus)

Reviewed SHA: cbab6c07b7e4f57002c61c94af711fe9d623ae38, directory docs/specs/knowledge-triage-40.

Inputs read: rev4.md, contracts.d.ts, spec-r1-adjudication.md, spec-review-r2.md, spec-r2-adjudication.md, probe-r2-authority.md, install-authority.md, lock-owner-scope.md, lock-owner-resume.md, lock-owner-r2-report.md, probe-r3-prep-report.md, builder-brief.md and tests-brief.md. There is no probe-r3-report.md at this SHA. I also read the live `~/.claude/skills/triage/SKILL.md`, which is not a secret, to judge the digest format and the "unprompted" clauses. I did not open lock-owner-brief.md or 63e71af.

What I did not do: no git commands, SSH, nested Claude, config or secret reads, or searches that were denied before. None of my calls were denied. One combined Bash call (rules file, git log and ls) was blocked by permissions, and I switched to the Read and Glob tools. That call was not a guard refusal, and I did not retry it.

Precedence used: rev4 body, then spec-r1-adjudication (the normative corrections), then the later rulings named in rev4:11-15.

## Answer to the JUDGMENT

Five of the six round-two corrections fully close their failure cases:
- r2 F2: pax and oversize.
- r2 F4: Mac pending versus no alias.
- r2 F6: amendment order, the PT2H limit and the one-sentence exception.
- r2 F1: the delimiter itself.
- r2 F5: the main receipt fields.

Three small gaps remain. Each fits in one sentence or a small type patch:
- **N1:** a new stall caused by the F3 correction's wording.
- **N2:** one F5 contract gap that makes T1 and T2 diverge.
- **N3:** the probe gate could pass without testing the F1 slug pin.

None of them re-opens owner authority, and none adds a mechanism. With these fixed, the contract can be implemented. The remaining execution gates below are explicit. They are sufficient once the one unrecorded dependency (G2) is given an owner.

---

## N1 MEDIUM: in a run with no DIGEST change, a routine remote-ref mismatch can halt the job for good

**Evidence:**
- spec-r1-adjudication.md:21 lets per-note eligibility be checked "with no new digest change or nested call". That check requires "HEAD matching a fresh remote ref".
- spec-r1-adjudication.md:23 lists "remote ref mismatch" as a publication-level failure. That means ATTENTION plus BLOCKED, and "Subsequent runs skip while ATTENTION remains".
- Nothing limits that list to runs that actually published.
- `RunReceipt.publication.verified` (contracts.d.ts:60-63) has no defined meaning for a run that did not publish.

**Failure case:**
1. Another machine pushes a dotfiles change, which is routine because `~/.claude` syncs across machines.
2. The Windows chezmoi updater has not yet pulled it.
3. The day's triage run has an empty or deferred inbox, so DIGEST does not change, but old imports are waiting to reconcile.
4. The job reads HEAD != ls-remote. A builder following :23 literally records ATTENTION.
5. Every later run skips until Ben clears it by hand.

This is the stall that r2 F3 was meant to remove, returning by another route. A fake test will not catch it unless the tests author happens to pick the same reading.

**Fix:** in spec-r1-adjudication.md:23, replace the first sentence ("Publication-level failure records ATTENTION ... or push failure.") with:

> Publication-level failure applies only to a run whose DIGEST changed: changed DIGEST without its source-path commit, a remote ref mismatch after that publication, secret-check failure or push failure records ATTENTION and one outer BLOCKED to Ben. In a run with no DIGEST change, a HEAD/remote-ref mismatch or failed remote-ref read sets `publication.verified=false` with that reason, makes no note eligible and moves no origin, and is not ATTENTION; the next run retries.

**Predicted outcome:** a sync window delays reconciliation by one run and never halts the job. A real failed publication still escalates exactly as before. The fail-safe direction (no false reconcile) is unchanged.

## N2 MEDIUM: the host row has no terminal count, residue entries have no host, and `tokens.total` is undefined

**Evidence:**
1. spec-r1-adjudication.md:33 says terminal `superseded` and `origin missing` outcomes are reported "once in the receipt's terminal list **and host row**". `HostResult` (contracts.d.ts:2-14) has no field for them.
   - T1 might fold them into `unresolved`, reuse `reason`, or drop them.
   - T2 must assert something.
   - This is the unnamed-field failure that r2 F5 was about.
2. `residue.managed`, `resurrected`, `oversize` and `unsupportedName` are `string[]` (contracts.d.ts:65-67), but the same basename can exist on netcup, hetzner and local.
   - Oversize and resurrected residue are by nature per host (adjudication:31, :37).
   - T1 might write `"big.md"` while T2 asserts `"netcup/big.md"`, or the reverse. Ben also cannot tell which host to fix.
3. `Tokens.total` (contracts.d.ts:43) has no formula. Claude stream-json `usage` gives input, output, cache-read and cache-creation counts, but no total. "input+output" and "all four" are both plausible readings, so T1 and T2 diverge.

**Fix (contracts.d.ts), ready to apply:**

Current (line 13):
```ts
  unresolved: number;
```
Replace with:
```ts
  unresolved: number;
  terminal: number; // superseded + origin missing first reported this run
```

Current (line 43):
```ts
  input: number; output: number; cacheRead: number; cacheCreation: number; total: number;
```
Replace with:
```ts
  input: number; output: number; cacheRead: number; cacheCreation: number; total: number; // total = input + output + cacheRead + cacheCreation
```

Current (lines 65-67):
```ts
    managed: string[]; resurrected: string[];
    unresolved: {host: HostResult['host']; name: string; reason: string}[];
    oversize: string[]; unsupportedName: string[];
```
Replace with:
```ts
    managed: {host: HostResult['host'] | 'local'; name: string}[];
    resurrected: {host: HostResult['host']; name: string}[];
    unresolved: {host: HostResult['host']; name: string; reason: string}[];
    oversize: {host: HostResult['host']; name: string}[];
    unsupportedName: {host: HostResult['host']; name: string}[];
```

**Predicted outcome:** T1 and T2 share one shape for every per-host item, which matches the existing `unresolved` and `terminal` entries. Nothing else changes. No new state is needed, because the host is already known wherever each residue is found.

## N3 MEDIUM: the probe gate can pass without exercising the F1 slug pin

**Evidence:**
- spec-r1-adjudication.md:19 pins the nested prompt: "each selected note's exact filename without `.md` as the skill's note-slug".
- The only proof it asks for is that the next diagnostic "must quote its exact digest line".
- probe-r3-prep-report.md:69 describes the R3 prompt as keeping "original lock/judgment/archive/digest semantics", which is the skill's unpinned `<note-slug>` (SKILL.md:149). It does not say to include the production slug instruction.

**Failure case:**
1. R3 runs without the pin. Opus writes a free-form slug, the line is quoted, and the probe is marked PASS.
2. The builder implements the literal matcher.
3. Under N1-corrected semantics, the live run archives imports whose lines never match.
4. Each import becomes permanent `digest entry missing` residue, because archived notes are never re-triaged (rev4:45). Their origins then stay in the remote inboxes for good.

The gate would have looked satisfied, while the one thing it existed to test went untested.

**Fix:** in spec-r1-adjudication.md:19, replace "The next authorized successful scratch diagnostic must quote its exact digest line." with:

> The next authorized scratch diagnostic prompt must carry this same slug instruction verbatim, and it passes this point only if its quoted DIGEST line matches the literal matcher for the selected filename. A mismatch is probe failure evidence, adjudicated before the builder starts.

**Predicted outcome:** a build prerequisite that is already scheduled now either proves or disproves the matcher, at no extra run cost.

---

## Closure of each r2 finding

- **r2 F1 (digest delimiter and missing line): closed, apart from N3.**
  - The literal `· <filename-without-.md> →` is anchored on both sides.
  - Import names carry the host plus a hash, so a stale or duplicate DIGEST line cannot match by accident.
  - A missing line gives per-note residue `digest entry missing` and no halt (adjudication:21-23).
- **r2 F2 (real pax metadata and oversize): closed.** adjudication:37 now:
  - ignores atime, ctime, SCHILY.*, LIBARCHIVE.* and hdrcharset;
  - exempts GNU `PaxHeaders.N/` container names from note-name validation;
  - keeps checksum and length checks;
  - rejects linkpath, a mismatched size, and `g` (global) headers;
  - skips notes over 1 MiB as named oversize residue while keeping the 64 MiB and 1000-entry host limits;
  - requires fixtures from both real tar families.

  `SCHILY.xattr.*` and `LIBARCHIVE.xattr.*` fall under the same ignore rule. With COPYFILE_DISABLE=1, macOS bsdtar output parses too. The fsync before the hard link is included.
- **r2 F3 (old imports and terminal outcomes): closed, apart from N1.**
  - Eligibility no longer depends on dotfilesBefore (adjudication:21), so a drained inbox still reconciles.
  - `superseded` is terminal as soon as a later version of the same host and name is known. This removes the v1/v2 ordering race: v1 never touches an origin that holds v2.
  - `origin missing` is terminal only when there is neither a source nor a matching destination.
  - Both keep their bytes, are excluded from pending, and are never counted as archived (adjudication:33). The outcomes are reported honestly.
- **r2 F4 (Mac pending versus no alias): closed.**
  - rev4:39, adjudication:45 and contracts.d.ts:34 agree: production Mac is `'pending'`, which gives `awaiting owner-provided ssh alias` with no spawn and no config read. `null` gives `no ssh alias`. `alias discovery denied` is retired. There is no discovery path anywhere.
  - Note: `string | 'pending'` collapses to `string` in TypeScript. That is harmless, because the sentinel is compared by value.
- **r2 F5 (RunReceipt and tokens): closed, apart from N2.** Every field I asked for is present:
  - notesEligible, selected, outOfSelection, deferredConsecutive
  - publication, residue, terminal
  - `unresolved` on HostResult
  - `Tokens` as `{...} | {unavailable}` with no invented zeros (rev4:56)
- **r2 F6 (order, PT2H and the exception sentence): closed.**
  - adjudication:51 orders the steps: amendment published and remote-verified, then register disabled, query, `/ENABLE`, `/Run`, and quote last-run.json.
  - PT2H applies to triage only, and the other jobs stay byte-identical.
  - The prompt carries the actual tick, and the job-local lock covers StartWhenAvailable.

  **Judgment on the single sentence (adjudication:65), as requested:** it is sufficient. The sentence is: "A run started by the knowledge-triage job … is Ben explicitly invoking this skill, as an exception to its general restrictions on automatic or unprompted invocation…". Here is how it meets each restriction in the live skill:
  - It literally satisfies SKILL.md:28 ("runs only when Ben asks") and :36 ("Ben must still explicitly invoke"), because it defines the scheduled run as Ben's explicit invocation.
  - It expressly excepts :3 ("Never runs unprompted") and :27 ("Do not auto-trigger").
  - SKILL.md:162 ("Don't auto-schedule runs from inside this skill") does not conflict, because the job schedules the run, not the skill.
  - The "at most 60 notes" clause covers the whole-inbox rule at :22.

  The extra paragraph edits I proposed in round two are not needed. I withdraw them.

## Separate from spec correctness: remaining execution gates (not findings)

**Build prerequisites (before any builder starts):**

1. **Delta spec approval,** after N1-N3 are applied.
2. **The R3 branch-skill plain-file diagnostic PASS.** probe-r3-report.md does not exist at this SHA, and the diagnostic has not run.
   - The prep report's own verdict is still "BLOCKED — PREPARATION ONLY". lock-owner-resume.md and lock-owner-r2-report.md later authorize launch using the branch at 727e60d (skill SHA256 967b3d…).
   - Its PASS must now include N3's matcher check.
   - Its label is honest. rev4:15 says it "proves candidate skill behavior, not live installation", and the prep report requires a namespaced skill, a realpath and hash chain, and an unchanged live skill. I found no claim anywhere that the rename or the amendment is live.
3. **Stale inputs in the briefs (root-owned, not spec):**
   - builder-brief.md:4 and tests-brief.md:4 name `probe-r2-report.md`. The deciding probe is now R3.
   - tests-brief.md:8 still says "pending/denied reasons", and `denied` is retired (adjudication:45).
   - tests-brief.md:8 does not list terminal outcomes, oversize residue, `digest entry missing`, PT2H, or N1's no-change mismatch.

   Refresh these when the builder and tests lanes are dispatched, so the tests do not assert a retired reason.

**Acceptance and live-install gates (after the build):**

- **G1: manual desktop live proof (rev4:62).** This is the first real test of Git and chezmoi publication under the nested flags.
  - The R3 probe disallows `Bash(git:*)` and `Bash(chezmoi:*)`, so publication permissions stay unproven until this run.
  - It runs from an interactive pane, never over SSH.
  - If a publication step is denied, it stops and needs a ruling. Keep the nested argv in one constant.
- **G2: concrete missing dependency — the lock-owner rename must reach the live skill before G1, and no authority for that step is recorded yet.**
  - rev4:15 requires "the corrected recipe to be available through the normal selected skill" and forbids silently applying the dotfiles tree.
  - lock-owner-r2-report.md:3 confirms "No live apply or push" of 727e60d.
  - The live SKILL.md:52-54 still uses the legacy token-named variables that made this lane's diagnostic BLOCKED (spec-r2-adjudication:16).
  - So until 727e60d is merged, pushed and applied to that one file under an explicitly recorded authority, the manual proof and every scheduled run would go through the old recipe. That makes G1 impossible to pass honestly.
  - The sequence should be recorded as: rename published live under its own authority → G1 → acceptance.
  - It also makes the adjudication:51 amendment depend on the renamed file. Both edits touch SKILL.md, and the amendment must be built on the renamed bytes, not on the current live file.
  - This belongs to the separate dotfiles work and is not a Lane40 spec edit, but it needs a named owner.
- **G3: host gates.** Netcup and Hetzner must be reachable, and the sealed second-host suite must pass. Mac stays `'pending'` until Ben's alias is recorded with its authority.
- **G4: post-release install sequence (adjudication:51).** Amendment, register disabled, query, enable, Run, then quote last-run.json. This happens only after acceptance, merge and release, citing install-authority's tick.

## Verified absences (first-class)

- **No new mechanism.** None of the corrections adds a service, database, scheduler or lock. The terminal outcomes and the eligibility check reuse the existing staging metadata.
- **No relaxed guard.** I found no text that adds `--allowedTools`, changes the permission mode, copies config, or points to an alternate reader. The two denied searches stay denied (rev4:13).
- **No discovery.** No text reads SSH config or discovers an alias. The Mac skip spawns nothing.
- **No overclaim.** The candidate-skill probe, the plain-file probe and the fake tests are each labeled as not being live proof (rev4:13, :15; probe-r2-authority:7).
