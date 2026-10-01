# C2 round 2: findings from the lead's mechanical verification, at 1b8f23d0a66706851dafba7781035d827563809c

Two Opus re-reviews stopped without a verdict: a safety classifier withheld their output while they were building delete-shaped probe strings. The lead instead ran the round-1 reviewer's own probe harness (C2-review/r1/probe.mjs, unchanged) against the new guard. Output: reports/C2-r2-probe-out.txt.

## Evidence
- Territory tests: 197 of 197 pass (Opus verification reviewer, step 1).
- Probe results:
  - 89 ok, 0 new bypasses;
  - 14 bypasses the base guard also allowed (F7, out of scope);
  - 3 false refusals, all by design under R1: an unquoted `<<EOF` report, `<<-EOF`, and `git commit -m "$(cat <<'EOF' ...)"`.
- Timing, 160-900 KB inputs of the round-1 perf shapes: 1-212 ms, well under 1 s.
- The spec's false-positive shapes:
  - FP2, a quoted grep: passes.
  - FP3, a quoted ssh remote grep: passes.
  - `tee report.md <<'EOF'`: passes.
  - `cat > report.md <<'EOF'` alone: passes (suffix probe).

## N1 (medium): R1 condition 5 is not enforced
A quoted-delimiter heredoc with a recursive delete in its body passes, whether written with `cat > f`, `tee f` or `cat <<'EOF' > f`, even when f ends in .sh, .py, .mjs, .SH, .ps1 or .md.sh. Repro: reports/C2-r2-suffix-probe.mjs.txt. All 24 cases pass. R1 requires a refusal when the target's name ends in .sh, .bash, .zsh, .ps1, .psm1, .cmd, .bat, .py, .js, .mjs or .cjs.

Fix:
- Enforce condition 5 in findHeredocSafeSpans for every allowed shape (`cat >`, `cat >>`, `tee [-a]`, and the redirect before or after the `<<`).
- Compare case-insensitively, and on the final suffix only (`x.md.sh` refuses, `x.sh.md` passes).
- Add one test per suffix, covering the three head shapes.
- Keep the whole probe result above unchanged. The lead re-runs the harness after the fix.
