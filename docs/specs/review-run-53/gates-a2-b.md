DONE

# Lane 53 (review-run) acceptance gates a2 and b — Netcup

All commands ran with `TMPDIR` set to directories under `/var/tmp/lane53-gates-zOlS/` (created via `mktemp -d /var/tmp/lane53-gates-XXXX`). `--scratch` and every intermediate file were kept under that same tree, never under `/tmp`. No code was edited. No deletes were performed. No git identity was set.

| Gate | Result | Evidence |
|---|---|---|
| a2 (quality, sha `90beeb9b61ec83a1af6dd4adc18419c4872ef5ce`) | **INCONCLUSIVE-brief** (content matched; exit-code criterion missed) | See "Gate a2" below |
| b (Codex-launched run) | **PASS** | See "Gate b" below |

## Gate a2 — quality check on `90beeb9b61ec83a1af6dd4adc18419c4872ef5ce`

**Brief.** No file in the repo (checked `/home/ben/Code/claude-delegation`, `origin/main`, and the lane-53 worktree) is a round-10-specific review brief distinct from the standing `docs/specs/codex-followups-49/review-brief.md`. That file is reused across all Lane 49 Opus review rounds (r1–r5); the per-round ASK that pinned the SHA and (per the round-3/round-10 raw review) explicitly named a "Stop-null mutant" appears to have been an ephemeral dispatch message, never committed. Per instruction, I reconstructed the brief from (a) the standing `review-brief.md` verbatim, and (b) the record's own Log lines for this round (`docs/work/wr-2026-09-28-codex-followups.record.md`, lines ~30–32, the 2026-09-29T00:54:42Z and T00:59:00Z entries) plus the pinned SHA, adding one explicit attack-order item about the composition-stub regression and a note describing the reconstruction. Saved at `/var/tmp/lane53-gates-zOlS/a2/brief-round10-reconstructed.md`. **Gate a2 is therefore marked INCONCLUSIVE-brief, independent of the outcome below.**

**Record line 32 (quoted verbatim):**
> Log: 2026-09-29T00:59:00Z rejected skills-a Claude Opus 5.5 reviewer lane49-review NEEDS_FIXES 90beeb9b61ec83a1af6dd4adc18419c4872ef5ce via skills-fable-lane-49-10. Reviewer production Stop-null mutant passes because deterministic composition removed sole realStop proof. Both fullhosts were green but do not repair this coverage gap.

**Launch (1 of the 3-launch budget).** Fresh `git clone --no-hardlinks` of `/home/ben/Code/claude-delegation` into `/var/tmp/lane53-gates-zOlS/a2/repo` (never the real checkout). Ran:
```
node <wt>/skills/team-build/scripts/review-run.mjs --sha 90beeb9b61ec83a1af6dd4adc18419c4872ef5ce \
  --repo /var/tmp/lane53-gates-zOlS/a2/repo --plugin-root <wt> \
  --brief /var/tmp/lane53-gates-zOlS/a2/brief-round10-reconstructed.md \
  --report /var/tmp/lane53-gates-zOlS/a2/report.md \
  --scratch /var/tmp/lane53-gates-zOlS/a2/scratch --timeout-min 30
```

**Result.** Process exit code / `review-run`'s own reported exit: **0** (`{"exit":0,...,"verdict":"NEEDS_FIXES",...}`, and the identity sidecar's `"exit": 0`). Report's first line, quoted verbatim:
> VERDICT: NEEDS_FIXES (2) 90beeb9b61ec83a1af6dd4adc18419c4872ef5ce

The matching finding, title quoted verbatim:
> ### F1: MAJOR (coverage regression). The suite no longer proves the production Stop route; a Stop-null production mutant passes everything

F1's body independently reproduces the same defect as record line 32 (a production mutant nulling the Stop route in `hooks/multi-codex-hook.mjs` still passes the full suite because the test file's Stop-composition loop was replaced by a deterministic stub, `deterministicBacklogRoute`), with its own measured mutant run (66/66 pass with the mutant in place) plus a ready patch.

**Verdict on the two PASS conditions given to me:**
- Content condition (names the Stop-null mutant gap): **met** — F1 is the same defect as record line 32, independently re-derived and measured, not just asserted.
- Exit-code condition (exit 2): **not met** — the actual exit code was 0. Reading the script (`skills/team-build/scripts/review-run.mjs`, `EXIT` enum and the branch at the end of `runReviewRun`), `EXIT.OK = 0` fires whenever the report's first line matches `VERDICT_RE` at all, whether the verdict word is `APPROVE` or `NEEDS_FIXES`; `EXIT.BAD_REPORT = 2` is reserved for a missing/malformed verdict line, not for a NEEDS_FIXES verdict. So a NEEDS_FIXES report exiting 0 is the script's normal, current behavior, not a run failure — but it is not what the gate text (and my instructions) specified as the exit-2 PASS condition. I flag this discrepancy rather than silently accepting or overriding it.

Taken together: the review-run itself worked correctly and reproduced the intended defect, but (1) the reviewer brief driving it was a reconstruction, not the recorded round-10 artifact, and (2) the exit-code PASS condition as stated does not match the script's actual, current exit-code semantics. I report both facts rather than picking a single PASS/FAIL label; net status recorded above is **INCONCLUSIVE-brief**, with the exit-code mismatch noted as a separate, brief-independent finding for the lead to weigh.

Full report: `/var/tmp/lane53-gates-zOlS/a2/report.md`; sidecar: `/var/tmp/lane53-gates-zOlS/a2/report.md.identity.json`; reconstructed brief: `/var/tmp/lane53-gates-zOlS/a2/brief-round10-reconstructed.md`.

