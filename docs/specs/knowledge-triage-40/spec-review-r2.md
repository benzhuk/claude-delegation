VERDICT: NEEDS_FIXES (6) b488c7e5147528431fe26d544f53a4bf99034c76

# Lane40 rev4 delta spec red-team, round 2 (Opus)

Reviewed commit: b488c7e5147528431fe26d544f53a4bf99034c76. Directory: docs/specs/knowledge-triage-40.

Inputs read: rev4.md, spec-r1-adjudication.md, probe-r2-authority.md, install-authority.md, contracts.d.ts, spec-review-r1.md, probe-report.md, guard-followup.md, scout-T1/T2/T3.md, scout-ruling.md, territories.md, and the builder and tests briefs. rev3.md was used for provenance only.

I also read the live `~/.claude/skills/triage/SKILL.md` (not a secret; r1 read it too). I made no installer or SSH-config reads, ran no git in dotfiles, and ran no nested Claude, SSH or triage. There was no denial in this review.

Precedence used: rev4 body, then the adjudication corrections, then install-authority (rev4:11), then probe-r2-authority (rev4:13). Everything is judged as a contract. Nothing here is a claim about unrun code.

## Answer to the JUDGMENT

The spec does not support a safe bounded implementation yet, but it is close. Of the eleven r1 concerns, F4, F5, F8, F10 and the cap part of F11 are closed. F9 has moved to the pending probe gate.

Six contract gaps are left. Two of them would make the built job fail its first live runs even if every test is green:

- **F1:** publication verification is keyed on filenames that the live skill does not write into DIGEST.
- **F2:** the pax validator rule, read literally, rejects every real GNU tar or bsdtar stream.

The other four would leave notes stalled for good, or push T1 and T2 into incompatible seams:

- **F3:** reconciliation dead-ends
- **F4:** Mac/no-alias reasons
- **F5:** receipt fields
- **F6:** post-tick first-run order

Each needs only a few lines of spec. None of them re-opens owner authority.

---

## F1 HIGH: verification needs "the imported name" in DIGEST, but the skill writes a slug

**Evidence:**
- spec-r1-adjudication.md:19 says: "the committed DIGEST containing each canonical imported name eligible for reconciliation."
- The live skill's digest format is `YYYY-MM-DD · <note-slug> → <disposition>` (SKILL.md:147-149). A "note-slug" is not the filename.
- An Opus run that writes, say, `foo-bar` for `netcup-1a2b3c4d5e6f-2026-08-01-foo%20bar.md` never satisfies the name check.
- adjudication:21 then turns "any verification failure" into ATTENTION plus BLOCKED, and "subsequent runs skip while ATTENTION remains".

**Failure:** after the first live run, no remote note is ever reconciled. The job then stops for good until Ben clears ATTENTION. That is exactly the stall this lane exists to remove. The fake tests stay green, because the fake `claude` writes whatever format the test author chose.

**Replacement text** (append to adjudication F3, after line 19):
> The nested prompt pins, under this task's authority, that each selected note's DIGEST line uses the note's exact filename without `.md` as `<note-slug>`. Verification matches `· <filename-without-.md> →` literally in the committed DIGEST. A selected note that was archived but has no matching line stays pending reconciliation with the per-note reason `digest entry missing`. It is not an origin move and not by itself a run-level ATTENTION. ATTENTION is reserved for publication-level failures: DIGEST changed without a commit touching its source path, a remote ref mismatch, a secret-check failure or a push failure. probe-r2 must quote the exact DIGEST line written for its selected note.

**Predicted outcome:** a slug drift gives a named per-note residue, not a halted job. The probe shows whether the pinned slug holds before T1 writes the matcher.

## F2 HIGH: the pax rule rejects real tar output, and one oversized note stalls a whole host

