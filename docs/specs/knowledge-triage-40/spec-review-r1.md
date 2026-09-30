VERDICT: NEEDS_FIXES (11) 0a759de4f4971b70f15b90c946b13b5f354f61c5

# Lane40 rev4 spec red-team (Opus)

Reviewed commit: 0a759de4f4971b70f15b90c946b13b5f354f61c5. Inputs: docs/specs/knowledge-triage-40/{rev4.md, rev3.md, rev4-intake.md, territories.md, contracts.d.ts}. There are no scout-T*.md reports in this commit. Existing code checked read-only: scripts/install-janitor-timer.mjs, scripts/knowledge-counts.mjs, the live ~/.claude/skills/triage/SKILL.md text, and chezmoi source directory listings.

**Refusal:** `git -C ~/.local/share/chezmoi ls-files dot_claude/knowledge/_inbox` was denied by a permission prompt. I did not retry it and did not try another tool. As a result, finding F1 can say only that the files are in the chezmoi source working tree. I could not confirm whether git tracks them.

**Pre-build gate retained:** this commit holds no probe artifact and no scout report, so the mandatory nested-CLI scratch probe (rev4.md:25) is still an open gate. Nothing here counts as proof for it. No builder should start until the probe passes and the root has adjudicated F9.

**Judgment:** the contract is not yet enough to prevent duplicate triage or stalled notes. Two gaps are HIGH: cross-host and chezmoi-resurrected duplicates (F1), and a cap/order the job cannot enforce (F2). Lost notes: I found no path that destroys a note. The only exception is a partial import, covered in F6. Secret leakage: the boundaries are close but need the SSH argv and environment pinned (F7). Unauthorized installation: the policy is correct, but the mechanism is missing (F8).

---

## F1 HIGH: duplicates across hosts, and notes resurrected by chezmoi-managed inbox files

**Evidence:**
- The chezmoi source working tree holds inbox notes: `~/.local/share/chezmoi/dot_claude/knowledge/_inbox/2026-07-28-subagent-report-write-filename-blocklist.md` and `2026-08-17-notion-markdown-endpoints.md`. It also holds macOS `._*` AppleDouble companions. `.chezmoiignore` has no knowledge, inbox or archive rule (grep exit 1).
- If these files are tracked (unverified, see the refusal above), every host that runs `chezmoi apply` has them in its `_inbox`. That includes the Windows writer and the scheduled chezmoi updater the skill mentions (SKILL.md:42).
- rev4.md:35 deduplicates only by "identical host/name/bytes". The same bytes arriving from netcup, hetzner and mac produce three import names, so the note is triaged up to four times, counting the local copy.
- After an origin move, or a local archive by the skill, the next apply recreates the file:
  - Remotely, re-gather sees `alreadyPresent`. Reconcile then finds "source present, archive already matching". rev4.md:39 does not say whether that is success or conflict, so it loops daily.
  - Locally, nothing in the job stops the skill from triaging the recreated note again every run.

**Fix (replacement text for rev4.md:35, first sentence onward):**
> Import names begin with host slug and identify the exact source version deterministically (content hash plus safe-encoded original basename). Deduplication is by sha256 across all hosts: the staging metadata keeps a sha256 → first import index, and a remote note whose sha256 is already imported, pending or archived locally from any host is counted `alreadyPresent` and becomes origin-reconcilable when that first import is. Inbox notes whose basename exists under the chezmoi source `dot_claude/knowledge/_inbox/` (read-only listing) are chezmoi-managed: they are never imported, never moved on origin, never placed in the nested selection list (F2), and are reported per host as `managed` residue for Ben.

This also closes the local re-triage loop, because the job's explicit selection list (F2) leaves managed names out. Removing the two files from the chezmoi source falls outside this lane's territory, so add it as a line on the decision item for Ben.

**Predicted outcome:** a live run over three hosts with these files present imports zero copies of them, lists them as `managed` per host, and adds no duplicate DIGEST lines.

## F2 HIGH: the job cannot enforce the cap-60 oldest-first union selection

