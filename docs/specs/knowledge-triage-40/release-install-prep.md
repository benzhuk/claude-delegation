VERDICT: PREPARED (read-only; nothing installed, released, queried or written outside this directory)

Actual clock: 2026-09-29 20:34 EDT (America/New_York), from the system clock. Worktree plugin.json version is 0.20.18. Paths are relative to the Lane 40 worktree unless noted.

## Authority and order (sources)
- Ben's tick, 5:11 PM NY 9/29: "Yes, install when it lands, first run right away (recommended)" (docs/specs/knowledge-triage-40/install-authority.md:9). Cite it in the release item; do not ask again (rev4.md:11). Install still waits for acceptance, merge and the NEXT release (rev4.md:25; install-authority.md:9). No gate is waived.
- Required order (rev4.md:25; spec-r1-adjudication.md:49): (1) publish and remote-verify the one-sentence amendment; (2) register the task DISABLED with PT2H limit; (3) query/verify; (4) enable; (5) trigger the first run immediately; quote last-run.json.
- The sentence for BOTH allowed locations (spec-r1-adjudication.md:65): "A run started by the knowledge-triage job installed under Ben's decision of 2026-09-29 is Ben explicitly invoking this skill, as an exception to its general restrictions on automatic or unprompted invocation, for at most 60 notes per run gathered from all hosts." F11 requires a fresh Opus delta to judge this text first (spec-r1-adjudication.md:67).

## 1. Skill/README amendment (owner: dotfiles/chezmoi repo, not the plugin)
- Locations per rev3.md:26 item 7: ~/.claude/skills/triage/SKILL.md (one sentence after its existing paragraph near :28; the writer paragraph is at SKILL.md:33-37 and names BEN-DESKTOP) and docs/windows-knowledge-update/README.md:5 (chezmoi repo). Neither is on the skill's publish allowlist.
- Rev3 procedure (still the cited one): the writer takes `.curated-update.lock` the way the skill does, runs `chezmoi add --secrets error` on exactly those two files, one commit "docs(triage): scheduled runs are Ben asking (decision of 2026-09-29)", pushes, verifies the sha on the remote, releases the lock; the sha goes in the record. If a guard refuses the runner, the lead runs the same four commands and says so (rev3.md:26).
- Text change vs rev3: "60 notes ... all hosts" replaces rev3's "40" and Sonnet (rev4.md:23).
- No plugin script performs this step.

## 2. Plugin release delivery (owner and route)
- Owner: the lead pane puts a release/install to Ben as a decision item; releases and installs stay Ben's word (docs/pane-setup.md:6-10; README.md:352). Ben's tick is that word for this task.
- I found no release script or changelog tool in scripts/. Evidence shows a version bump in .claude-plugin/plugin.json and .codex-plugin/plugin.json (both 0.20.18) plus a README.md changelog bullet (README.md:300-331 pattern), merged to main. Exact bump/merge mechanics are the lead's existing practice: UNCONFIRMED.
- Per-host update, existing commands (docs/native-use.md:117-121): `claude plugin marketplace update benzhuk`, `claude plugin update delegation@benzhuk`, `claude plugin list`. Then on that host `node scripts/wiring-check.mjs --line` (README.md:248; flags --line/--json/--hook, wiring-check.mjs:49-51,492), and for Codex `node scripts/mirror-shared-skills.mjs` (README.md:238-243) plus the rerun of the Codex hooks step after any update (native-use.md:50).
- Only Windows needs the update for the task (Windows-only, rev4.md:29); other hosts just receive the plugin.