**Evidence:**
- adjudication:33 says: "accepts regular type0/NUL plus per-file pax x records with path/mtime only".
- GNU tar with `--format=pax` writes `atime` and `ctime` keywords in per-file x headers by default. The well-known reproducible-tar recipe `--pax-option=delete=atime,delete=ctime` exists for exactly this reason.
- libarchive's full pax writer (macOS bsdtar) adds keywords such as `SCHILY.dev`, `SCHILY.ino`, `SCHILY.nlink` and `LIBARCHIVE.creationtime`, plus `hdrcharset` for non-UTF-8 names.
- GNU x-header entry names are `./PaxHeaders.<n>/<name>`, which contain `/`. A top-level-name check applied to the x entry itself rejects it.
- Also at adjudication:33, a single note over 1 MiB fails the whole host stream. That host then fails every day until someone edits the remote note.

**Failure:** every Netcup and Hetzner gather ends `failed`. Tests stay green, because the fixture tar a Node test writes will be minimal. Separately, one large note permanently stalls a host.

**Replacement text** (replace adjudication:33 from "Node validation accepts" through "No extraction before validation."):
> Node validation accepts regular type `0`/NUL entries and per-file pax `x` headers. The x header's own name is not validated as a note name. Record lengths are validated. The job honors `path` and `mtime` (fractional decimal allowed). It rejects the host stream on `linkpath`, on a `size` keyword that disagrees with the header, and on `g`, link, device, absolute, traversal or nested entries. Every other keyword is ignored, including `atime`, `ctime`, `SCHILY.*`, `LIBARCHIVE.*` and `hdrcharset`. Strip one leading `./`. Dot and `._*` entries are skipped and counted. A note over 1 MiB is skipped by advancing past its data blocks, and is named per host as residue `oversize`; it does not fail the host. The stream limits (64 MiB, 1000 entries) and malformed or truncated input fail the host by name. Fixtures include x headers carrying GNU atime/ctime and libarchive SCHILY/LIBARCHIVE keywords, and a GNU `PaxHeaders.N/` entry name. Nothing is extracted before validation.

**Predicted outcome:** real streams from both tar families parse, and oversize notes show up as named residue.

## F3 MEDIUM: some reconciliation outcomes never end, and eligibility is tied to this run's DIGEST change

**Evidence:**
- A note edited on its origin after gather goes through these steps:
  1. v1 is imported and archived, and v2 is imported separately (rev4:41).
  2. When v2 publishes, v2's reconcile moves the origin.
  3. v1's reconcile then finds the source absent and the destination either holding v2 bytes or missing (a different month). adjudication:29 says missing source "is success only with matching destination evidence", so v1 is unresolved.
  4. The same applies to an origin that Ben moved or deleted by hand.
- rev4:45 only defines retry for host death, and no end state exists for any of these. Each one stays in `pending` and is re-checked over SSH every day.
- adjudication:19 lets older archives reconcile "after a later successful verification". A run with no DIGEST change has no "commit touching DIGEST since dotfilesBefore". So the last imports before the inbox drains wait until some future triage happens to publish.

**Replacement text** (append to adjudication F5 after line 29):
> Per-note origin eligibility is: the local archive exists under the deterministic imported name, AND the committed DIGEST at HEAD contains its F1 line, AND HEAD equals a fresh remote ref read. This holds in any run, including one with no DIGEST change. Two outcomes are terminal. They are reported once in that host's row and in the receipt, with no further remote action, and staged bytes are kept: `superseded` (a later gathered version of the same host/name exists) and `origin missing` (source absent, no matching destination). Terminal items are excluded from `pending`.

**Simplification:** this removes the dotfilesBefore dependency from per-note eligibility. The run-level publication check (F1) still uses it.

## F4 MEDIUM: the Mac and no-alias reasons contradict each other, and the seam cannot tell them apart

**Evidence:**
- Three documents give Mac three different reasons:
  - rev4:37 says `no ssh alias`.
  - adjudication:41 says `alias discovery denied`, and "no ssh alias" only after a successful config read.
  - probe-r2-authority:11 says `awaiting owner-provided ssh alias`, forbids any discovery, and still requires tests of "actual no-alias versus unavailable/pending states".
- contracts.d.ts:33 offers only `string | null`. T1 and T2 must each invent how "pending" differs from "no alias", which is the r1 F10 failure class again.
- In production, with no discovery allowed, `no ssh alias` and `alias discovery denied` can never be reached.

