VERDICT: PASS 0523ec8e82bb48d8fa775f0c20bfa6559813b049 (lead-run live proof, supporting evidence, not the deciding review)

# Lane 33 live proof (lead-run, scratch HOME, live unit untouched)

## 1. Installer dry-run keeps --stale-hours

Command: HOME=<mktemp scratch> node scripts/install-janitor-timer.mjs --job collect-status --to skills-fable --force-root --dry-run --json --repo /home/ben/Code/claude-delegation (without --repo the scratch HOME has no default checkout, refused rc=1 as designed; with it rc=0).

```
ExecStart=/home/ben/.local/share/fnm/node-versions/v24.18.1/installation/bin/node /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/wt-cf/scripts/collect-status.mjs --repo /home/ben/Code/claude-delegation --to skills-fable --host v2202608391056492408 --stale-hours 2
"staleHours":2
```

## 2. collect-from-origin from the repo copy

Command: node <wt-cf>/scripts/collect-from-origin.mjs --repo /home/ben/Code/wt-ws-mainbase, rc=0, 9 rows:

```
branch	tipSha	tipDate	recordPath	status	artifactSha	merged	hoursSinceLog	state
build/autolink-guard-1	a43d96e7355c6ea991e0a0e54a494fa64be6728b	2026-09-27T23:06:46-04:00	docs/work/wr-2026-09-27-autolink-guard.record.md	owned	-	-	1.22	owned
build/collect-followups-1	e6348b46cac5ac7598dc0f6b8d07f9eccff5b4f0	2026-09-28T00:18:19-04:00	docs/work/wr-2026-09-28-collect-followups.record.md	delivered	-	-	0.03	owned
build/fresh-walk-1	475873d9929e6deda2bddbc3da82920d55f574e6	2026-09-26T17:15:42-04:00	docs/work/wr-2026-09-25-fresh-project-walk.record.md	reviewed	4229f7a8f4f85d9e2ea6d11a8cc999edf6e6dd1d	false	32.13	owned
build/gate-under-load-1	0ba90d06be5efe308cde9577cb68f722d892c0e1	2026-09-26T19:57:51-04:00	-	-	-	-	-	no-record
docs/bearings-0925	7dfc59d7393a2e1b8648c78fca1304bc7c58b559	2026-09-25T10:33:58-04:00	-	-	-	-	-	no-record
docs/bearings-0926	c3605a0b94e3a0e36eceb049f196b423b912445c	2026-09-26T08:12:33-04:00	-	-	-	-	-	no-record
docs/bearings-0927	a2bd7114877867e4f514f9c790870aff5888cc4c	2026-09-27T08:43:38-04:00	-	-	-	-	-	no-record
docs/lane-specs-0925	34ecdbefb942a8dc76eaccdba29f7a787d66ba05	2026-09-27T23:47:05-04:00	-	-	-	-	-	no-record
feat/working-smarter	6363a62012fb09e98b2b8ebbe4bba1e64bad0795	2026-09-20T12:51:37-04:00	-	-	-	-	-	no-record
```

Observed: no row reads closed. Today's closed lanes whose branches still exist on origin (build/sealed-home-leak-1, build/stall-nudge-1, build/collect-status-1) are ancestors of origin/main after their --no-ff merges, so the collector skips them before computeState runs, by its own documented filter. Closed lanes with no branch: none today. The terminal closed state is therefore proven by the unit tests (collect-status.test.mjs, M3 killed in review r2), not by a live row; a live closed row appears only for a closed record on an unmerged branch.
