VERDICT: NEEDS_FIXES (1) d254f7263b6e31ba00b32acd64d0c9828aca2040

# C3 review, round 1 (collect-status-1)

Reviewed: `/home/ben/Code/wt-collect-status-1-C3`, branch `build/collect-status-1-C3`, HEAD
`d254f7263b6e31ba00b32acd64d0c9828aca2040` (`git rev-parse HEAD`, run by me). The territory diff is the
single commit `31a23e2..d254f72`: 7 files. The code files are `scripts/required-wiring.default.json` (+10),
`scripts/wiring-check.test.mjs` (1 line), `skills/continue/SKILL.md` (+4) and
`scripts/continue-skill-lane-state.test.mjs` (new, 46 lines). The rest are the report, state and gate log.
Worktree clean. I changed nothing in the reviewed tree. All mutation checks ran on scratch copies (`git archive HEAD`).

## Gates I re-ran

- Territory gate: `node scripts/run-tests.mjs scripts/wiring-check.test.mjs scripts/continue-skill-lane-state.test.mjs`
  gave 62 pass, 0 fail.
- The full sealed suite `node scripts/run-tests.mjs` in the worktree exited 0: 2307 tests, 2303 pass,
  0 fail, 4 skipped. The new test file is picked up by the runner's walk (`scripts/run-tests.mjs:38`,
  every `*.test.mjs`), so it is in the sealed suite without being listed anywhere.

## Findings

### F1 MAJOR: the new `collect-status-fresh` row is pinned by no test (the check passes because it isn't looking)

Evidence: `scripts/required-wiring.default.json:135-144` adds the row. The only test that touches it
is the count bump at `scripts/wiring-check.test.mjs:732` (`list.length === 18`). Every other shipped row
has its fields pinned in that same test (`scripts/wiring-check.test.mjs:733-774`). The row this one is
modelled on, `janitor-last-run`, is pinned at :769-774 and also has a state-table test at :866-894. The
new row has neither. I measured this with four separate mutations of the row, each run on a scratch copy against
`wiring-check.test.mjs` plus `continue-skill-lane-state.test.mjs`:

| Mutation of the new row | Result |
|---|---|
| `maxAgeSeconds` 2700 changed to 27000 | 62 pass, 0 fail |
| `requiresFile` `~/.agents/collect/installed.json` changed to `~/.agents/collect/install.json` | 62 pass, 0 fail |
| `file` `~/.agents/collect/claude-delegation/status.json` changed to `~/.agents/collect/status.json` | 62 pass, 0 fail |
| `id` `collect-status-fresh` changed to `collect-fresh` | 62 pass, 0 fail (SKILL.md still names the old id, and nothing links the two) |

The only drift that goes red is `requiresFile` changed to the janitor's `~/.agents/janitor/installed.json`. It
fails 3 tests, and only by accident: the "fully-wired scratch home" fixture (`wiring-check.test.mjs:62`) writes the
janitor's installed.json, so the check flips to `missing` there. Nothing actually asserts the value K1 pins.

This matters for the reviewer brief's C3 question: "does the new row's `requiresFile` path match the
ACTUAL path C2's installer writes". Today it matches only because I read it by eye. A later edit to any
of the three K1 literals would ship green. The spec wants this to be "a checked fact, not prose", and this is
the half of it that nothing checks.

Fix. This stays inside C3's territory, because the brief forbids further edits to `wiring-check.test.mjs`.
Append this test to `scripts/continue-skill-lane-state.test.mjs`, after the last `});` at line 46.
`fs`, `path`, `HERE` and `STATUS_MD_PATH` are already in scope there:

```js

const WIRING_PATH = path.join(HERE, "required-wiring.default.json");

test("required-wiring.default.json's collect-status-fresh row carries contracts.md K1's exact literals, in the same directory as the SKILL.md path", () => {
  const list = JSON.parse(fs.readFileSync(WIRING_PATH, "utf8"));
  const rows = list.filter((c) => c.id === "collect-status-fresh");
  assert.equal(rows.length, 1, "exactly one collect-status-fresh row");
  const row = rows[0];
  assert.equal(row.type, "file_fresh");
  assert.equal(row.file, "~/.agents/collect/claude-delegation/status.json");
  assert.equal(row.maxAgeSeconds, 2700);
  assert.equal(row.whenMissing, "missing");
  assert.equal(row.requiresFile, "~/.agents/collect/installed.json");
  assert.equal(path.posix.dirname(row.file), path.posix.dirname(STATUS_MD_PATH), "the wiring check and the lead's rule must name the same collector directory");
});
```

Result, measured on a scratch copy: with the row unchanged, 3 pass and 0 fail. Each of the four mutations above
now gives 2 pass and 1 fail. The new test uses no fs writes and no temp home, so it complies with contracts.md
Process (cleanup only through the makeTempHome helpers). Optional, not required: add a state-table test modelled
on `wiring-check.test.mjs:866-894`, covering no installed.json (info), installed.json with no status (missing),
status older than 2700 s (stale) and fresh (ok). It would have to go in this new file, using its own temp-home
helper. The field pin above is what closes F1.