**Patch (contracts.d.ts:33):**
```ts
    endpoints?: Partial<Record<HostResult['host'], string | null | 'pending'>>; // test-only; null = no ssh alias; 'pending' = awaiting owner-provided ssh alias
```

**Replacement text** (rev4:37, the sentence "No applicable alias yields named skip `no ssh alias`."):
> Production defaults are netcup and hetzner as fixed above, and mac = `'pending'`, which gives the skip reason `awaiting owner-provided ssh alias` with no SSH spawn and no config read. `null` gives `no ssh alias` and is only used by tests or by a future owner-recorded removal. `alias discovery denied` is retired. Ben's alias replaces `'pending'` by a code change that cites his authority.

## F5 MEDIUM: the receipt schema lacks the fields the adjudication requires, and T2 must assert them

**Evidence:**
- rev4:54 lists the schema1 fields, and contracts.d.ts:41 types the receipt as `Record<string, unknown>`.
- The adjudication adds observable outputs with no pinned name or place:
  - `outOfSelection` (adjudication:15)
  - the "union eligible count" (:15)
  - "Persist only verified publication identity" (:19)
  - skill-deferred counting (:25)
  - unresolved items and resurrected residue (:11, :29)
  - named oversize or newline residue (:33)
- tests-brief requires independent assertions on out-of-selection attention, the deferred lock and "token unavailable truth". Without names, T1 and T2 diverge.

**Replacement text** (append to rev4:54 after "...nestedExitCode}"):
> schema1 also carries:
> - `notesEligible` (union canonical eligible count, before the cap)
> - `selected` (the exact ≤60 filename list)
> - `outOfSelection` (filenames, empty array if none)
> - `deferredConsecutive` (integer)
> - `publication: {verified: boolean, reason: string|null, head: string|null, remoteRef: string|null, digestPath: string|null}`
> - `residue: {managed: string[], resurrected: string[], unresolved: {host, name, reason}[], oversize: string[], unsupportedName: string[]}`
>
> `tokens` is `{input, output, cacheRead, cacheCreation, total} | {unavailable: string}`.

Then add `unresolved: number` to `HostResult` (contracts.d.ts:10-12).

## F6 MEDIUM: after the tick, the first-run order is missing, and the skill text still says "never unprompted"

**Evidence:**
- rev4:11 reports the tick: install enabled after acceptance, merge and release, then the first run immediately.
- rev4:21 still carries the pre-tick sequence ("install disabled... respecting the chosen first-run date"). adjudication:47 gives register disabled, then query, then enable, but no trigger. There is no `schtasks /Run` step and no order relative to the text amendments.
- The live skill still says "Never runs unprompted" (SKILL.md:3), "This does not make triage automatic. Ben must still explicitly invoke" (SKILL.md:36), and "Don't auto-schedule runs" (SKILL.md:162).
- The prepared sentence (adjudication:61) is placed after :28 only (rev3 item 7). scout-T1 #4 already flagged the :36-37 contradiction, and no correction addresses it.
- An immediately triggered first run that goes ahead of, or without, the amendment gives the nested Opus a skill that tells it to refuse. A refusal looks like exit 0 with nothing processed, which becomes `skill deferred` and escalates.
- Also: Task Scheduler's own run limit must outlast the job's internal limits, which total 60 min nested plus up to 3×60 s gather and 3×60 s reconcile. Otherwise Task Scheduler, not the job's tree-kill watchdog, ends the run and leaves run.lock and a possibly orphaned nested process. I could not check the installer's current value (the source read was blocked in scouting), so the spec must pin it.

**Replacement text** (replace rev4:21 with):
> Post-tick sequence, after acceptance, merge and the next release:
> 1. Commit the prepared amendment through rev3 item 7's locked procedure, and verify it on the remote. The amendment covers the sentence after SKILL.md:28 and matching clauses at SKILL.md:36 and :162 ("...except runs started by the knowledge-triage job under Ben's decision of 2026-09-29"), plus the README sentence.
> 2. Register the triage task disabled, with its own `ExecutionTimeLimit` of PT2H in the per-job table (other jobs byte-identical), and quote `schtasks /query /tn knowledge-triage /v`.
> 3. Run `schtasks /Change /TN knowledge-triage /ENABLE`.
> 4. Run `schtasks /Run /TN knowledge-triage` and quote the resulting last-run.json.
>
> The nested prompt always states the authority. The scheduled prompt quotes the 2026-09-29 tick, and the manual proof quotes the intake. A second instance launched by StartWhenAvailable meets run.lock (`job already running`).

