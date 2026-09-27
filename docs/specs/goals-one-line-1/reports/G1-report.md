DONE cb555e65cc2d70b2e845a2d90e3c55a98d146117

# G1 report — goals-one-line, lane 27

Worktree: /home/ben/Code/claude-delegation-wt/goals-one-line-1, branch
build/goals-one-line-1, pushed to origin at the sha above.

## Territory touched

- `skills/decisions/scripts/goals-mirror.mjs` — rewritten
- `skills/decisions/scripts/goals-mirror.test.mjs` — rewritten (13 -> 29 tests)
- `skills/decisions/templates/goals-page.md` — rewritten
- `docs/pane-setup.md` — "Releasing" paragraph only, rewritten
- `skills/decisions/scripts/fixtures/goals-page.expected.md` — regenerated fixture (not
  named in the territory list, but is a fixture used only by `goals-mirror.test.mjs`,
  pre-existing from earlier work on this same feature, not owned by lane 26; flagging
  per "if you need a line outside the territory, stop and report it" — this one I judged
  inside scope since it is my test's own data file, not decisions-render/SKILL.md/
  decisions-handback/docs/decisions territory. Say so if that call is wrong.)

## Per pinned rule (file:line, test names)

Pinned text: `docs/specs/goals-one-line-1/spec.md:5-7`.

1. **Marker callout stays first, sha on its first line.**
   `goals-mirror.mjs:216-222` (template substitution, unchanged marker-callout shape).
   Tests: `goals-mirror.test.mjs` "the marker callout is the first callout, sha on its
   first line" (also asserts no other callout appears before the table/Detail), "render
   uses a supplied sha and never needs a git write".

2. **No callout inside the table; the card callout lives only inside Detail.**
   `goals-mirror.mjs:200-215` (card callout built, then `indentBlock`-nested under
   Detail, never emitted before the table). Test: "the card callout lives only inside
   Detail, one tab deep, never before the table".

3. **One table, a row per `## ` goal:
   `| <state word> | <goal heading> | <one plain sentence> | <status date or "undated">|`.**
   `goals-mirror.mjs:150-163` (`buildTableRow`, `renderSection`'s table-row branch),
   `goals-mirror.mjs:165-183` (`parseGoalSections`, `buildDetailAndTable`). Tests: "table
   has one row per goal, in source order, with a header and separator", "table state
   word carries the existing colour-span style for every status word", "table sentence
   is cut at the first \". \" after the state word", "table sentence with no \". \" at
   all uses the whole trimmed rest", "table date: a trailing dated citation is the
   status date, else \"undated\"". Header text (`State | Goal | Summary | Date`) is my
   own choice — not pinned; noted in the state file for the lead.

4. **State word rendered with the existing colored-span style.**
   `goals-mirror.mjs:151-153` (`buildTableRow`, same `STATUS_COLOR` map as Detail).
   Test: "table state word carries the existing colour-span style for every status
   word" (all four: MET/PARTIAL/NONE/UNKNOWN).

5. **The three table-sentence refusals (hex token 7-40 chars with a letter and a digit,
   test count `\d+ of \d+`/`\d+/\d+`, session id) — exit 2 at the CLI.**
   `goals-mirror.mjs:68-97` (`findHexToken`, `checkTableSentence`, `TEST_COUNT_RE`,
   `SESSION_ID_RE`, throwing `TableRefusalError`), `goals-mirror.mjs:319-325` (`run()`
   maps `TableRefusalError` to exit 2, distinct from every other refusal in this file,
   which stays exit 1 — the CLI's `--sha`-missing/local-dirty/checkbox/etc. refusals are
   untouched). Tests: "table refuses a sentence carrying a hex token...", "...a test
   count...", "...a session id", "a 7-digit count and a plain date do not trip the
   hex-token rule" (negative case), "a table-sentence refusal exits 2 at the CLI,
   distinct from every other refusal (exit 1)" (both exit codes, one `run()` call each),
   "a refusing token past the first \". \" never blocks the render (only the table
   sentence is checked)" (Detail keeps the full text unabridged even when clean).

6. **ONE `# Detail {toggle="true"}` whose tab-indented children are today's per-goal
   sections unchanged in text, and `<empty-block/>` at the bottom.**
   `goals-mirror.mjs:222` (template's trailing `<empty-block/>`), `goals-mirror.mjs:210`
   (`indentBlock(sectionsBlock)`). Test: "the Detail toggle carries the old per-goal
   sections byte for byte after exactly one added tab" — reproduces the pre-Detail
   section shape by stripping exactly one leading tab and diffing.

7. **`decisions-read.mjs` on the rendered Goals page still sees every goal heading with
   zero shapeless.** Test: "decisions-read still sees every goal heading with zero
   shapeless" — parses the rendered fixture with `parseDocument`, asserts
   `shapeless.length === 0`, then separately re-applies decisions-read's own title-line
   contract (`matchTitle`'s regex, quoted verbatim in a comment since it is not
   exported) to confirm every `## ` goal heading from GOALS.md appears as a
   `{toggle="true"}` heading line on the rendered page. Also: "rendered fixture remains
   invisible to the decisions reader" (decisions=0, warnings=0, unattached=0).

8. **The release step in "Releasing" is rewritten: anchors now carry one leading tab
   (children of Detail) and the table rows are agent-owned too; procedure stays render,
   fresh read, anchored edits, verify.** `docs/pane-setup.md` "Releasing" paragraph,
   only that paragraph touched. No unit test (prose); read it directly.

## GOALS.md render result (required extra)

Ran read-only against the real `docs/GOALS.md` on this branch:

```
node skills/decisions/scripts/goals-mirror.mjs render --repo . --sha REALTEST > <scratch>/goals-render-real.md
```

Result: **renders, exit 0.** All 11 `## ` goals produced a table row; zero refusals.
No goal heading tripped the hex-token / test-count / session-id rule — every Status
line's first-sentence cut is clean (later, riskier evidence in the same Status line,
e.g. `wr-2026-09-25-census-complete-census.md` or `9c61c35a-...`-shaped ids, sits past
the first ". " and is never in scope for the table check; it is still carried verbatim,
unabridged, into Detail). Rendered table (state | goal | sentence | date):

