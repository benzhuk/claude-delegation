# Lane40 rev4: one daily knowledge triage session

Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-29T19:15:53Z
Lead-session: 01a0df4c-2809-7520-b1d7-876cc51a87ee
Base: e142f9a0490ec58bad62bd1ecc4e87a606b5308e
Authority: rev4-intake.md, skills-fable-lane-40-1. Ben's quoted comment authorizes the build now. This document supersedes only the rev3 clauses expressly changed below; rev3.md is retained unchanged as provenance.

Revision after Opus red-team: spec-review-r1.md reviewed0a759de with NEEDS_FIXES. The normative corrections in spec-r1-adjudication.md below this document's contract take precedence where they replace a clause. This remains a draft pending probe resolution and a fresh Opus delta approval; no builder may start.

Later authority: install-authority.md records skills-fable-lane-40-2 and Ben's September29 17:11 America/New_York tick. The installation wait below is satisfied by that reported decision. Install on the next release after acceptance/merge, enabled, then trigger the first run immediately rather than waiting for its daily clock slot. Cite the tick in the release item. Do not request it again. Existing probe/review/merge gates are not waived.

Latest probe/gather ruling: probe-r2-authority.md (skills-fable-lane-40-3) replaces scratch Git publication with plain-file before/after digest manifests, no Git and no allowlist. Nested behavior is tested in scratch; real publication remains the later live gate. Mac is a named placeholder pending Ben's alias, and both denied searches remain stopped. These specific later rulings override the earlier probe and alias-discovery clauses below and in spec-r1-adjudication.md.

## Outcome and boundaries

One Windows writer job gathers pending notes from the fixed hosts, invokes the existing triage skill once on the union, and reconciles successfully archived imported notes back to their origins. It feeds the existing store and publisher. Measure moved: work lost/stalled, measured by before/after pending, arrivals, per-host gather/archive counts, DIGEST entries and run tokens. No claim that overall DONE or comparative cost improvement is established by one run.

Nested judgment uses high tier Claude Opus, pinned to `claude-opus-5-5` by the intake, cap 60 oldest notes and 60 minutes. No model fallback or silent cap increase. A Codex runner is explicitly unsupported until tested. The lead remains Codex.

The tick is recorded in install-authority.md. After acceptance, merge and the next release, publish and verify the one-sentence skill/README amendment first, register disabled with PT2H scheduler limit, query/verify, enable, then trigger the first run immediately. The manual live proof has separate intake authority and precedes acceptance. No install or live amendment during blocked preparation. See corrected F8/F11 in spec-r1-adjudication.md for the exact order and sentence.

## Rev3 retained contracts

Retain writer-name parsing from the live skill, nonwriter refusal on install and nonwriter no-op on run; missing writer paragraph is an ATTENTION error. Preserve the two existing timer jobs byte-for-byte. Use a three-entry marker table so removing triage touches only triage files. Windows interactive-token scheduling only, no other host install.

The job checks but never takes or clears `.curated-update.lock`. The triage skill owns that lock through curated publication and remote verification. Two consecutive held-lock skips or timeout produce ATTENTION and one BLOCKED to Ben through note-send, including rev3's exact manual recovery commands. Kill switches, missing CLI/skill, ATTENTION and nonwriter are recorded skips. A nested nonzero exit is recorded as failure, not success. Guard/permission denial stops the affected step and is reported; no alternate tool, shell, permission-mode change or relaxed grant bypasses a refusal.

Keep user-level permission rules, secret and identity guards enabled. Unset ANTHROPIC_API_KEY, caller peer/session identities and pane handles; no caller credentials travel over SSH. Preserve authenticated plan use. Explicit nested session UUID is added to sessions.json before spawn. The read-count exclusion uses this list. No recursion, no nested peer identity/ledger mutations. Only the outer job may emit the explicitly required BLOCKED to Ben.

The mandatory scratch probe pins exact CLI argv/environment before implementation begins. It must prove user skill loading, active user guard hooks, no notes/panes/inbox registration, one complete scratch triage/publication with no denial, and plan/token reporting. Scratch substitutes a local test knowledge/source/remote only; never amend live settings or guards to make the probe pass. Probe failure is evidence and blocks implementation of the unproven nested call.

Skill publication stays unchanged: exact curated allowlist, `chezmoi add --secrets error`, staged-set preservation, one commit/push, remote/hash verification under its lock. The job may read git HEAD but never commits, pushes or runs chezmoi. If DIGEST changed without HEAD movement, record failed verification. No auto-recovery of a dirty dotfiles tree or stale lock.

## Gather and reconcile

Fixed script-local endpoints: netcup=`ben@100.69.249.18`, hetzner=`ben@100.111.119.54`, mac=`pending` until Ben supplies an alias. This sentinel yields `awaiting owner-provided ssh alias`, no SSH spawn or config read. Null means `no ssh alias` only in tests or after an owner-recorded removal. No alias discovery or invention. Use existing SSH authentication without copying keys, env files, agent sockets or tokens. Each host has a60second timeout and the pinned noninteractive policy; unavailable/asleep hosts yield named skips while a successful local run may exit0.