---

## Separate from spec approval: pending execution gates (not findings)

1. **probe-r2 (plain-file diagnostic):** no output at this SHA. This is an explicit gate and I am not claiming it passed. Whether its specified test is sufficient:
   - **Adequate for:** skill load, resolved model, the stripped env / no peer writes, capped selection (two notes, one listed), tokens, and hook-event evidence that the guards are loaded.
   - **Must add:** the exact DIGEST line for the selected note (F1). The design depends on this and the brief only says "digest disposition".
   - **Limitation 1, genuine but not fatal:** the probe cannot exercise publication permissions. `chezmoi add`, `git commit` and `git push` run under `--permission-mode auto --permission-prompts none`, and settings has no chezmoi allow rule (scout-T3:68). rev4:27 forbids relaxing a grant after a refusal. So a publication denial first shows up in the live proof. It needs an owner ruling there, and possibly a flag change and re-review. The live proof must be read as the publication probe, and the builder should keep the nested argv in one constant so that change stays cheap.
   - **Limitation 2:** the probe runs under a scratch HOME while production uses the real HOME. Hook evidence proves the guards load under the probe environment only; production hook paths that resolve through HOME are proven only by the live run.
2. **Real publication live proof (rev4:60):** still required. It runs from an interactive pane, never over SSH (scout-T3:83).
3. **Host gates:** Netcup and Hetzner reachability and the sealed second-host suite. Mac stays a placeholder until Ben's alias lands with its authority; there is no discovery workaround anywhere in the spec (verified, probe-r2-authority:11).
4. **Builder start** needs both this spec approval and probe-r2 PASS (rev4:9, builder-brief).

## Verified absences (first-class)

- **Credential transport:** closed. adjudication:39 pins the ssh argv (no forwarding, `RemoteCommand=none`, `PermitLocalCommand=no`) and an env allowlist. adjudication:29 carries note data on stdin with no names in argv. No remote-to-remote path (rev4:45). Staged bytes are removed after confirmed reconciliation (adjudication:43).
- **Overlap and deferral (r1 F4):** closed. The curated lock is checked twice and never taken. The job-local mkdir run.lock carries an owner token. A killed job leaving run.lock goes to ATTENTION. That is consistent: a kill mid-run usually leaves the skill's curated lock too, which already needs Ben's recovery.
- **Atomic NTFS import:** the temp-then-`linkSync` approach is feasible on the same volume, with an EEXIST hash check (adjudication:35). Non-blocking hardening: fsync the temp file before linking, so a power loss cannot leave a zero-length final file that shows up as a permanent conflict. Also, EEXIST on a sha already recorded in staging metadata should count as `alreadyPresent`, not a conflict, because the skill may have rewritten `status:`.
- **Cap and age truth (r1 F2):** closed. The explicit list, date-prefix-else-mtime rule, `utimes` and the out-of-selection snapshot are adequate.
- **Fresh remote identity:** strict HEAD == `ls-remote` fails safe. Another host pushing in the seconds between the skill's push and the check gives a false ATTENTION, never a false reconcile. I accept that risk. The read-only `chezmoi source-path` resolution needs a timeout, because a concurrent human `chezmoi apply` holds chezmoi's state lock.
- **Managed residue:** named, never silently dropped (adjudication:9). Matching is by basename, which is conservative. Map chezmoi source attribute prefixes (`private_`, `readonly_`, `dot_`) before comparing.
- **The 60-note amendment (r1 F11):** the cap wording is closed (adjudication:61). What remains is placement and ordering, in F6.
- **Machinery:** I found no new service, database or scheduler. The pax reader, content-addressed staging and run.lock are each justified by a concrete r1 failure. Recording local original hashes needs only the current run's pending set, not a historical local index, so keep it that small.
