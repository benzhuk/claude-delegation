VERDICT: DONE 7db6691675c462c48aae2c1e0636f3e58d3fac8c

# Lane 28, render-guard — Territory B report

Branch: build/render-guard-1 (worktree C:/Users/benzh/Code/render-guard/wt), base 53a77f7.
Commit: 7db6691675c462c48aae2c1e0636f3e58d3fac8c.

## Files changed (exactly the pinned territory)
- skills/decisions/scripts/decisions-render-publish.mjs
- skills/decisions/scripts/decisions-render-publish.test.mjs
- skills/decisions/SKILL.md (publish exit list only)
- skills/multi/scripts/note-send.mjs (exit-6 JSON hint line only)
- skills/multi/scripts/note-send.test.mjs (the two pins)
- decisions-render.mjs: NOT touched — its usage line does not change (no new flag added),
  so per the territory's own rule it stayed out of scope. See "Open questions" in
  pack/reports/B-state.md for the one consequence of that (a cosmetic dry-run-warning gap
  in the live CLI, not the exit-7 refusal itself).

## Fix 1 — publish refuses a dirty docs/decisions tree (decisions-render-publish.mjs)
`checkDecisionsTreeClean()` (decisions-render-publish.mjs:325-349) is called at
publish():362-366, right after step 1's fresh read and before step 2, ahead of every
check and write. It runs `execGit(['status', '--porcelain', '--', 'docs/decisions'],
repo)`, drops any entry equal to `docs/decisions/last-render.md`, and:
- Clean → returns, no-op.
- Dirty, not `--dry-run` → throws `PublishError(7, ...)` with the pinned message verbatim
  ("publish renders only what origin/main holds. Commit and push the listed files if they
  are intended, otherwise git restore -- <files>, then rerun.") plus the file list; if the
  checkout is also off main, the same exit-2 detail text (`mainCheckDetail()`/
  `mainCheckMessage()`, factored out of the existing `checkOnMain` with no behavior change
  to its own exit-2 callers) is appended rather than a separate exit 2.
- Dirty, `--dry-run` → writes `warning: <message>\n<list>` to `deps.writeErr` (new dep,
  defaults to a no-op like `deps.write`) and continues; the render still prints.
No bypass flag was added.

## Fix 2 — the exit-6 JSON hint (note-send.mjs:537-544)
Changed byte for byte to: `run note-send on the recipient's machine over ssh: ssh
<user@host> '~/.local/bin/note-send ... --packet-file -' < packet.md; pass --local-ok if
this machine's ledger is what the recipient reads` — no more `--sender-host <this host>`,
which is a no-op for a local run. Both test pins (note-send.test.mjs:1115 area, `err.hint`
and the `failureJson` deepEqual) updated to match, plus a `doesNotMatch(/--sender-host
<this host>/)` and `match(/--packet-file -/)` guard per the acceptance list.

## Acceptance checklist (spec.md line 25)
- exit 7 for a modified file — decisions-render-publish.test.mjs, "Fix 1 — a modified
  file under docs/decisions is exit 7, the message names git restore"
- exit 7 for a staged file — "Fix 1 — a staged file under docs/decisions is exit 7"
- exit 7 for an untracked file — "Fix 1 — an untracked file under docs/decisions is exit 7"
- lane-branch caller, clean tree → still exit 2 — "Fix 1 — a lane-branch caller with a
  clean docs/decisions tree still gets exit 2 (not exit 7)" (also already covered by the
  pre-existing F6 test at decisions-render-publish.test.mjs:368)
- dirty + off main → exit 7 with list and exit-2 detail — "Fix 1 — dirty docs/decisions
  AND off main is exit 7 with the list and then the exit-2 detail"
- --dry-run warns on stderr, still prints the render — "Fix 1 — --dry-run warns on
  stderr for a dirty docs/decisions tree and still prints the render"
- last-render.md alone dirty is not exit 7 — "Fix 1 — last-render.md alone dirty is
  exempt (step 8 writes it), a clean run still succeeds"
- exit-7 message contains `git restore` — asserted in every Fix 1 exit-7 test above
- exit-6 JSON hint does not contain `--sender-host <this host>`, does contain
  `--packet-file -` — note-send.test.mjs, both new `doesNotMatch`/`match` assertions
- SKILL.md publish exit list gains 7 — skills/decisions/SKILL.md:87-96, one new sentence
  right after the existing exit 3/4 paragraph
- Live proof in the record (real page, real note-send, second-host sealed suite): NOT
  run here — the brief reserves this for the lead; nothing here calls Notion, pushes, or
  runs a live note-send.

## Gate
`node --test skills/decisions/scripts/*.test.mjs skills/multi/scripts/note-send.test.mjs
skills/multi/scripts/hooks.test.mjs` → 620 pass, 0 fail, exit 0.
Log: C:/Users/benzh/Code/render-guard/pack/reports/B-gate.log
Also spot-checked (not part of the pinned gate, but touching adjacent territory):
skill-text.test.mjs 14/14 green (SKILL.md's pinned substrings unaffected by my one added
sentence); decisions-render.test.mjs 64/64 green (untouched file, re-export surface intact).

## Deviations / assumptions
- decisions-render.mjs's `run()` already threads a `writeErr` param but never wires it
  into `publishDeps` — only `write` is passed through today. Since Fix 1 adds no CLI flag,
  the usage line is unchanged, so per this territory's own boundary I left that file alone
  rather than adding the one-line `writeErr,` wiring. Consequence: the exit-7 refusal
  itself works end to end through the real CLI; only the `--dry-run` preview's stderr
  warning would currently no-op live (defaults to a no-op) until that one line is added,
  either by the lead or a lane that legitimately touches decisions-render.mjs's usage.
  Flagged in pack/reports/B-state.md under "Open questions".
- No bypass flag was added for Fix 1, per the pinned rule ("every bypass flag is a rule
  that is not mechanical").
- Tests never call Notion or push; every git call in decisions-render-publish.test.mjs
  goes through the existing `deps.execGit` fake; note-send.test.mjs never spawns a real
  child process for the paths touched here.

No push, merge, release, README edit, chezmoi, git-identity change, or trailer was made.