**Evidence:**
- rev4.md:35 says "the union's oldest-first selection uses original note age … cap60 across all hosts and local notes". But the selection is made by the skill, and SKILL.md:20-21 and :126 say "process the whole inbox … Process every note autonomously, oldest first".
- The skill does not define "oldest". Host-slug prefixes put all remote notes in lexical order after every locally dated `2026-…` note.
- scripts/knowledge-counts.mjs:81 `DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})…/` no longer matches `netcup-…` names. It falls back to mtime, which is the import time (knowledge-counts.mjs:104), so the Windows `oldest` and the pending age are falsified.
- The first live run puts roughly 82 local notes plus about 120 remote notes in one inbox. If the skill follows its own "whole inbox" text, it runs past 60 minutes, which triggers ATTENTION and a held lock. That is the stall this lane exists to remove.

**Fix (add to rev4.md:35 after the cap sentence):**
> The job computes the selection itself (original age = the original basename's date prefix, else `sourceMtimeMs` for imports; local notes by knowledge-counts' rule; tie-break by imported/local filename), and passes the exact ≤60 filenames to the nested prompt as the only notes to process. After the run, any note archived outside that list is recorded as `outOfSelection` in the receipt and makes the run status `attention`. Each imported file's mtime is set to `sourceMtimeMs` with `fs.utimesSync` so knowledge-counts' mtime fallback reports original age.

Add to the probe (F9): with a scratch store holding more notes than the list, prove the skill processes only the listed names.

**Predicted outcome:** the receipt shows notesIn ≤ 60 with no `outOfSelection`, and the Windows `oldest` stays at the true oldest date.

## F3 MEDIUM: per-note eligibility for reconciliation is undefined, and "HEAD moved" can be spoofed

