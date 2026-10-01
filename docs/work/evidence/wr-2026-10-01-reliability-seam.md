VERDICT: APPROVE 4faaf8b3eb67b424b6925fd0175b5f16f83a72f8

# Lane 68 seam review, round 1

Reviewed commit: 4faaf8b3eb67b424b6925fd0175b5f16f83a72f8 (my own `git rev-parse HEAD` in the integration worktree, branch build/reliability-68). Range 0f910a7a142f8bc346619136587d27dea87088d6..HEAD: 9 commits, 29 files, +399 -25. Working tree before and after: only the lead's untracked briefs/, reports/ and loop-state.json. Written 10/1 5:56 PM America/New_York.

Count: 0 BLOCKER, 0 MAJOR, 3 MINOR. There is also one scope fact for the lead (S1). It is not a defect at this head and is not counted.

## S1. Scope fact, not counted: census68 is NOT in this head
The integrator merged hooks68 only (reports/integrator.md: "census68 excluded (builder-blocked) per prompt; not merged"). `git diff --stat` touches no census, four-read, work-record or build-loop-workflow.js file. Branch build/reliability-68-census68 (tip ab942ed1) is unmerged. Brief checks 1 (workflow half), 3 and 4 have no census68 code to check. At this head, the spec claims break down like this:
- Item 1 (restart advisory): delivered.
- Item 2 (main-session registration plus non-checkout refusal): delivered.
- Item 3: the brief-template sentence is delivered in 11 places. It is NOT in the six mandate constants of skills/team-build/references/build-loop-workflow.js:197-214 (`grep -c` = 0). The census "pane silent / waiting on a peer" half is not delivered.
- Item 4 (guard denials per build, narrowed detector): not delivered.
- Item 6 (state-file write on Haiku): not delivered. build-loop-workflow.js is unchanged from base.
- Item 5 (tests): delivered for items 1 to 3 (brief-template part) only.
Lane 68 cannot be called complete against its spec from this head. The lead decides whether census68 follows in a second integration or a follow-up lane. Nothing at this head depends on census68, so nothing here breaks because it is missing.

## Brief checks, one by one

1. Shared sentence. I used `grep -cF` with the exact sentence. It appears exactly once (count 1) in each of: agents/builder.md, agents/integrator.md, agents/reviewer.md, agents/runner.md, codex/agents/builder.toml, codex/agents/integrator.toml, codex/agents/reviewer.toml, codex/agents/runner.toml, skills/delegate/SKILL.md, skills/team-build/SKILL.md, docs/mandate-template.md. That is 11 of 11, byte-identical. A search for "PostToolUse guard report" in shipped .md/.toml/.js/.mjs outside docs/ found no variant or near-miss copy; the only other hits are the test's own literal (agents/agents.test.mjs:191-210). build-loop-workflow.js: 0, because census68 is not merged (see S1).
2. Mandate constants and agents test. The workflow constants are unchanged, so the "Never send peer notes." test and the length caps cannot have moved. The four agents' safety blocks between the safety-block markers have the same md5 (343b14bd…) on all four files. Run on the merged head: `node --test hooks/agent-dispatch-guard.test.mjs agents/agents.test.mjs` gave 147 pass, 0 fail. That covers "safety blocks are byte-identical", "stays under the 2100-character ceiling", the worktree-rule test and the new guard-report-sentence test. The sentence sits outside the safety block in all four agents.
3. Item 6: not present (S1). No `agent(` call or model string changed anywhere in the diff.
4. Number 4 compatibility: scripts/work-record.mjs, docs/census.md and four-read are untouched in this head, so nothing can have drifted. Nothing to check.
5. Stale and registration:
   - The one-liner reaches only `--hook` callers (scripts/wiring-check.mjs:519). Both `--hook` callers are SessionStart: hooks/hooks.json:18 (Claude SessionStart) and hooks/multi-codex-hook.mjs:127-128 (Codex SessionStart route, the only NATIVE_ROUTES entry for wiring-check, :67). `--json` (:510) and the table (:524) keep staleSessionText.
   - Guard deny text: staleSessionText (scripts/plugin-staleness.mjs:173) is unchanged, and hooks/agent-dispatch-guard.mjs:497 still uses it. The R0-stale tests pass. No CLI argument was added (wiring-check known set is still --line/--json/--hook, :491).
   - Registration refusal: hooks/multi-inbox.js:226 and hooks/multi-codex-hook.mjs:244 both go through transport.registerMainSessionInbox. A `git grep` shows no other registerInbox/writeInbox caller in production code. note-send refuses an existing non-checkout cwd at skills/multi/scripts/note-send.mjs:663.
   - Single helper: insideGitCheckout is defined once (transport.mjs:1645) and imported by note-send. No second implementation exists.
