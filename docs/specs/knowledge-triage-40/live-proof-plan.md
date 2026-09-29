# Lane 40 bounded manual live-proof plan

Status: **PREPARED ONLY — DO NOT RUN**

This plan becomes executable only after the focused four-file gate is green, independent Opus source review approves the exact source SHA, and root explicitly gives gate-green approval for the live proof. The failed focused gate at `5e21529` and its repair work do not satisfy those conditions. Preparation performed no live run, SSH, install, task registration, knowledge mutation, dotfiles mutation or Git publication.

## Scope and immutable inputs

Run exactly one manual proof from the approved Lane 40 checkout, using the real Windows user HOME, the normally installed `~/.claude/skills/triage/SKILL.md`, current authenticated Claude plan, current user settings and active guard hooks. Record the approved source SHA before launch. Do not set `HOME`/`USERPROFILE`, copy credentials, add a plugin overlay, change settings, change permission mode or pass dependency seams.

The production CLI exposes only `--manual`; `sshCommand`, `claudeCommand`, `gitCommand`, `chezmoiCommand`, endpoint, clock and timeout seams are import-only test dependencies. The proof therefore uses the fixed Netcup and Hetzner endpoints, the Mac `pending` sentinel, 60-second host deadlines, the 60-minute nested deadline and the production Claude argv/environment. The installed-skill delivery evidence is `lock-owner-delivered.md`: Windows, Netcup and Hetzner received the narrow owner-name fix; Mac remains pending. Do not repeat the denied identifier search. Record the installed Windows skill's path, byte count and SHA256 without scanning its contents for either identifier.

Raw evidence goes under:

```text
C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/live-proof/<YYYYMMDD-HHmmss>/
```

Evidence helpers may write only in that directory. They are read-only with respect to HOME, the knowledge stores, remotes and dotfiles.

## Read-only preflight and before snapshot

Do these checks in order. A refusal stops that check and the launch; retain the exact refusal and do not retry through another command, shell, tool, allowlist or permission mode.

1. Record the approved plugin source SHA and verify the working tree contains that reviewed source without modifying, cleaning or stashing it. Record Node and Claude CLI versions as metadata only.
2. Record the live skill path/hash/bytes. Confirm the writer paragraph resolves to this Windows hostname by the runner's normal parsing. Record whether either kill switch exists, whether `~/.agents/knowledge-triage/ATTENTION`, `run.lock`, or `.curated-update.lock` exists, and whether `claude` resolves. Do not clear or repair any condition. A kill switch, ATTENTION, any lock, writer mismatch, missing skill or missing CLI means **do not launch**.
3. Resolve the live DIGEST source path with the same read-only command the source uses: `chezmoi source-path <live DIGEST.md>`. Resolve its repository with `git -C <source-parent> rev-parse --show-toplevel`. Record branch, HEAD, and a fresh `git ls-remote origin refs/heads/<branch>` result. Require HEAD to equal the fresh remote ref before launch; otherwise stop without running. Do not inspect SSH configuration or invent the Mac alias.
4. Preserve unrelated dotfiles evidence without exposing file contents: save the exact NUL-delimited outputs of `git status --porcelain=v2 -z`, `git diff --raw -z`, `git diff --cached --raw -z`, and `git ls-files --stage -z`; also save SHA256/type/missing markers for every pre-existing dirty worktree path. Do not stage, reset, checkout, stash, clean or apply. If a dirty path is within the knowledge source tree that the triage skill could publish, stop for adjudication. Other pre-existing dirty paths are allowed and must have identical status, worktree hashes and index object IDs afterward.
5. Record local pending count using the runner's definition: top-level, non-dot, regular `.md` files in `~/.claude/knowledge/_inbox`, excluding `_archive`. Record total local archive `.md` count, DIGEST byte hash, and the seven-day read count returned by the maintained counting module. Also record, as counts and hashes rather than transcript text, total seven-day `read.log` events and the pre-run `sessions.json` hash/list size.
6. Over read-only SSH, collect pending and archive counts from `ben@100.69.249.18` and `ben@100.111.119.54`. Use the production fixed SSH options (`-T`, BatchMode, strict host-key checking, 15-second connect timeout, no forwarding, no local command, no remote command override, no TTY), and a fixed `/bin/sh` script that only counts top-level non-dot regular `.md` inbox files older than five minutes and regular `.md` files under `_archive/YYYY-MM`. Send no note content or caller credential in stdin. Record endpoint, exit/timeout, pending count and archive count. An unreachable host is a named skip, never a guessed zero. Record Mac as `awaiting owner-provided ssh alias` and perform no Mac SSH or config lookup.
7. Save the complete before snapshot before launching. If every reachable inbox is empty and local pending is zero, do not spend the run: the required nested Opus proof could not occur. This is readiness failure, not a successful live proof.

## The single invocation

From the exact approved checkout, with no environment overrides, wrapper timeout, redirection into HOME, injected dependencies or extra flags, run once:

```powershell
Set-Location -LiteralPath 'C:\Users\benzh\orca\workspaces\claude-delegation\knowledge-triage-40'
node .\scripts\knowledge-triage.mjs --manual
$liveProofExitCode = $LASTEXITCODE
```

Record the console line and exit code in the evidence directory. Do not issue a second invocation for any outcome. `--manual` selects the one-time intake authority in the nested prompt; it does not install or simulate the scheduled task. The runner itself creates the nested UUID, appends it to `sessions.json` before spawn, invokes `claude-opus-5-5` once with the reviewed production argv, and applies its 60-minute child watchdog.