After the fix, the builder should re-run the brief's gate command
(`node scripts/run-tests.mjs scripts/wiring-check.test.mjs scripts/continue-skill-lane-state.test.mjs`).
The predicted result is 63 pass, 0 fail.

### N1 MINOR, advisory for the lead or the seam review, not a C3 defect: the 2700 s bound conflicts with `--every` above 45

K1 pins `maxAgeSeconds` at 2700, and the builder used exactly that. The spec's own reasoning is three intervals
at the default 15 minutes. K3 lets `--every` go up to 60. A host installed with `--every 50` or more is therefore
`stale` (red) for part of every cycle, by design. This is a limit of the spec and contract, not a C3 error. There
are two ways to address it: rule `--every` at most 15 while the row stays at 2700, or accept the limit and state it in
the row's `why`. No builder action is required in this round.

### N2 MINOR, optional: the SKILL.md paragraph names only this repo's path

`skills/continue/SKILL.md:45` says "for this repo that is `~/.agents/collect/claude-delegation/status.md`".
The continue skill ships with the plugin and is used from other repos too. A lead working in another repo
would need the general form, `~/.agents/collect/<repo basename>/status.md` (contracts.md K1). If the builder adds it,
the change is to insert "(in general `~/.agents/collect/<repo basename>/status.md`)" after "the file the collector
writes and the lead reads". Both fixture assertions still pass, because they look for the literal
claude-delegation path, which stays. This is optional and does not affect the verdict.

## Areas I checked and found no defects

- **The count bump lands at exactly the right number.** The list has 18 entries: the test asserts 18
  (`wiring-check.test.mjs:732`) and passes. Nothing else in that file changed. `git diff 31a23e2 HEAD --
  scripts/wiring-check.test.mjs` is one line, the number plus its message string, which is what the brief
  pre-authorized. The test title still says "gained exactly eight new checks". That is now slightly stale, but
  the brief did not authorize editing it, so this is not a finding.
- **The `requiresFile` path against K1 and C2.** `~/.agents/collect/installed.json` is the collect job's own
  file, not the janitor's `~/.agents/janitor/installed.json`. This matches contracts.md K1 byte for byte. C2
  has no commit yet: `/home/ben/Code/wt-collect-status-1-C2` is still at `31a23e2`, and its work is
  uncommitted. Its in-progress header comment (`scripts/install-janitor-timer.mjs:9`) names
  `~/.agents/collect/installed.json`. However, the uncommitted install path at :588-590 still builds only
  `~/.agents/janitor/installed.json`. I cannot verify C2's delivered path from here. The seam review must
  check that C2's final code writes `~/.agents/collect/installed.json`. F1's fix pins the C3 side.
- **Whether the check mechanism supports the row.** `expandHome` (`scripts/wiring-check.mjs:65`) expands
  `~` only, so K1's literal-path ruling was the correct choice. `requiresFile` gating (`wiring-check.mjs:285-293`)
  forces `info` when the gate file is absent, and `whenMissing: "missing"` matches the janitor row. The row
  passes validation, since the full suite is green.
- **Whether the fixture test bites.** I ran mutations on a scratch copy of `skills/continue/SKILL.md`. Dropping the
  paragraph fails 2 of 2 tests. Changing `status.md` to `status.json` in the paragraph fails 2 of 2. Removing "never
  lane-by-lane from peer notes" fails 1 of 2. Changing the ssh form fails 1 of 2. The test genuinely checks the
  paragraph's content. The builder judged that the `goal-card` precedent does not transfer and cited real SKILL.md
  content fixtures instead (`janitor.test.mjs`, `work-record.test.mjs`). That judgment is sound.
- **The paragraph against the spec.** It says once per wave, never from peer notes, and gives the
  `ssh <collector host> cat <path>` form. It names the default path and points at `collect-status-fresh`.
  Everything the spec's C3 section requires is present.
- **Leaving `docs/GOALS.md` untouched.** This is correct and conservative. No measure is named
  lead-cost. The nearest candidate is "The lead spends judgment, not turns" (`docs/GOALS.md:49-56`), which
  measures turns only. There is a further reason the builder did not cite: `docs/GOALS.md:3` says "Status
  changes only in a release commit, with evidence". Editing a status sentence in a territory build commit would
  break that rule. Adding nothing was the right outcome.
- **Attack-brief items about shell, systemd, the envelope, double-wake, fetch failure and `--job` byte
  drift.** None apply: C3 adds JSON and markdown only, with no shell or scheduler surface. I skipped them for that reason.

## C4 fields

Cause: The new wiring row was added with only a list-length assertion, and no test pins its K1 literals
(`file`, `maxAgeSeconds`, `requiresFile`, `id`). A drift in any of them ships green.
Discriminating check: On a scratch copy, changing `maxAgeSeconds`, `requiresFile` (to a typo), `file` or `id`
in `scripts/required-wiring.default.json:135-144` still gives 62 of 62 green. With F1's patch applied, each of
those mutations gives 1 failure.
Fix location: `scripts/continue-skill-lane-state.test.mjs`, a new test appended after line 46. The text is in F1 above.
Simplification: A single read-only field-pin test in the file C3 already owns. No new helper and no edit to
`wiring-check.test.mjs` beyond the pre-authorized count bump.