6. Not in scope / bypass: no Orca, envelope, janitor, lane 65/64b file in the diff. No plugin.json, package.json or marketplace file changed. No added line names ~/.claude, chezmoi or a dotfile. The only `~/` in added lines is a test title mentioning ~/.agents/ws-off. No new flag, env switch or bypass.
7. Gate coverage: the diff changes exactly 10 test files. All 10 are in the integrator's gate list (integrator.md, 495 pass). Missing: none. Note: hooks68's own Gate line also named the unchanged hooks/agent-dispatch-guard.test.mjs, which the integrator did not rerun. I ran it on the merged head (above): green.

## Findings

### M1. MINOR: note-flush's overdue nudge still resolves a recipient repo that is not a git checkout (a twin of item 2)
Evidence:
- skills/multi/scripts/note-flush.mjs:1575 `const reachable = (slug) => Boolean(inboxes[slug]?.cwd) && fsImpl.existsSync(inboxes[slug].cwd);`
- :1604 `const recipientRepo = reachable(target) ? inboxes[target].cwd : null;`
- :1622 passes it as an explicit `--recipient-repo`.
- note-send then takes the explicit branch (note-send.mjs:643-644, `targetRepo = mainCheckout(args['recipient-repo'], git)`), and mainCheckout returns the directory itself for a non-repo ("write where we were told", transport.mjs:458).

So an inbox record whose cwd exists but is not a checkout still gets a docs/ledger line written into it by the overdue-ask nudge. That is the "notes land in a probe folder" bug class the spec names; lane 68 closed it only on the implicit inbox-record branch of note-send. This is MINOR, not MAJOR: after this lane no hook can write such a record (both registration paths refuse), so only records written before the upgrade can trigger it. Refusal does not delete them (see M2).

Fix (mechanical): import insideGitCheckout into note-flush and require it in reachable().
Current, note-flush.mjs:70:
```
  withoutIds, undeliveredIds,
} from './transport.mjs';
```
Replacement:
```
  withoutIds, undeliveredIds, insideGitCheckout,
} from './transport.mjs';
```
Current, note-flush.mjs:1575:
```
    const reachable = (slug) => Boolean(inboxes[slug]?.cwd) && fsImpl.existsSync(inboxes[slug].cwd);
```
Replacement:
```
    const reachable = (slug) => Boolean(inboxes[slug]?.cwd) && fsImpl.existsSync(inboxes[slug].cwd)
      && insideGitCheckout(inboxes[slug].cwd, fsImpl);
```
Predicted outcome: a non-checkout record falls through to `registered` and then to the existing "overdue-send-failed … no repo resolvable" log line (:1605-1611), so it is never sent into the folder. The note-flush tests at :1756, :1799 and :1855 register `cwd: home` (a plain mkdtemp dir) and expect a send, so they would need `fs.mkdirSync(path.join(home, '.git'))`, the same one-line fixture change hooks68 made in inbox.test.mjs:1215/1231/1335. Add one test: an existing non-checkout cwd gives overdue-send-failed and zero sends.

### M2. MINOR (judgment): a refused registration leaves the slug's older record in place
transport.mjs:1671-1676 returns `not-a-git-checkout` and writes nothing. It does not remove an existing record for the same slug. A session that restarts in a non-checkout cwd therefore stays "registered" under its previous record: an old socket or session id, and possibly an old non-checkout cwd from before lane 68 (this is what keeps M1 reachable). Delivery degrades safely, because the receiver drops frames whose session id is not its own and the mirror still carries the note. Still, the registry keeps claiming a reachability that is false. Suggestion for the lead, not a seam fix: either have the refusal drop a record whose sessionId matches the refusing session, or let the INBOX_GC_MS prune age these out and say so in the transport.mjs:1661-1667 comment. No patch is offered; this is a design call.

### M3. MINOR: restartAdvisoryLine's doc says "a caller prints nothing", but the only caller prints the long text
scripts/plugin-staleness.mjs:184-186 says that for non-x.y.z versions it "returns null so a caller prints nothing". scripts/wiring-check.mjs:519 does `restartAdvisoryLine(stale) ?? staleSessionText(stale)`, so a prerelease version still prints the long stale-session line on SessionStart. That behaviour is reasonable, because a stale session should not go silent. Only the comment is wrong.
Current (plugin-staleness.mjs:185-186):
```
 * only for plain numeric x.y.z versions; anything else returns null so a caller prints
 * nothing. Never throws.
```
Replacement:
```
 * only for plain numeric x.y.z versions; anything else returns null (wiring-check --hook then
 * falls back to the long staleSessionText line). Never throws.
```

## Verified absences (first-class)
- No cross-territory re-implementation: there is one insideGitCheckout and one registration entry point.
- No drift in the guard deny text or the CLI surface.
- No safety-block change in any of the four agents.
- No version, plugin.json, dotfile or ~/.claude path in the diff.
- No changed test file is missing from the integrator gate.
- Running the two test files left no repo write.
