DONE MATCH

# Lane 53 rerun — clean brief, gate a2, review-run for 90beeb9b61ec83a1af6dd4adc18419c4872ef5ce

## Setup

- Scratch dir: /var/tmp/lane53-a2clean-qi6W (TMPDIR, --scratch, brief and report all under it).
- Worktree (code at 643a862, used as --plugin-root): /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-53/wt
- Repo (reused read-only clone, used as --repo): /var/tmp/lane53-gates-zOlS/a2/repo (HEAD 0c92605, clean, untouched by this run except by review-run.mjs itself).
- No code edited. No delete of any kind. No git identity touched. Nothing printed from environment/secrets.

## Brief construction (verbatim sources only)

1. Item 1 — full text of `docs/specs/codex-followups-49/review-brief.md`, pulled verbatim via `git -C <repo> show origin/main:docs/specs/codex-followups-49/review-brief.md`. Diffed byte-for-byte against the worktree's copy of the same path: identical. Includes the standing brief's own pre-existing typo "Prior base9c816fdd8ef906388c74d69263bb6b9935dc9221" (no space) — kept as-is because the instruction was "verbatim."
2. Item 2 — one line: "Candidate under review: 90beeb9b61ec83a1af6dd4adc18419c4872ef5ce, a delta from the prior APPROVE at d6e411764846d8a02b82e3c0671f13ccd19a5951."
3. Item 3 — the record's Log line timestamped 2026-09-29T00:54:42Z from `docs/work/wr-2026-09-28-codex-followups.record.md` (line 31 in the worktree copy), quoted verbatim:
   "Log: 2026-09-29T00:54:42Z delivered skills-a GPT-5.6-Terra test author returned deterministic composition fix46228f302b88d64c48fd966caea0d73496b67614. Scoped25of25 passes. Scratch Stop-null mutant fails intended assertion while peer and continuation remain. Existing real CLI, two-session routing, and both timing checks retained; production unchanged. Same Opus delta requested next."

Nothing else was added. Confirmed by direct inspection of the record file that the next Log line (2026-09-29T00:59:00Z, line 32 — "Reviewer production Stop-null mutant passes because deterministic composition removed sole realStop proof. Both fullhosts were green but do not repair this coverage gap.") and everything after it is absent from the brief.

Brief file: /var/tmp/lane53-a2clean-brief.md (copy of /var/tmp/lane53-a2clean-qi6W/brief.md used for the run).

## Grep for forbidden words in the brief

Command: `grep -noiE '\b(stop|composition|stub|mutant|realstop|coverage gap)\w*' brief.md`

Hits (line:word), each traced to its verbatim source:
- 8:mutants — standing brief, item 1 ("Check5000ms mutants fail the intended timing assertions...")
- 10:mutant — standing brief, item 3 ("A dropped-session-id Codex mutant must fail this actual contract.")
- 11:stub — standing brief, item 4 ("Public interfaces match the committed contract stub.")
- 18:composition — delivering author's Log line, 00:54:42Z ("...deterministic composition fix46228f3...")
- 18:Stop — same Log line ("Scratch Stop-null mutant fails intended assertion...")
- 18:mutant — same Log line (same phrase)

No hit for "realstop" or "coverage gap" anywhere in the brief. Every hit traces to either the standing master brief (docs/specs/codex-followups-49/review-brief.md) or the 00:54:42Z Log line — both explicitly permitted verbatim sources. No hit originates from the reconstruction note, the 00:59:00Z line, or line 32.

## Run

Command:
```
node <wt>/skills/team-build/scripts/review-run.mjs --sha 90beeb9b61ec83a1af6dd4adc18419c4872ef5ce --repo <repo> --plugin-root <wt> --brief /var/tmp/lane53-a2clean-qi6W/brief.md --report /var/tmp/lane53-a2clean-qi6W/report.md --scratch /var/tmp/lane53-a2clean-qi6W/scratch --timeout-min 30
```
Ran once. TMPDIR was exported to /var/tmp/lane53-a2clean-qi6W before the call.

- Exit code: 0
- Wrapper JSON summary: `{"exit":0,"report":"/var/tmp/lane53-a2clean-qi6W/report.md","identity":"/var/tmp/lane53-a2clean-qi6W/report.md.identity.json","verdict":"NEEDS_FIXES","sha":"90beeb9b61ec83a1af6dd4adc18419c4872ef5ce","session":"a4480c92-4216-4d71-aab1-71444bf3fa67","cleanup":"ok"}`
- Report's first line: `VERDICT: NEEDS_FIXES (3) 90beeb9b61ec83a1af6dd4adc18419c4872ef5ce`

## Finding titles (report.md)

- F1: MAJOR. The delta removed the only real-route evidence for PostToolUse and Stop, so a production mutant that drops either route now survives
- F2: MINOR. The new test comment and the test report overstate the retained coverage
- F3: MINOR, pre-existing and not a regression. Nothing tests that the Stop line reaches additionalContext

## Sidecar fields (report.md.identity.json)

- permissionDenials: 2
- model: "opus" (resolvedModel: "claude-opus-5-5")

No permission denial stopped this rerun's own steps — all setup and run commands here completed normally with exit 0. The permissionDenials:2 figure is internal to the reviewer subprocess's own sidecar accounting, recorded here as instructed, not further inspected (out of scope for this job).

## Judgment: does any finding identify the same defect as record line 32?

Record line 32: "Reviewer production Stop-null mutant passes because deterministic composition removed sole realStop proof. Both fullhosts were green but do not repair this coverage gap."

F1's title and body describe exactly this defect, independently rediscovered from a brief that never mentioned it. Quoting F1 verbatim:

Title: "MAJOR. The delta removed the only real-route evidence for PostToolUse and Stop, so a production mutant that drops either route now survives"

Body (key sentences): "I applied in-memory mutants to production `hooks/multi-codex-hook.mjs:132` through an ESM load hook, with no file written. ... M1 `if (event === 'Stop') return null;`: the candidate test goes 12/12 green, so the mutant **survives**. The d6e4117 test fails with `Stop must render actual backlog output`. ... This breaks the brief's requirement to 'keep actual behavioral route evidence.' ... The author's red-mutant receipt (L49-test-report.md:33) mutated the **injected test fixture**, not production, so it only proves that the test asserts its own fixture. The check is circular."

And the Discriminating check field: "production mutant M1 (`multi-codex-hook.mjs:132`, Stop returns null) passes the candidate test 12/12 and fails the d6e4117 test."

This is the same finding as line 32 stated in the reviewer's own words and terms: a production Stop-null mutant passes (survives) on the candidate because the deterministic/injected composition stub replaced the only real Stop-route proof (the "sole realStop proof" of line 32 corresponds to the reviewer's "only real-route evidence for PostToolUse and Stop" / "injected test fixture, not production"). The reviewer reached this from the clean brief's own attack order (item 2, "Attack a check that passes because it is not looking") and the author's own note in item 3, not from any statement of the defect itself.

Verdict: MATCH.

## Files
- Brief used: /var/tmp/lane53-a2clean-qi6W/brief.md (copy: /var/tmp/lane53-a2clean-brief.md)
- Report: /var/tmp/lane53-a2clean-qi6W/report.md
- Sidecar: /var/tmp/lane53-a2clean-qi6W/report.md.identity.json
- Scratch: /var/tmp/lane53-a2clean-qi6W/scratch