## Gate b — Codex-launched run

`codex --version`: `codex-cli 0.158.0`; `codex login status`: "Logged in using ChatGPT". Proceeded.

Decoy repo: `/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-53/probes/proberepo` (confirmed `d7625e0` present there, resolves to full SHA `d7625e031a61bc34a9bcc8d0fbcdfb8c99114d87`). Brief: a short benign "review README.md only" brief, written to `/var/tmp/lane53-gates-zOlS/b/brief-onefile.md`. Both attempts ran `codex exec -C <wt> --sandbox <mode> - < <prompt file>`, cwd = the worktree, telling Codex to run exactly one command and report its exit code and output verbatim.

### Attempt 1 — `--sandbox workspace-write`
Argv given to Codex to run:
```
node skills/team-build/scripts/review-run.mjs --sha d7625e0 --repo <proberepo> --plugin-root <wt> \
  --brief /var/tmp/lane53-gates-zOlS/b/brief-onefile.md \
  --report /var/tmp/lane53-gates-zOlS/b/report-attempt1.md \
  --scratch /var/tmp/lane53-gates-zOlS/b/scratch1 --timeout-min 15
```
Codex's own sandbox line: `sandbox: workspace-write [workdir, /tmp, $TMPDIR]`. `--report`/`--scratch` were under `/var/tmp/lane53-gates-zOlS/b`, outside that allow-list.

**Failure text, verbatim (Codex's reported command output):**
```
review-run internal error: Error: EROFS: read-only file system, open '/var/tmp/lane53-gates-zOlS/b/report-attempt1.md.identity.json'
    at Object.openSync (node:fs:561:18)
    at Object.writeFileSync (node:fs:2436:35)
    at validateReportPath (file:///.../wt/skills/team-build/scripts/review-run.mjs:337:12)
    at runReviewRun (file:///.../wt/skills/team-build/scripts/review-run.mjs:496:5)
    at main (file:///.../wt/skills/team-build/scripts/review-run.mjs:885:38)
```
Exit code: `7` (review-run's `EXIT.INTERNAL`). Failure category: **writes outside the workspace** (the report/sidecar path was outside the sandbox's allowed roots — `workdir`, `/tmp`, `$TMPDIR`). No claude-side reviewer session was reached; no report was produced; no sidecar `permissionDenials` field exists for this attempt.

### Attempt 2 — escalated to `--sandbox danger-full-access`
Same argv, with `--report`/`--scratch` pointed at `report-attempt2.md` / `scratch2` in the same directory.

Codex's own sandbox line: `sandbox: danger-full-access`. The exec block Codex ran and its output, verbatim:
```
exec
/bin/bash -lc 'node skills/team-build/scripts/review-run.mjs --sha d7625e0 --repo <proberepo> --plugin-root <wt> --brief /var/tmp/lane53-gates-zOlS/b/brief-onefile.md --report /var/tmp/lane53-gates-zOlS/b/report-attempt2.md --scratch /var/tmp/lane53-gates-zOlS/b/scratch2 --timeout-min 15' in <wt>
 succeeded in 47715ms:
{"exit":0,"report":"/var/tmp/lane53-gates-zOlS/b/report-attempt2.md","identity":"/var/tmp/lane53-gates-zOlS/b/report-attempt2.md.identity.json","verdict":"NEEDS_FIXES","sha":"d7625e031a61bc34a9bcc8d0fbcdfb8c99114d87","session":"3018c683-baf2-47d0-ae9d-4b086f2b4a54","cleanup":"ok"}
```
Codex reported back: `Exit code: 0`, quoting the same JSON.

Report's first line, quoted verbatim:
> VERDICT: NEEDS_FIXES (3) d7625e031a61bc34a9bcc8d0fbcdfb8c99114d87

Sidecar `permissionDenials`: `0` (from `/var/tmp/lane53-gates-zOlS/b/report-attempt2.md.identity.json`). `childExitCode: 0`, `cleanup: "ok"`. Model resolved: `claude-opus-5-5`.

**Gate b result: PASS.** review-run exited 0 with a valid VERDICT first line, launched from inside `codex exec`, running against the decoy repo pinned at the real `d7625e0` full SHA. No further escalation past `danger-full-access` was needed; no network or `~/.claude`-access failure was ever observed (workspace-write's only failure was the report-path write, not network or config access).

Full reports: `/var/tmp/lane53-gates-zOlS/b/report-attempt1.md` (never created — internal error before write), `/var/tmp/lane53-gates-zOlS/b/report-attempt2.md`; sidecar: `/var/tmp/lane53-gates-zOlS/b/report-attempt2.md.identity.json`; raw codex-exec transcripts: `/var/tmp/lane53-gates-zOlS/b/codex-attempt1.log`, `/var/tmp/lane53-gates-zOlS/b/codex-attempt2.log`.

## Escalation line for gate b

`--sandbox workspace-write` failed (`EROFS`, writes outside the workspace, exit 7) → escalated once to `--sandbox danger-full-access`, which succeeded (exit 0, `VERDICT: NEEDS_FIXES` first line, `permissionDenials: 0`).

## Launch budget used

3 of 3 real review-run launches used: gate a2 once (exit 0, NEEDS_FIXES, INCONCLUSIVE-brief); gate b twice (attempt 1: internal error before any reviewer session started, exit 7; attempt 2: exit 0, NEEDS_FIXES, PASS).