## 3. Task install (writer-only Windows)
- Executing checkout: the INSTALLED plugin cache copy on BEN-DESKTOP, e.g. `%USERPROFILE%\.claude\plugins\cache\benzhuk\delegation\<version>\scripts\install-janitor-timer.mjs`. The installer refuses any plugin root outside `~/.claude/plugins/cache` or `~/.codex/plugins/cache` unless `--force-root` (tests only) (install-janitor-timer.mjs:477-491, 742). Never from this worktree.
- Writer refusal: the writer name is read from `~/.claude/skills/triage/SKILL.md`; a nonwriter gets exit 2 "knowledge-triage installs only on the writer host <name>", and a missing writer paragraph gets "refused: writer host not found in triage skill" (install-janitor-timer.mjs:587-598). So the amended skill must be in place on the writer first. Windows only (:643).
- Task facts: name `knowledge-triage` (:85); default hour 5, daily CalendarTrigger with StartBoundary `<first-run date>T05:00:00` (:86, :282-291); optional `--first-run YYYY-MM-DD`, default today (:649-653); XML written to `~/.agents/knowledge-triage/knowledge-triage.task.xml`, UTF-16LE (:836-877); Enabled=false and ExecutionTimeLimit PT2H (:348-351); interactive token so the Claude plan login is available (rev3.md:20); scheduled command `<node> <pluginRoot>/scripts/knowledge-triage.mjs` (:161).
- Flags accepted (usage :496-509): --job, --hour, --first-run, --enable, --dry-run, --json, --remove, --host. Flags refused for this job are at :639-643 (not enumerated here; check `--help`).
- With `--enable` the installer runs, back to back with stdio ignored (:876-885, :1010-1015): `schtasks /Create /TN knowledge-triage /XML <file> /F`, `/Query /TN knowledge-triage`, `/Change /TN knowledge-triage /ENABLE`, `/Run /TN knowledge-triage`. There is no pause for inspection between Create and Enable.

## 4. Proposed command list (from the installed cache dir on BEN-DESKTOP; NOT run)
1. `claude plugin marketplace update benzhuk`; `claude plugin update delegation@benzhuk`; `claude plugin list`
2. Publish and verify the amendment sentence (section 1); record the sha.
3. Preview: `node <cache>\scripts\install-janitor-timer.mjs --job knowledge-triage --dry-run --json` (expect empty refusals, one XML file, no commands).
4. Register disabled and verify: `node <cache>\scripts\install-janitor-timer.mjs --job knowledge-triage` (no --enable: writes the XML only), then `schtasks /Create /TN knowledge-triage /XML %USERPROFILE%\.agents\knowledge-triage\knowledge-triage.task.xml /F` and `schtasks /Query /TN knowledge-triage /XML` (confirm Enabled false, PT2H, StartBoundary date).
5. Enable and first run: `schtasks /Change /TN knowledge-triage /ENABLE`, then `schtasks /Run /TN knowledge-triage`. The bundled alternative is `node <cache>\scripts\install-janitor-timer.mjs --job knowledge-triage --enable`, which does Create, Query, Change and Run in one go.
6. Verify: `type %USERPROFILE%\.agents\knowledge-triage\last-run.json` (path from knowledge-triage.mjs:34,43), `schtasks /Query /TN knowledge-triage /V /FO LIST`, `node <cache>\scripts\knowledge-count.mjs`, `node <cache>\scripts\wiring-check.mjs --line`.

## 5. Rollback authority (limits)
- Existing mechanism: `node <cache>\scripts\install-janitor-timer.mjs --job knowledge-triage --remove --enable` deletes only marker-carrying triage files and runs `schtasks /Delete /TN knowledge-triage /F` (disableCmds :887; --remove path :901 onward). Without --enable it deletes files only. Janitor-record and collect-status files are left byte-identical (rev3.md:20; rev4.md:29).
- Pause without removal: create `~/.agents/no-knowledge-triage` or `~/.agents/ws-off` (rev3.md:26 item 9; knowledge-triage.mjs:260).
- Not covered by installer rollback: the published dotfiles commit and DIGEST/topic changes from runs (dotfiles operations needing Ben's word). The lock and ATTENTION recovery commands are Ben-run only, verbatim in rev3.md:26 item 3. The tick authorizes install, not removal.

## Unresolved owner boundaries and uncertainties
1. Who runs the dotfiles commit/push for the amendment after merge, and on which host: rev3 says the lane runner or the lead on Windows; my memory notes name netcup as the dotfiles author and Windows chezmoi as wired. Also whether the fresh Opus delta judges the "60 notes / all hosts" text before or after acceptance.
2. Release mechanics (version, changelog bullet, tag/merge) are not scripted anywhere I found; the lead pane owns the release item, and Ben's word for the release itself is separate from the task tick.
3. Bundled `--enable` versus the stepwise verification the spec asks for: the bundled flag has no pause between Create and Enable. Root chooses; I invented no flag.
4. `--first-run` sets only the StartBoundary date of the daily slot; "start immediately" comes from the explicit `schtasks /Run`. The refused-flag list (:639-643) was not enumerated.
5. The first run is a live 60-note Opus run gathering from Netcup, Hetzner and Mac (Mac alias still pending, rev4.md:41), and it confounds Lane 18's October 4 prediction (rev4.md:70).
6. I did not query the live scheduled task or run the installer, even with --dry-run.