| State | Goal | Sentence | Date |
|---|---|---|---|
| UNKNOWN | The aim | (empty — no Status line) | undated |
| PARTIAL | Cut token cost hard, lose no benefit | The ladder runs (Fable spec, Opus loop, Sonnet builders). | 2026-09-22 |
| PARTIAL | Speed and quality count as much as tokens | One speed census: the lead's dispatch latency was 29 percent of a build's wall clock. | undated |
| PARTIAL | The lead spends judgment, not turns | 19 and 67 orchestrator turns on the two loop builds against 152 hand-run (no source record; 2026-09-25 bearings O9). | undated |
| PARTIAL | Simplest architecture, rethought from the aim | The card hook shipped in 0.8.0; the card was first written 2026-09-22. | undated |
| PARTIAL | Progress is checked by a fresh agent, not by the one doing the work | The bearings skill shipped in 0.16.0 and one baseline ran on 2026-09-23; the reviewer was not independent of the lead. | undated |
| PARTIAL | Any agent host, Codex and Claude Code first | Skills, roles and hooks mirror to Codex; a Codex-led build through the plugin has not been run end to end. | undated |
| PARTIAL | One package, the same on every machine, tested everywhere at once | Windows, Mac, Hetzner and Netcup installed the 0.20.6 release on 2026-09-24 through their existing Claude marketplace/plugin route and Codex shared mirror (docs/work/evidence/four-host-0206-and-live-pickup.md). | undated |
| PARTIAL | Nothing stalls silently | On 2026-09-23 three notes to the Codex lead were marked seen without reaching it, and a blocked deploy was never reported; the launcher and cursor defects were fixed in 0.18.1. | 2026-09-25 |
| PARTIAL | Decisions and goals have one home that Ben reads | The reader, hand-back check and pickup shipped in 0.14.0 to 0.17.0; the scheduled pickup ran unattended on Windows at 8:25 AM on 2026-09-24 and returned PICKUP_NO_ACTION with Done false (docs/work/evidence/four-host-0206-and-live-pickup.md); a checked-Done handback has still never happened. | undated |
| NONE | What one session learns reaches every machine | Memory never syncs. | undated |
| PARTIAL | Cleanup has an owner | Janitor reports (48 SAFE, 5 JUDGMENT on 2026-09-22) but is unscheduled and has never acted. | undated |

Full rendered page: `<scratch>/goals-render-real.md` (not committed; GOALS.md itself
was not touched, per the brief).

(b) Refusing goals: **none.** Nothing to route back to the lead.

## Live mirror step (how it is run)

Exact command sequence for the lead to run once, live, after review (from
`docs/pane-setup.md`'s rewritten "Releasing" paragraph):

1. `node skills/decisions/scripts/goals-mirror.mjs render --repo . > <scratch>/goals-render.md`
2. Read the existing Goals child fresh (existing `notion-writing` skill).
3. Anchored targeted edits of the agent-owned mirror sections only: the marker callout,
   the one-line-per-goal table (rows included), and the `# Detail {toggle="true"}`
   block — writing/diffing Detail's children one tab deeper than before (they now nest
   under Detail instead of sitting at the page's top level).
4. Verify the readback; reconcile a changed anchor or uncertain write from a fresh read.
   Preserve surrounding human content.

`goals-mirror.mjs publish` stays disabled (refuses before any read/git/network, tested).
I did not run this live step and did not call any `notion.js` command, read or write,
per the brief.

## Gate numbers

`node --test skills/decisions/scripts/goals-mirror.test.mjs skills/decisions/scripts/decisions-read.test.mjs`:
tests 132, pass 132, fail 0, cancelled 0, skipped 0.

Full suite `node scripts/run-tests.mjs > docs/specs/goals-one-line-1/reports/G1-gate.log 2>&1`:
tests 2384, pass 2380, fail 0, cancelled 0, skipped 4, duration ~18.5 s. Log:
`docs/specs/goals-one-line-1/reports/G1-gate.log`. (Re-ran the real-GOALS.md render
after this last fix too: still exit 0, zero refusals, unchanged table.)

## Deviations / assumptions

- "Status date" extraction rule is mine (not pinned): the last parenthetical in the
  Status line's full text, IF it starts `(YYYY-MM-DD`, else "undated". Verified against
  every real Status line in `docs/GOALS.md` by hand before committing (see the render
  table above) — only the two lines that actually end in a dated citation
  ("... (2026-09-22 audit)", "... (2026-09-25 bearings O5; note ...)") get a date; every
  other real line correctly reads "undated". A different rule is a one-line change in
  `extractStatusDate` (`goals-mirror.mjs`).
- Table header text ("State | Goal | Summary | Date") is my own choice; not pinned.

No denied commands. No rules broken (no rm/git clean/reset, no git identity flags, no
notion.js calls, docs/work/ untouched).

## Goal card

Serves GOAL's "work lost or stalled" clause (nothing Ben writes on the Goals page can be
lost, and the goals mirror stays current at release) and "rework after acceptance"
(the table refusal fixes a bad Status line at the source instead of letting risky text
leak onto the page and get hand-patched later). Nearest NOT: "a rule no script checks" —
the three table refusals and the byte-for-byte Detail nesting are all asserted by tests,
not left as prose convention.