Do not impose a second outer timeout or manually kill the process during the normal bound. On the runner's nested timeout, its owned process tree is killed and the receipt must be `attention`; the curated lock is deliberately left for Ben's inspection under the skill rule. Do not remove that lock or ATTENTION, and do not relaunch. If the outer runner itself remains alive beyond its source-bounded child/host/Git steps, preserve process evidence and request adjudication before any intervention.

## After snapshot and mechanical assertions

After the one process exits, collect only read-only evidence even if the run failed or a denial occurred. Do not retry the failed action.

1. Copy `~/.agents/knowledge-triage/last-run.json` and the new receipt-related state as evidence, leaving originals in place. Record its hash. A missing or unparsable receipt is failure evidence.
2. Repeat the local and fixed-host count collectors exactly. For each remote, report before/after pending and archive counts or the exact skip/failure reason. Compare these with each receipt host row (`fetched`, `imported`, `alreadyPresent`, `archived`, `pending`, `managed`, `resurrected`, `unresolved`, `terminal`). Concurrency means count deltas alone never identify a moved note; use the retained stage provenance and receipt disposition for attribution.
3. Repeat the dotfiles snapshot. Require every pre-existing unrelated dirty path's status, worktree hash and index object ID to match its before value. Changes are explainable only by receipt `topicsTouched`, selected archive/DIGEST publication and their corresponding chezmoi source paths. Any other delta is named residue and fails the preservation assertion; never repair it in this proof.
4. Resolve the DIGEST source path again and record live DIGEST hash, committed `HEAD:<digest-source-relative-path>` hash, new HEAD and a fresh remote branch ref. For a publication run, mechanically require: DIGEST changed; exactly one commit in `<beforeHEAD>..<afterHEAD>`; that commit touched the DIGEST source path; after HEAD equals both `last-run.json.publication.head` and the fresh remote ref; and the committed DIGEST contains `· <selected-filename-without-.md> →` for every selected note actually archived. Quote those complete per-note DIGEST lines in the report. HEAD movement by itself is insufficient.
5. Locate only the Claude transcript whose filename equals `last-run.json.sessionId`. Parse structured events into a summary without copying prompt/tool payloads: first tool is the normal user `triage` skill, resolved model is Opus 5.5, result usage, permission-denial list, and hook outcomes if recorded. No `--plugin-dir` is present in production argv. If the exact transcript is absent, ambiguous, or lacks conclusive denial evidence, report that assertion as unproven rather than assuming zero denials.
6. Prove read exclusion mechanically. Require the receipt session UUID to appear exactly once in `sessions.json`; count seven-day `read.log` lines whose final token is that UUID; recompute the maintained seven-day read count, which excludes all recorded triage session IDs; and record raw-event delta, matching-session count and excluded-count delta. Concurrent non-triage reads are reported separately where their final tokens differ. Never publish raw read-log paths or transcript bodies.

## Receipt and stop interpretation

The live-proof gate passes only when all of the following are true: process exit 0; receipt `status: success`; non-null session UUID; `nestedExitCode: 0`; numeric input/output/cache-read/cache-creation/total tokens with the contract sum; `notesIn` between 1 and 60; no out-of-selection archive; per-note committed DIGEST matches; exactly one verified dotfiles publication commit and fresh remote match; unrelated dotfiles state preserved; origin results and skips truthful; and nested read exclusion proven.

Interpret every other outcome literally:

- `status: skipped` is a recorded skip, not a run and not proof. Preserve its exact reason. Do not convert lock, kill-switch, writer, ATTENTION, missing-skill or missing-CLI skips into zero-work success.
- `status: success, reason: inbox empty` has no nested session and does not satisfy the manual proof.
- `status: success, reason: skill deferred` records a real child call but does not prove triage/publication efficacy. Preserve the token/session evidence and stop.
- A host row skipped as unreachable, or Mac skipped as `awaiting owner-provided ssh alias`, remains a truthful named limitation. Never report a skipped host as zero notes or as successfully reconciled.
- `tokens: {unavailable: ...}` is not zero and does not satisfy the token assertion.
- `status: failed`, `status: attention`, nonzero exit, timeout, publication mismatch, changed DIGEST without its source-path commit, remote-ref failure after publication, out-of-selection archive, guard/permission denial, or inconclusive denial evidence fails the proof. Preserve all resulting state and do not clear locks or ATTENTION.

Any guard or permission denial stops its affected step. The outer process may still finish its own failure recording, and the read-only after snapshot may document resulting state, but no alternate command shape or second live run is permitted. One-run evidence—successful, skipped, partial or failed—goes back to root for adjudication. A rerun requires a new explicit ruling; it is never an automatic recovery action.

## Boundary from release installation

This manual `--manual` proof is G1 only. It runs reviewed source directly under the intake authority and does not publish the scheduled-invocation amendment, install/register/query/enable a task, or exercise the first scheduled run.

After acceptance, merge and the next release, G4 remains separate: publish and remote-verify the one authorized skill/README sentence, register the triage task disabled with PT2H, query/verify it, enable it, then trigger its first run immediately under Ben's recorded September 29 17:11 America/New_York tick. That scheduled invocation omits `--manual` and uses the tick wording. Evidence from this manual proof must not be relabeled as installation or first-scheduled-run evidence.
