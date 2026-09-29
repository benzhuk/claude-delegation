VERDICT: BLOCKED — the survey of scripts/install-janitor-timer.mjs itself was refused by a guard; everything else in T1 is surveyed (below).

## Refusal (stopped, not worked around)
- Bash `grep -n -E "...|process\.argv|exit\(" scripts/install-janitor-timer.mjs` was denied by secret-guard.sh PreToolUse: "command dumps the process environment". I did not retry that file with any other tool. The installer's internals below come from its TEST file only (a different input) and are marked UNVERIFIED where the source is needed.

## Reusable (scripts/knowledge-counts.mjs, 182 lines; scripts/knowledge-count.mjs, 117)
- knowledge-counts.mjs:21-34 storeDir/inboxDir/readLogPath(home): every path derives from an injected `home`; tests need no env switch.
- :90-111 inboxDates: skips dotfiles (:95) and `_archive` (:96), non-files (:98); date from `^\d{4}-\d{2}-\d{2}` prefix (:81), else mtime (:105).
- :135-152 countReadsInWindow: the ONLY read-log parser; timestamp = first space token (:146). Session exclusion (rev3 item 6) belongs here, so knowledge-count.mjs `--since` (count.mjs:52-55) and the goal-card notice both inherit it.
- hooks/knowledge-log.mjs:22-26 fixes the line format: `<ISO UTC> <tool> <path> <session id|unknown>`. Session id = LAST space token, but the path is not quoted and can contain spaces: take the last token, never split(" ")[3].
- Read log counts Write/Edit lines too (knowledge-log.mjs:16-18), so the triage job's topic edits and INDEX reads all count as "reads"; the exclusion is needed, and must cover Write.
- knowledge-count.mjs:75-82 main(argv, {homeDir, now, write}) is injectable; :55-65 buildReport is pure. goal-card.mjs:378-396 already honours env.KNOWLEDGE_HOME/AGENTS_HOME for scratch homes.
- Tests: knowledge-counts.test.mjs:12-34 tmpHome/mkStore/writeLog fixtures are directly reusable for the exclusion test (file is 164 lines, room to add).
- Installer tests (UNVERIFIED for source): main(argv, {home, platform, execPath, pluginRoot, exec, stdout}) all injectable (install-janitor-timer.test.mjs:549-560); `exec` fake proves nothing shells out (:462, :549); helpers fixturePluginRoot :54-62 (needs a stub `scripts/knowledge-triage.mjs` added beside janitor.mjs/collect-status.mjs stubs), fixtureDefaultRepoGit :69, mkTmp :36, capture :42.
- review-run.mjs (skills/team-build/scripts) exports buildChildEnv :275 (env denylist + DELEGATION_REVIEW_RUN=1 + AGENTS_HOME/KNOWLEDGE_DIR redirect), stripGitLocatingEnv :295, isProcessAlive :363, sweepStaleRuns :378. runChild :710 (tree kill via `taskkill.exe /PID n /T /F` :809, process group on POSIX :715 `detached`) is NOT exported and review-run.mjs deliberately inlines rather than imports other scripts (comment at m5); reuse = copy pattern, not import.

## Inaccurate or stale premises
1. rev4-intake.md:11 says review-run `--via claude`; review-run.mjs:15 has no --via (options: --sha --brief --report --repo --model --timeout-min --claude-bin --plugin-root, :115-133). It only runs a `review-run-reviewer` agent (:206-269), not a triage.
2. rev4 model `claude-opus-5-5` vs docs/model-tiers.md:58 `claude-opus-5`. Live record: review-run alias `--model opus` resolved to "claude-opus-5-5" (docs/specs/review-run-53/winprobe-live.md sidecar). Pin the alias `opus` and record resolvedModel, or state the id and cite the probe.
3. rev3 "74 notes" is stale: the local _inbox holds 82 top-level .md (matches goal-card 82); no dotfiles present, so rev3's `.distill-*.lock` case has no live instance.
4. rev3 item 7 "after :28": triage SKILL.md:27-31 is the paragraph; but SKILL.md:35-38 (Designated writer boundary) also says "Ben must still explicitly invoke this skill" and :162 "Don't auto-schedule". A one-sentence amendment after :31 leaves :36-37 contradicting it. Count of sentences to amend: at least two.
5. Host-slug PREFIX (rev4 item 2) defeats date sorting: knowledge-counts.mjs:81 needs the date first, and the skill's "oldest first" (SKILL.md:126) and the cap of 60 oldest both key on the filename date. `host-2026-...md` falls to mtime = copy time, so gathered notes look brand new and `oldest` is wrong. Use `<date>-<host>-<rest>` (date stays first).
6. "installed disabled" (rev4 item 4): the test at install-janitor-timer.test.mjs:549-560 shows a no-`--enable` install only writes the task XML and never calls schtasks, so nothing is registered; there is no disabled-but-registered state, and rev3's `schtasks /query /tn knowledge-triage` proof needs `--enable`. Decide: XML-only, or schtasks create + /disable (UNVERIFIED whether the installer can).
7. install-janitor-timer.mjs is already 973 lines and its test 1361 (territories.md:10 says each NEW file under 800); adding a third job grows both. Tests for the new job belong in scripts/knowledge-triage.test.mjs, not appended.
8. Duplicate-note gap: gather copies under a prefixed name; if the remote move-to-archive fails, the next run re-gathers the same note while the local copy is already in `_archive/YYYY-MM/`. rev3 removed the ledger; gather must check the local _inbox AND `_archive/*/<name>` before copying, else "triaged once" fails. Windows-side tools exist: C:/Windows/System32/OpenSSH/ssh.exe and tar.exe (Task Scheduler PATH may lack Git's /usr/bin).

## Open (T1 builder must confirm)
- Installer's per-job marker table (rev3 :102 ternary), hostname injection point, and Windows task-name namespace rule (test :1235) need the source read.
