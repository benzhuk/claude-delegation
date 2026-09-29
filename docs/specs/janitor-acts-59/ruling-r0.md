# Lane 59 lead ruling r0: the spec red-team (redteam.md), adopted in full

Input: docs/specs/janitor-acts-59/redteam.md, NEEDS_FIXES (17) on spec.md.

Every finding, F1 to F17, is adopted. Each finding's "Fix" text is part of the spec and replaces or extends the spec text it names. Where a finding's fix and spec.md disagree, the finding wins.

Specific rulings:
- **F1:** adopt the 24 h idle floor exactly as written: `idleHours(wtPath, {home, now})` and the ~/.claude/projects slug.
  - Evidence it is needed: the one-time sweep of 9/29 removed five Orca workspaces on Windows. See docs/work/evidence/janitor/2026-09-29-sweep.md when it lands.
  - The floor applies to BOTH the daily act run and reclaim's W class.
- **F2:** adopt as written. The record is written after apply. Each removal row carries its sha and a restore hint.
- **F3 to F8, F11 to F14, F16, F17:** adopt as written.
- **F9:** Codex has `prefix_rule(pattern = ["reclaim"], decision = "allow")`.
  - The mirror script prints that line.
  - With `--write-allow`, it may add the line to the Codex rules file only under the same conditions as the Claude file: the file exists, the line is absent, the file is not chezmoi-managed, the write is atomic and mode-preserving, and a backup is written outside the config dir.
  - If the Codex rules path is not certain on a host, print only.
- **F10:** the Claude rule form is `Bash(reclaim *)`. The builder adds the probe tests that F10 lists. The compound-command case is recorded as documented behavior, not as a claim.
- **F15, the cuts, adopted:**
  - no `--record-only` installer flag (the kill-switch file is the only off switch);
  - no janitor export work, since the functions are already exported;
  - no `--json` on reclaim.

Territories, re-drawn after F15. Each file has exactly one owner.
- **T1 (Sonnet):**
  - scripts/path-safety.mjs and its test (new);
  - scripts/reclaim.mjs and its test (new), whose W and B classes call janitor.mjs's existing exports plus T2's `idleHours`, coded against the pinned signature;
  - scripts/work-record.mjs, only the refactor onto path-safety;
  - work-record.test.mjs, imports only.
- **T2 (Sonnet):**
  - scripts/janitor.mjs and janitor.test.mjs: F1 `idleHours` exported, F2 records, F14 kill switch, F16;
  - scripts/install-janitor-timer.mjs and its test;
  - scripts/mirror-shared-skills.mjs and its test: the F12 shim, and the F9, F10 and F11 allow lines;
  - skills/janitor/SKILL.md;
  - docs/subagent-contract.md: the F13 convention.

Pinned seam: `export function idleHours(wtPath, { home, now = Date.now() }) -> number` in janitor.mjs. T2 writes it first and commits it early. T1 imports it.

Gates: each builder runs its territory tests, and the full suite once at the end. The integrator runs the full suite on Linux and Windows.

No builder touches any real host's settings, timer or worktrees. Every test uses fixtures under its own mkdtemp.