**Evidence:**
- rev4.md:37 says eligibility comes "only after the skill's successful publication verification", but it names no per-note evidence.
- rev4.md:27 and rev3.md:24 check only that HEAD moved when DIGEST changed. If Ben or the chezmoi updater commits in the dotfiles repo during the 60-minute window, HEAD moves without the triage being published.
- A run whose publication fails (staged unrelated dotfiles, SKILL.md:99-101; or `--secrets error` refusing a topic that absorbed a remote note's credential) leaves notes archived locally. If the next run verifies, it is unclear whether those older archives become eligible.
- Nothing escalates a failed verification. Daily runs keep triaging new notes into unpublished local state: a silent stall.

**Fix (replace rev4.md:27's last two sentences):**
> Verification passes only if `git log <dotfilesBefore>..HEAD -- <source path of DIGEST.md>` is non-empty, HEAD equals the pushed remote-tracking ref, and the DIGEST.md at HEAD contains a line naming each imported note to be reconciled. A note is origin-eligible when its imported name appears in the DIGEST.md of a verified HEAD, in this run or any later verified run. DIGEST changed without such a commit, or any verification failure, writes ATTENTION and one BLOCKED to Ben (same route and recovery text as a held lock) and later runs skip until Ben clears it. No auto-recovery of a dirty dotfiles tree or stale lock.

Observation: the chezmoi source `_inbox` currently has no `_archive/` directory (listing above), so DIGEST.md may be added by the first publication. The `git log -- path` form handles a newly added file.

## F4 MEDIUM: lock check timing, skill deferral misread as success, and overlapping jobs

**Evidence:**
- rev4.md:21 and rev3.md:22 check `.curated-update.lock` once, before a gather that can take up to 3×60 s. The chezmoi updater (SKILL.md:42) or a manual `/triage` can take the lock in between.
- The skill then defers with "make no knowledge, source, index, or Git change" (SKILL.md:88-89) and probably exits 0. The job sees no DIGEST change and exit 0, which looks like a successful empty run. The held-lock escalation never counts it.
- MultipleInstancesPolicy IgnoreNew (install-janitor-timer.mjs:317) prevents only a scheduled overlap. A manual run started while the task is also running races on last-run.json, sessions.json and staging.

**Fix (append to rev4.md:21):**
> The job re-checks the lock immediately before spawning the nested call; a lock seen at either check is a held-lock skip. A nested run that exits 0 with no DIGEST change while any selected note is still pending is recorded `skipped: skill deferred` and counts toward the two-consecutive held-lock escalation. The job takes its own exclusive `fs.mkdirSync(~/.agents/knowledge-triage/run.lock)` with owner pid/start for its whole duration (the skill's own mkdir primitive); a second job exits 0 `job already running`; a lock whose pid is dead is reported as ATTENTION, never auto-cleared.

## F5 MEDIUM: remote command construction for gather and reconcile is unpinned

**Evidence:**
- rev4.md:39 requires hash-verify-then-move per note, and rev4.md:52 tests "names with spaces/metacharacters". But ssh joins its arguments into one remote shell string. A note name containing `'`, `$()` or a newline breaks the command or injects into it.
- The Mac login shell is zsh, not sh.
- Hashing differs by host: `sha256sum` on Linux, `shasum -a 256` on macOS.
- GNU and BSD `mv -n` differ in exit status.
- The archive month is unpinned. A retry that crosses a month boundary picks a different destination, so the "already matching archive" idempotency check misses.

**Fix (add to rev4.md:39):**
> Remote commands are constant strings run as `/bin/sh -c '<constant>'`; note names never appear in argv. Gather names are validated to exclude newline, `/` and NUL. Reconcile sends `<sha256> <YYYY-MM> <name>` lines on stdin, one per note. The constant script reads them with `while IFS= read -r line` and prints one status per line. For each line it hashes with `sha256sum` or else `shasum -a 256`, runs `mkdir -p`, checks that the destination is absent, runs `mv -n`, then confirms that the source is gone and the destination hash matches. `YYYY-MM` is the month directory of the note's local archive, so retries are deterministic. The status for source-present plus matching-destination is `resurrected`, not success; it is reported and never overwritten.

**Predicted outcome:** the fixture `it's $(x) a.md` is archived intact, and no remote-side shell expansion happens.

## F6 MEDIUM: tar and import validation have no pinned format or rules, and the import write is not crash-safe

**Evidence:**
- rev4.md:33 says "Validate extraction before writing" without saying how. With no new packages (rev4.md:46), the job either parses tar in Node or trusts Windows bsdtar to extract.
- GNU tar's default format uses `L` long-name entries for names over 100 characters.
- macOS bsdtar adds `._name` AppleDouble entries and pax `x` xattr headers unless COPYFILE_DISABLE=1 is set. `._*` files already reached the chezmoi source this way.
- A validator that rejects the whole stream on any non-`0` entry fails every Mac gather.
- Linux names can be invalid or dangerous on NTFS: `a:b.md` creates an alternate data stream, and `CON.md`, `*?<>|"\`, and trailing dots or spaces cause trouble.
- A case-only pair with identical bytes collides on NTFS. The second origin then shows `alreadyPresent` forever and is never archived: a stalled note.
- A `COPYFILE_EXCL` copy interrupted by a crash leaves a truncated file under the final name. Later gathers treat it as `alreadyPresent`, and the skill triages the truncated body.
- A note still being written on the remote can be gathered half-finished.

**Fix (replace rev4.md:33 sentences 3-4 and add to :35):**
> Remote tar runs with `COPYFILE_DISABLE=1 tar --format=pax -cf -` over `find . -maxdepth 1 -type f -name '*.md' ! -name '.*' -mmin +5`. That selects notes left untouched for at least 5 minutes. A Node ustar/pax reader validates the stream before any write. It accepts typeflag `0`/NUL entries and `x` headers, honoring only `path` and `mtime`. It skips and counts `._*` or dot entries. It rejects the whole host stream (status failed, named) on any absolute, `..`, `/`-containing, link, device or `g` entry, on any entry over 1 MiB, or on a stream over 64 MiB or 1000 entries. The imported basename is `<host>-<sha256 first 12>-<safe original>`: characters outside `[A-Za-z0-9._ -]` are percent-encoded, the name is truncated to 120 characters before `.md`, and reserved device stems get a `_` prefix. The import writes `.<imported>.tmp` in the inbox (a dotfile, ignored by the skill and by counts), then `fs.linkSync(tmp, final)`, then unlinks the tmp file. On EEXIST the existing file's sha256 must equal the staged sha, else the result is a named conflict. Staging is content-addressed: `gather/<host>/<sha256>.md` plus `<sha256>.json`.

The hash in the name removes collisions between different bytes. For same-bytes case pairs, the F1 sha index makes both origins reconcilable.

## F7 MEDIUM: SSH argv, environment, Mac alias and staging retention are unpinned (credential transport)

**Evidence:**
- rev4.md:31 says "existing SSH authentication … noninteractive connection policy" but pins no options.
- The user's ssh config for the Mac alias may set ForwardAgent, RemoteCommand, LocalCommand or SendEnv. Nothing prevents agent forwarding or environment export.
- An ssh child spawned with the job's environment can export any variable the config's SendEnv names.
- The Mac alias name and the detection of "no ssh alias" are unpinned, and the scout reports are absent.
- Staging keeps remote note bytes with no end date ("Retain staging", rev4.md:33). A remote note carrying a credential then persists on Windows indefinitely. `~/.agents/knowledge-triage` is not chezmoi-managed (`dot_agents/` holds only lean-rules.md), so it does not sync. Verified.

**Fix (patch for rev4.md:31, replacing the sentence "Use existing SSH authentication … tokens."):**
> Use existing SSH authentication without copying keys, env files, agent sockets or tokens. Every ssh call is `ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ForwardAgent=no -o ForwardX11=no -o ClearAllForwardings=yes -o PermitLocalCommand=no -o RemoteCommand=none -o RequestTTY=no <endpoint> <constant command>`, spawned with an environment allowlist (PATH, SystemRoot, USERPROFILE/HOME, TEMP/TMP, SSH_AUTH_SOCK where present) and nothing else. The Mac entry is the literal alias `<name from scout-T3>`, present only if `ssh -G <alias>` reports a `hostname` different from the alias; otherwise skipped `no ssh alias`. Staged note bytes are deleted after that note's origin reconciliation is confirmed; only the sha256/name/mtime metadata is kept.

## F8 MEDIUM: "install disabled, then enable" has no mechanism, and the first-run date is not mechanized

**Evidence:**
- On policy, rev4.md:15 settles the intake's internal tension correctly. Intake line 5 says the install waits for the tick; intake item 4 says "installed disabled and enabled only on Ben's tick". Rev4 makes even a disabled install wait for the tick, which matches the decision item ("The install on this desktop waits for your tick here"). Verified consistent.
- But the Windows XML hardcodes `<Enabled>true</Enabled>` (install-janitor-timer.mjs:319) and `<StartWhenAvailable>true` (:318).
- The installer's `--enable` flag runs `schtasks /Create … /XML … /F` (:795), which registers an enabled task.
- The daily StartBoundary is fixed at `2026-01-01T<HH>` (:282).
- So "install disabled, verify, then enable respecting the chosen first-run date" cannot be done with the existing installer. The Oct-4 option depends on someone remembering to enable the task later: a stall risk.

**Fix (append to rev4.md:15):**
> Mechanism: the per-job marker table gives knowledge-triage `<Enabled>false</Enabled>` in Settings (other jobs byte-identical) and a StartBoundary taken from `--first-run YYYY-MM-DD` (default today). After the tick, the installer's `--enable` registers the disabled task, `schtasks /query /tn knowledge-triage /v` is quoted, then `schtasks /Change /TN knowledge-triage /ENABLE` runs. If Ben picks "after Oct 4", `--first-run 2026-10-05`, so no later human step is needed. A test asserts the triage XML is disabled and the janitor/collect XML bytes are unchanged.

## F9 MEDIUM: probe acceptance is incomplete, and the isolation method conflicts with what the probe must prove

**Evidence:**
- rev4.md:25 requires proof of "user skill loading, active user guard hooks …" and also that "scratch substitutes a local test knowledge/source/remote".
- The skill hardcodes `$HOME\.claude\knowledge` for the store and lock (SKILL.md:51, :106). Pointing the store at scratch therefore needs a HOME/USERPROFILE override, and that same override changes where user settings, hooks and skills load from. The probe could then pass while guards are silently absent.
- The probe also does not cover:
  - the pinned model `claude-opus-5-5`, which must be reported in the output;
  - the cap/explicit-list adherence from F2;
  - the pre-tick authority framing. The live skill says it runs "only when Ben asks" (SKILL.md:26-27), and the scheduled-run sentence is withheld until the tick (rev4.md:15), so the manual proof's prompt must carry the intake authority.
- The probe is not in this commit, so the gate stays open.

**Fix (append to rev4.md:25):**
> The probe records its isolation method and proves the guards under it: if HOME/USERPROFILE/CLAUDE_CONFIG_DIR are redirected, the scratch config is a byte copy of the live settings.json, hooks and triage skill (never an amendment), and a deliberate secret-guard trigger in the probe is shown denied. It also proves `--model claude-opus-5-5` is the model reported, that with more inbox notes than the explicit list only listed notes are archived, and pins the prompt text stating Ben's authority (the intake quote) for the pre-tick manual proof. Builder start waits for this record.

## F10 LOW: the T0 contract is too loose for an independent test author, and a fake ssh on PATH fails on Windows

**Evidence:**
- contracts.d.ts:27 types the seam as `deps?: Record<string, unknown>`. T2 writes tests on its own (territories.md:5), so T1 and T2 will invent different seams.
- rev4.md:52 says "fake SSH on PATH". On Windows, Node's `spawn('ssh')` without a shell does not resolve `.cmd` shims, and spawning `.cmd`/`.bat` without `shell:true` throws EINVAL on current Node. A fake `ssh.cmd` therefore fails, or pushes the builder toward `shell:true`, which reopens F5.

**Fix (replace contracts.d.ts:26-27):**
```ts
  // Dependency injection is test-only; CLI never accepts arbitrary host endpoints.
  deps?: {
    sshCommand?: string[];      // argv prefix, default ['ssh']; tests: [process.execPath, '<fake-ssh.mjs>']
    claudeCommand?: string[];   // default ['claude']
    hostname?: () => string;
    endpoints?: Partial<Record<HostResult['host'], string | null>>; // tests only; null = no alias
    noteSend?: (text: string) => Promise<void>;
    dotfilesRepo?: string;
    chezmoiSourceInbox?: string;
  };
```
Change rev4.md:52 "fake SSH on PATH" to "fake SSH injected through deps.sshCommand (PATH on POSIX suites is optional)".

## F11 LOW: the skill-amendment sentence still carries rev3's cap of 40

**Evidence:** rev3.md:26 pins "…is Ben asking, for at most 40 notes per run." rev4.md:13 changes the cap to 60, and rev4.md:15 says "prepare the exact amendments" but never restates the sentence. The rev3 text therefore stands unchanged.

**Fix (add to rev4.md:15):**
> The prepared sentence is: "A run started by the knowledge-triage job installed under Ben's decision of <tick date> is Ben asking, for at most 60 notes per run, gathered from all hosts."

---

## Verified absences (first-class)

- **No note destruction path:** origin moves never delete (rev4.md:39), the skill archives and never deletes (SKILL.md:143-145, :158), and the job never commits or runs chezmoi (rev4.md:27). The one exception is the truncated partial import, closed by F6.
- **Host death:** mid-gather writes nothing before validation (F6 makes this atomic). Death after local archive but before origin move leaves local archive and staging, and reconcile retries without re-triage (rev4.md:39). The needed eligibility evidence is in F3. Death after a remote `mv` but before the reply is handled by "absent source … idempotent success".
- **No remote-to-remote transfer:** rev4.md:39 forbids it, and the gather is pull-to-Windows only.
- **Installation authority:** rev4 is stricter than intake item 4 and matches intake line 5 and the decision item. The review-route change (no `--via`) is recorded correctly (rev4.md:56).
- **Human chezmoi apply and unrelated staged dotfiles:** the job never touches them. The skill refuses when anything is already staged (SKILL.md:99-101). The residual risk is the silent stall, handled in F3, plus resurrection, handled in F1.
- **Observation, no finding:** scripts/install-janitor-timer.mjs is already 973 lines. The <800 limit in rev4.md:52 applies only to new files, so adding a third job grows a file already over the lean-rules guideline. The root may want to note this.