Each gather pulls only top-level non-dot `.md` regular files under `~/.claude/knowledge/_inbox` in one SSH tar stream per host. No recursion into `_archive`, no symlink targets, absolute paths, traversal, hardlinks, special entries or configuration. Validate extraction before writing. Stage under `~/.agents/knowledge-triage/gather/<host>/`. Preserve source basename, original bytes/hash and ordering timestamp in minimal stage metadata. Retain staging for interrupted-run reconciliation, not a second knowledge database.

Import names begin with host slug and identify the exact source version deterministically (content hash plus original basename or safe encoding). Exclusive create prevents clobbering a local note or duplicate concurrent import. Identical host/name/bytes gathered twice produce one imported note. If the source filename is reused with changed bytes, preserve the new version separately. The union's oldest-first selection uses original note age, deterministic tie-breaks, cap60 across all hosts and local notes, not per host. Existing local notes keep their names and contents.

Pending or already archived local imports prevent re-triage on re-gather. A source whose import has been archived locally is eligible for origin reconciliation only after the skill's successful publication verification. Archive discovery accounts for the skill updating the note's `status:` frontmatter; use retained original staged bytes/hash to identify the fetched version and deterministic imported filename to identify its local disposition. Do not compare the mutated archive bytes to the original hash as if they must match.

Move each eligible original to that host's `_inbox/_archive/YYYY-MM/<original-name>` after `mkdir -p`. Never delete, overwrite or move a different byte version. Confirm the live origin still matches the gathered original before moving; absent source/already matching archive is idempotent success, changed origin or conflicting archive is a named unresolved item, never overwrite. Remote post-run reconciliation commands touch only the original inbox note and its archive destination. A host dying after triage leaves the local archive and staging intact, records reconciliation pending, and next run retries the move without triaging the same version again. Keep remote archives readable and local per-note provenance auditable. Do not send any knowledge, keys or config from one remote host to another.

## Pinned module interfaces (T0)

Single implementation territory owns both modules; independent tests consume the exported contract.
`gatherKnowledge(options)` resolves `{hosts, imports}`. Each host row: `{host, status, reason, fetched, imported, alreadyPresent, archived, pending}`; status is gathered/skipped/failed and reason is string or null. Each import identifies host, originalName, importedName, sha256, stagedPath, sourceMtimeMs. Options carry local home/state/inbox paths, current time and injected spawn/SSH config seams for deterministic tests; production defaults always use the fixed endpoints.
`reconcileKnowledge(options, gathered)` resolves updated host rows after verified local archive/publication. It is not called on timeout, denied, failed or unverifiable nested run.
`runKnowledgeTriage(options)` resolves a run receipt and exitCode, writes last-run.json atomically, and CLI sets that code. Exported functions have no import-time side effects. Dependencies are Node builtins/existing repo helpers; no new packages.

last-run.json schema1 is the exact RunReceipt interface in contracts.d.ts: core timestamps/status/session/model/cap/timing/counts, notesEligible, selected, outOfSelection, deferredConsecutive, publication identity, residue and terminal outcome lists. Tokens are `{input, output, cacheRead, cacheCreation, total}` or `{unavailable: reason}`; never invent zero for absent usage. No credential or full nested transcript content in the receipt. `notesArrived` follows rev3's newer-than-previous-end definition; gathered notes retain original timing and counts are separately labeled so imports are not silently treated as new captures. Status success/skipped/failed/attention; incomplete origin reconciliation is visible in hosts/pending/unresolved. Terminal superseded/origin-missing outcomes are reported once, retain staged bytes and are excluded from pending.

## Gates and live proof

Independent tests use fake SSH on PATH serving fixture trees: one unreachable named skip, no Mac alias, second gather/triage processes a note once, archive move leaves readable bytes, origin mutation/conflict preserved, interruption retry, names with spaces/metacharacters and hostile tar entries. Test user env hygiene without real credentials. Run all functional child tests with deterministic parent clocks, except explicit real-clock timeout proof which asserts the spawned grandchild dies. Preserve installer byte-stability/removal, counts exclusion, writer/lock/ATTENTION/skip and publication verification tests from rev3. File length <800 lines for new source/tests.

One manual desktop proof after focused gates and review: original before counts for local and each reachable remote, fixed cap60, one real Opus run, actual tokens/session, per-note DIGEST entries, one dotfiles HEAD movement, per-host remote archive counts, after counts, exclusion of nested read events. Capture skip reasons truthfully. Do not substitute fake proof for the live run or retry a denied step. A failure remains evidence and is adjudicated before any further live run.

Opus spec red-team before builder start, then Opus source review after focused green, through existing review-run. At pickup its implementation directly runs Claude and has no --via option; omit that unsupported flag and record this equivalent route rather than changing lane53 territory. ASK skills-fable only for nonzero review-run exits. NEEDS_FIXES with exit0 is handled by the owned builder/review loop. Attack priorities: host death, duplicates, collisions, credential transport, lock race and human chezmoi apply.

Sealed Windows and second-host suites, one suite per machine with existing locks. Root accepts exact reviewed artifact with evidence, merges under standing grant with history bullet in merge commit, normal publish, close and one RESULT quoting live counts/tokens. If installation is still unticked, report the built/proven artifact and retain an explicit installation-pending boundary rather than claiming the daily task is installed.

Prediction: while at least60 eligible notes remain, each successful run archives at least30, names any residue, and adds dated DIGEST lines. By October12, reads in7days excluding job sessions reach at least3 from the pre-run count. First live run confounds Lane18's Oct4 prediction; record before values and this confound without changing that checker.
