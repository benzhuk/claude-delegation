VERDICT: PREPARED (r2; read-only revision; no census, no proof access, no source mutation, no commit, merge or suite)

Actual clock: 2026-09-29 21:50 EDT (America/New_York) = 2026-09-30T01:50:37Z, system clock. r1 (closeout-prep.md) stays as history; this file supersedes its sections 2, 3, 4, 5 and 6.

## 1. Codex-led census path (from the real parser, scripts/build-census.mjs)
Correction accepted: the lead is Codex, so the r1 "unresolved lead transcript" item is closed.

Own rollout (located by filename inside the named Codex home only; no general home scan, no conversational payload read):
- Home: `C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f22a4cc4-fb5a-4af5-aeec-4951188a536a/home`
- File: `<home>/sessions/2026/09/26/rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee.jsonl`
- Size at 01:50:37Z: 61,513,779 bytes; still being written (mtime 01:50:15Z), so it has no closed tail yet.
- Structured first-line metadata only (whitelisted keys, nothing else printed): type `session_meta`, id `01a0df4c-2809-7520-b1d7-876cc51a87ee` (matches the record's Lead-session), payload timestamp 2026-09-26T19:58:25.765Z, originator `codex-tui`, cli_version 0.157.0, source `cli` (not a subagent, no parent), model_provider present.
- Important: the session started on 9/26, the build window is 9/29 19:17Z onward. The legacy `--lead <file>` path reads only the lead's UTC date folder plus the next, and refuses a window outside that two-day horizon ("effective census window is outside default discovery horizon", lines 1499-1505). **Do not use `--lead <file>` for this lead.** Use `--lead-session`: `runCensus` then walks the whole canonical `sessions` tree of the given home (`listCanonicalCodexTree`), verifies the id from `session_meta.payload.id`, and sets `knownId`, which skips the horizon check (lines 1389-1390, 1503, 1641-1652). A missing `--codex-home` would fall back to the built-in `CANONICAL_CODEX_HOME`, which is not this home, so the flag is required.

Supported flags (parser lines 2139-2171): `--lead --lead-session --codex-home --tasks --marker --from --to --ledger-dir --lead-slug --out --json --role-map`. `--marker` and `--from/--to` are mutually exclusive.

Prepared, not run (needs the live proof finished and root's measured accept instant `$T`; the end-witness boundary for a live-written rollout is a valid row after `--to`, or a terminal `task_complete`, per docs/census.md, so root must choose `$T` after the final proof event and after the last lead activity that should be counted):
```
node scripts/build-census.mjs --lead-session 01a0df4c-2809-7520-b1d7-876cc51a87ee --codex-home C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f22a4cc4-fb5a-4af5-aeec-4951188a536a/home --from 2026-09-29T19:17:00Z --to $T --ledger-dir C:/Users/benzh/Code/claude-delegation/docs/ledger --lead-slug skills-a --json docs/work/evidence/wr-2026-09-29-knowledge-triage.census.json --out docs/work/evidence/wr-2026-09-29-knowledge-triage.census.md
```
Spec slice is unchanged from r1 (a Claude transcript on this host, `--lead <spec jsonl> --from 2026-09-29T19:15:53Z --to 2026-09-29T19:17:00Z --json ...spec-census.json`).
Native Codex children are found through `source.subagent.thread_spawn.parent_thread_id`, depth at most three, and reported per child; I did not scan the home to list them (the census does that). The report's coverage line (`COUNTED` or `PARTIAL`, and any `UNSUPPORTED <field>`) is what root should quote, not a number chosen by hand.
Explicitly outside the native graph and to be listed as **unsupported/supplemental, never as zero and never as guessed-linked**: shell-launched Claude `review-run` reviewers and probe/builder/integrator runners (their session ids are in the `*.identity.json` sidecars or reports; each needs a separate `build-census.mjs --lead <that child's transcript>` run and is reported alongside), any shell-launched `codex exec` runner, and other hosts. Number 1 (top-tier tokens) and the stall count are therefore a native-graph figure plus a named supplement, not a total.
Ledger: authoritative dir `C:/Users/benzh/Code/claude-delegation/docs/ledger` (files 2026-09-28.md and 2026-09-29.md exist there). The lane worktree has no `docs/ledger`, so always pass the absolute path. `--ledger-dir` belongs to `build-census.mjs`; `four-read.mjs` calls the same thing `--ledger`.

## 2. four-read flags, confirmed from the parser (no `--help` invoked)
`four-read.mjs` `ARG_FLAGS` (line 878): `--record --census --spec-census --ledger --git --branch --lead-session --lead-slug --out --json --accept-at`. `--record` and `--census` are required (line 889-890). `--census` must be build-census's own `--json` file (shape check refuses the markdown, lines 893-921). `--accept-at` is real, so r1's open item 3 is closed.
```
node scripts/four-read.mjs --record docs/work/wr-2026-09-29-knowledge-triage.record.md --census docs/work/evidence/wr-2026-09-29-knowledge-triage.census.json --spec-census docs/work/evidence/wr-2026-09-29-knowledge-triage.spec-census.json --ledger C:/Users/benzh/Code/claude-delegation/docs/ledger --lead-slug skills-a --lead-session 01a0df4c-2809-7520-b1d7-876cc51a87ee --git C:/Users/benzh/orca/workspaces/claude-delegation/knowledge-triage-40 --accept-at $T --json docs/work/evidence/wr-2026-09-29-knowledge-triage.four-read.json --out docs/work/evidence/wr-2026-09-29-knowledge-triage.four-read.md
```
(`--lead-session` is optional because the record has `Lead-session:`; passing it adds nothing wrong. `--git` and `--branch` default to the record context; I include `--git` only for the range check and did not verify its default.) Prepare only; not run.

## 3. Main merge shape and ordering
- The merge on main must be a no-fast-forward merge whose first parent is current origin/main and whose second parent is the accepted lane tip, with the history bullet in that merge commit's message (for example `merge: build/knowledge-triage-40 (Windows-only knowledge-triage job: cap-60 manual runner, gather, lock owner, SSH startup fix) into main`). I retract r1's step "merge origin/main into the integration checkout" as the main merge: merging main into the lane and pushing that reverses the parent identity and must not be advised.
- Why it matters mechanically: `close --closeout` (its origin-branch step) proves a lane tip is reachable from `M^2` and not from `M^1` of some merge on main's first-parent line (`tipBehindMergeCommit`, work-record.mjs:1858-1880); a merge of main into the lane fails that proof.
- Non-mutating preview stays valid as a preview only: current main a57e2ff vs tip 9e17747 was clean (tree 7d152cd3…). It must be redone against fresh main after the proof; I did not refetch.
- Exact code/record ordering (accept commit, then merge, gates, push) is left for root to adjudicate after the proof and fresh main status, per the ruling. Nothing to do now.

## 4. Acceptance vs closure predicates (corrected)
- `check-acceptance` is the pre-accept check. It requires `Status: reviewed` immediately before acceptance (r1 observed exactly that refusal on the `owned` record) and must not be run after `accept` expecting `reviewed`; after accept the record is `accepted` and it would refuse for that reason.
- Post-accept correct predicates, from `closeRecord` (work-record.mjs:1655-1704): `Status` must be `accepted` (else `not-accepted`; `closed` is `already-closed`); `validateRecord` must return no `finding`-level rows (`invalid-accepted`); `--merge <sha>` must resolve to a commit and be an ancestor of `--main` (default `origin/main`, `merge-not-ancestor`); `--at` must be a zoned ISO-8601 timestamp not before the record's last `Log:`, not older than 10 minutes and not more than 5 minutes ahead (`invalid-at`), so the close must be run right after the merge is on origin/main. The `close` write appends the `closed <Owner> merge <40-hex>` line. Then `close --closeout` (with `--by 01a0df4c-2809-7520-b1d7-876cc51a87ee`, `--dry-run` first) covers the worktree, branches and Scratch cleanup, which is separately authorised.
```
node scripts/work-record.mjs close --record docs/work/wr-2026-09-29-knowledge-triage.record.md --repo <root> --merge <merge-sha> --at <ISO-with-zone>
```
- Acceptance pre-conditions unchanged from r1: Status to `reviewed` (a Log line naming the Opus reviewer and APPROVE for 80760b3), the new proof report copied into `docs/work/evidence/` with a `VERDICT:` first line and added to `Evidence:`, census and four-read from sections 1-2, then `accept ... --pinned-artifact 80760b3bea59b8d8641537b1ae3749388f13f575 --census ... --four-read ... --at $T`. The `accept` `--at` and `four-read --accept-at` share one `$T`.

## 5. Scheduled text (F11) and the held amendment
- Correction accepted: the scheduled-invocation sentence was already independently approved in recipe-review-r1/r2, so no further Opus delta is needed for the text itself. Its patch stays HELD until acceptance, merge and the next release.
- r1 cited combined result hashes (SKILL 20856eb9…, README e2fa120b…). Those belong to the superseded old-base combined assembly and must not be described as the future installed hash. The installed skill today is dotfiles `de16056` (SKILL 8588a62a…); the future scheduled assembly and its exact base, and the peer delivery of it, still need to be built and verified at that time. Nothing installs it now.
- Release and install boundary are unchanged from r1 section 5 and release-install-prep.md: Ben's 17:11 tick authorises install and first run after acceptance, merge and the next release; release mechanics are the lead pane's and remain unconfirmed.

## 6. Bearings
Separate remaining publication obligation, not a tool gate and not a waiver. Preserved as pending, with its full-page lint evidence (bearings-lint-diagnosis.md: Notion's flat `<tr>`/`<td>` rows inside an indented table end the heading toggles early in page-lint's `ruleToggleTail`; the whitespace-only fix passes lint on a local copy, live application needs a root ruling and an extra table edit). No Notion edit and no lint bypass.

## 7. Boundaries observed
No live proof access, no census or four-read run, no accept, no merge or commit, no source change, no general scan of the Codex home (one filename lookup and one bounded first-line read of the named rollout, whitelisted metadata keys only). Not opened: raw conversation content. No refusal occurred.
