# collect-from-origin-1 — lead rulings (win over spec.md where they differ)

Base ac9c842+05b9bcc: origin/main 0.20.10 merged with build/one-launch-1 (skills-fable ruling, note collect-from-origin-2). If Ben declines one-launch, C2 is redone on main. Integration worktree /home/ben/Code/wt-collect-1 on build/collect-from-origin-1.
Territories: C1 (scripts/collect-from-origin.mjs, scripts/collect-from-origin.test.mjs, fixtures under
scripts/fixtures/collect-from-origin/ if any, docs/census.md) and C2 (skills/team-build/SKILL.md,
skills/decisions/SKILL.md, skills/decisions/templates/decision-item.md). Nothing else. Off-limits:
scripts/build-census.mjs, work-record.mjs, four-read.mjs, janitor.mjs, hooks/, .codex-plugin/, README.md.

R1 (C1 CLI, pinned): `node scripts/collect-from-origin.mjs [--repo <dir>] [--main <ref>] [--no-fetch] [--json]`,
default --main origin/main. Row fields (JSON keys, in this order): branch, tipSha, tipDate, recordPath,
status, artifactSha, merged (boolean|null when no artifact sha), hoursSinceLog (number|null), state
(accepted-unmerged | accepted-merged | owned | rejected | no-record; any other Status maps to owned
unless it is accepted/rejected). A branch with several changed records yields one row per record.
"Changed" = the record's blob on the branch differs from main's, or main lacks it. Exit 0 always,
including when fetch fails (then a stderr warning and it proceeds with local refs). Protected names
skipped: main, HEAD, and any branch named in --skip (repeatable). Reads only via git plumbing
(for-each-ref, show, cat-file, merge-base --is-ancestor, log -1, diff --name-only/ls-tree); no
checkout, no write, no temp files. <= 60 runtime lines (comments and blanks not counted).
Artifact sha: the 40-hex after `@` in `Artifact:`, or a bare 40-hex; anything else -> artifactSha null,
merged null, and state accepted-unmerged if Status is accepted (unknown is never shown as merged).

R2 (C1 docs): three sentences in docs/census.md (spec item 3); the builder says why census.md over the
bearings template in its report.

R3 (C2): as spec C2 items 1-3. The decisions route is `notion.js edit` anchored edits already described
in skills/decisions/SKILL.md; do not invent a new command. Merge item title
`Merge <branch> into main (<tip sha>)`; evidence line carries the record's four numbers (four-read) and
the census leadTurns; options merge-now / merge-and-release / hold; `No default: merges to main take your
word per item`. Keep additions short; the team-build rule is one step in the accept sequence, not a section.
Note build/one-launch-1 (unmerged) also rewrote skills/team-build/SKILL.md: this base already carries one-launch's SKILL.md; edit against it and
keep the change a small, local insertion so the later conflict pass is trivial.

R4 (integration dogfood): after the sealed suite, the integrator also runs
`node scripts/collect-from-origin.mjs --repo /home/ben/Code/claude-delegation --json` (read-only; the
fetch is allowed) from the integration worktree's copy of the script, and puts the table in its report.

Gates: C1 `node --test scripts/collect-from-origin.test.mjs`; C2 the tests that read the three C2 files
(grep for readFileSync of them). Integration: `node scripts/run-tests.mjs`; known base failures H6
(note-send) and V4 (mirror-shim) may still fail on ac9c842 — gate is no new failure vs base, compared by
failing test name. Reviews: Opus with a JUDGMENT: line; C1 attack brief per spec Acceptance (make the
collector call an unmerged branch merged: tip equals main, artifact sha missing, record on main with a
later Status; prove it never writes). Every agent: never send peer notes, never set a git identity,
no destructive git, never push; a denied command stops the step and is reported, never routed around.
