Territory: J3 — one paragraph in the release/install procedure doc naming the
`wiring-check.mjs --line` post-install verification step.

Contracts I rely on:
- docs/specs/janitor-daily-1/contracts.md territory map: J3 = "a single paragraph
  added to the release/install procedure doc the scout names (docs/census.md,
  docs/GOALS.md, or the README install section, but never its changelog); no code."
- scout-J3.md: recommends README.md `## Install (mirror for Codex)` section
  (README.md:225-233 at base sha) as the spec's own fallback target; confirmed
  no dedicated release-checklist doc exists.

Done:
- Added one paragraph at the end of README.md's `## Install (mirror for Codex)`
  section (now README.md:235), naming `node scripts/wiring-check.mjs --line` and
  instructing to report its line and exit code per host.
- Committed on branch build/janitor-daily-1-J3, commit e7765386e6767a6ec91fabc4138b8754ddcd07a5.
- Gate run and passed: `grep -n "wiring-check.mjs --line" README.md` exits 0,
  matches at README.md:155 (existing SessionStart mention) and README.md:235
  (new paragraph). Log at reports/J3-gate.log.

Next: none — territory complete as scoped.

Open questions:
- docs/GOALS.md:92 `Status: PARTIAL` prose says "Wiring check cannot go red,"
  which may go stale once J2 + this J3 paragraph land. Flagged in
  J3-builder.md for the lead; NOT edited (out of scope per brief's NOT list;
  GOALS.md status changes are release-commit-gated).

How to run my gate:
```
grep -n "wiring-check.mjs --line" README.md
```
Expect exit 0 and two matches: line 155 (pre-existing) and line 235 (this
paragraph).
