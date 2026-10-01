VERDICT: PASS

Territory: J3 — one paragraph in the release/install procedure doc naming the
post-install verification step.

## What changed

File: `README.md`, lines 235 (one new paragraph, plus a blank line separating it
from the preceding paragraph and the following `## The philosophy, in four lines`
heading). Inserted at the end of the `## Install (mirror for Codex)` section
(README.md:225-233 in the base sha), immediately after the existing
`mirror-shared-skills.mjs` publish paragraph.

Exact paragraph added, verbatim:

> After installing a release on a host, run `node scripts/wiring-check.mjs --line` on that host and report its line and exit code, so the install is verified that same day rather than assumed clean.

## Location choice

Followed the scout's recommendation (scout-J3.md) without deviation: README.md's
`## Install (mirror for Codex)` section is the spec's own named fallback target,
since no dedicated release-checklist doc exists in `docs/`. Did not touch
`docs/census.md` (confirmed on read: it's a measures/definitions doc, not an
install runbook — worse fit than README) or `docs/GOALS.md` (out of scope per
brief's NOT list; see open question below).

## Gate

Command: `grep -n "wiring-check.mjs --line" README.md`
Output (also saved to J3-gate.log):
```
155:- **Wiring check** (SessionStart — `scripts/wiring-check.mjs --line`): prints one line
235:After installing a release on a host, run `node scripts/wiring-check.mjs --line` on that host and report its line and exit code, so the install is verified that same day rather than assumed clean.
```
Exit code 0. Gate PASS.

## Out of scope, not touched

- No code files (scripts/install-janitor-timer.mjs, scripts/wiring-check.mjs,
  scripts/required-wiring.default.json) — untouched, as instructed.
- README's Changelog section — untouched.
- docs/GOALS.md — untouched, per the brief's explicit NOT list.

## Finding for the lead (not acted on)

The scout flags an open question: docs/GOALS.md:92's `Status: PARTIAL` line
currently states "Wiring check cannot go red" as a fact for the four-host-install
goal. Once J2 lands (making the wiring check able to go red) and this J3
paragraph lands (giving a mechanical per-host verification step), that status
prose may become stale. GOALS.md status changes are gated ("Status changes only
in a release commit, with evidence" per its own header) and the territory map
does not list docs/GOALS.md's status text as J3's file, so I left it as-is per
the brief's explicit instruction. Flagging for the lead to rule on whether a
follow-up territory or release commit should update that status line.

## Worktree / branch

Worktree: /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J3
Branch: build/janitor-daily-1-J3
Commit: docs: add wiring-check verification step to install section
HEAD sha: e7765386e6767a6ec91fabc4138b8754ddcd07a5

Worktree left in place for the lead/integrator; not removed (removal is the
lead's own standalone command per instructions).
