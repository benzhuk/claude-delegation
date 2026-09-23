# Spec: decisions-current — the decisions skill keeps goals current and acts on every owner note

Goal line served: "Decisions have one home and are kept current" (docs/GOALS.md). Card line: GOAL (maintain or increase all the benefits); NOT line nearest: "a patch, watcher or guard on a symptom" — this spec adds no hook and no watcher; it adds a check the lead must pass before handing the page back, a renderer for the goals mirror, and rewrites the skill text to match. The stale-sha check does observe another mechanism (the release step). It stays because the release step is the only thing that writes the page, and the check is one regex inside the hand-back. The pasted hand-back line (M3) is the owner-visible proof that the check ran. No hook enforces it.

Owner's words, 2026-09-22 (verbatim, the acceptance statement):

> "the decisions notion skill should make sure the goals are kept up to date! any note from me in notion is a line prefaced with **, this should be in our skill already, and all the notes must be acted on and removed from the doc for when you next hand it to me."

What was found today (audit, reader run 16:55 NY): the reader exists and nothing runs it; the skill says "state the decision in chat too"; three items were written outside the template shape and the reader could not see them; five closed items still carried checkboxes and reported TICKED or OPEN; the Done line sat mid-page, ticked, with items open; the owner's one comment was answered in prose without a `Reply:` line, so it reported COMMENTED for two days.

## Design

Three mechanisms, all inside `skills/decisions/`, plus the skill text. No hooks. No Stop behaviour. Kill switch: the existing `ws-off` master switch and the per-feature file `~/.agents/ws-off-decisions` (the folder is `$AGENTS_HOME` when set, else `~/.agents`, same order as goal-card.mjs:93-96; tests set `AGENTS_HOME` to a temp dir and never touch the real home) disable the hand-back check's non-zero exit (it then prints and exits 0). Everything fails open: a network or parse failure prints BLIND and exits 3, never blocks anything but the hand-back.

Red-teamed by an Opus reviewer 2026-09-22 (18 findings, 16 accepted, F8 and F18 rejected with reasons in the scratch report); builders branch from main.

### M1. Owner notes: act, log, delete (reader change)

- Any line whose text starts with the escaped `\*\*` marker, anywhere on a page the reader is given (decisions page or goals page), is an owner note. Unchanged.
- Two kinds of note, told apart by what the lead does, never by parsing the owner's text (owner's ruling 2026-09-22, 17:20 NY: "reply in notion after all and leave my question there"):
  - An instruction: do it (or record why not), write one plain bullet under `# Closed` beginning `Your note, <M-D>: "<first 12 words of the note>…" — <what was done>`, and delete the owner's line.
  - A note on an item that is still waiting also gets its answer inside that item, as a plain (not bold) line starting `Answered <M-D>:`, before the owner's line is deleted. A note on the goals page is logged under the decisions page's `# Closed`. The lead rewrites the decisions page callout's owner instruction to: "Tick a box, or add a line starting with ** anywhere; every such line is acted on and removed before this page comes back to you."
  - A question: write `Reply: <YYYY-MM-DD> <answer>` directly under the owner's line. Both lines stay. The reader reports the pair as REPLIED (the status it already prints; not a new one), and it does not block the hand-back. On the first hand-back pass whose date is after the Reply date, the pair is archived: one plain bullet under `# Closed` beginning `Your question, <M-D>: "<first 12 words>…" — <the answer>`, and both lines are deleted from the open section. If the answer is itself a decision, it becomes a template-shaped item and the Reply says `made it an item above`.
  - A follow-up from the owner is a new `\*\*` line under the reply; it is COMMENTED again.
- REPLY_RE stays as is (`Reply:` plus numeric date). A `\*\*` line with no Reply under it is COMMENTED and blocks the hand-back; with a Reply it is REPLIED and does not. The reader never quotes the owner's line back into a `\*\*`-prefixed line (unchanged rule; Closed bullets use plain quotes, not the marker).
- Notes before any title, or under a title with no options (every goals-page heading), are reported exactly as today: `UNATTACHED\tline N\t<text>`, plus `\t(under <title>)` when there is a title. Unchanged. The hand-back blocks on them (M3).
- Archiving is the lead's job at hand-back time; the hand-back check (M3) lists REPLIED pairs older than today as `ARCHIVE` lines so they are not forgotten, but they do not block.

### M2. Goals mirror: renderer + staleness check

- `scripts/goals-mirror.mjs render --repo <path>` reads `docs/goals/card.md` and `docs/GOALS.md`, prints Notion-flavoured markdown in the fixed shape of `templates/goals-page.md` (the shape the lead hand-wrote on 2026-09-22: a mirror callout with `main at <sha>`, a card callout with the five lines and the "which lines are yours" note, then one toggleable heading_1 per `## ` section of GOALS.md with the quotes, the Measure line and a coloured status span: MET green, PARTIAL orange, NONE and UNKNOWN red). `<sha>` is `git log -1 --format=%h origin/main -- docs/GOALS.md docs/goals/card.md` in `--repo` (the last main commit that changed a source). publish refuses (exit 1) unless the working-tree copy of each source equals its `origin/main` blob. `--sha <x>` overrides for tests. Pure: no network. Sources are read as `<repo>/docs/GOALS.md` and `<repo>/docs/goals/card.md`, joined to `--repo` directly, never through a root walk-up.
- `scripts/goals-mirror.mjs render --repo <path>` remains pure. Its `publish` command always refuses before a network mutation: render, read the actual Goals page fresh, use the existing notion-writing targeted anchored edits only for agent-owned sections, then verify readback and reconcile uncertain writes. Initial creation uses the existing writer under normal authority; no duplicate publisher or `--current none` path remains.
- `decisions-handback.mjs`, not the reader, runs `parseDocument` over the goals read. It prints that page's lines prefixed `goals\t` (e.g. `goals\tUNATTACHED\tline 22\t…`). It emits `WARN\tgoals mirror stale: page <a>, head <b>` or `WARN\tgoals mirror missing sha line`. BLIND on either read gives `HANDBACK blind`, exit 3. `decisions-read.mjs` gains no flags.
- Builders branch from `main` (889887a or later), not `integrate/0921`. The release checklist renders, fresh-reads, applies existing-writer targeted edits, and verifies readback; status lines in GOALS.md change only in a release commit.

### M3. Hand-back check

- `scripts/decisions-handback.mjs --decisions <read.md> --goals <read.md> --repo <path>` runs the reader over both pages. Checked Done is a pending human submission: account choices/comments and clear it before hand-back; unchecked Done is valid with zero or open decisions, while absent Done blocks. The goals page is exempt from this Done rule. With `~/.agents/ws-off-decisions` or `ws-off`, a blocked result exits 0 and prints `HANDBACK disabled`, never `ok`.
- The skill rule: give the decisions URL only after a fresh read produces the summary followed by `HANDBACK ok`; exit 0 alone can mean disabled enforcement. The lead uses a mid-tier native-provider runner.
- Config: `.agents/project.json` keys `decisions_url` (already a default key, project-config.mjs:7; a page URL or id) and new `goals_parent_page`. `decisions-handback.mjs --config` (T1) prints `decisions_url\t<v>` and `goals_parent_page\t<v>`, one line per key that is set and nothing for unset keys, exit 0. `source: "unreadable"` prints BLIND on stderr and exits 3. `decisions-read.mjs` stays a pure parser; the skill says "page id from `.agents/project.json`, else from the owner". This repo's project.json gets the two ids: decisions_url `3e1da11277a18174bccfea187d5c3972`, goals parent `3e1da11277a1817db4c1f1038ccfdd5a`. goal-card.mjs already reads this file for `goal_card`; read through `loadProjectConfig` in `scripts/project-config.mjs`, never a second parser.

### Skill text (SKILL.md)

- Replace "State the decision and the recommendation in chat too; send the link only once a fresh read shows the item there" with: "In chat, give the link and the item title only. Never restate the options or the recommendation in chat; a decision that exists only in chat is invisible to the reader."
- Replace the COMMENTED bullet ("reply under the owner's line…") with M1: instruction = act, log, delete; question = Reply under it, archive after the owner has seen it.
- Add the hand-back rule (M3) and the goals-mirror step (M2) with the exact commands.
- Add: "Every item goes in through the template shape. A bullet that is not a `<details>` toggle with unticked options and a Default or No default line is not a decision: the reader cannot see it."
- Add: "Closing an item deletes its toggle. A closed toggle left in Closed keeps reporting TICKED or OPEN forever."
- Keep the page in two sections the owner reads, `# Waiting on you now` and `# Closed`; the skill says status narrative and logs live in the repo (`docs/work`, `docs/ledger`), not on this page. Existing extra sections are not deleted by this build; the lead decides that with the owner.

## Contracts (pinned)

- `decisions-read.mjs` stdout grammar unchanged: `STATUS\tTITLE\tDETAIL` lines, then `DECISIONS\t<n>`, `DONE\ttrue|false|absent`. Exit codes unchanged (1 act, 0 nothing, 3 BLIND).
- `decisions-handback.mjs` exit: 0 clean or disabled, 1 not clean, 3 BLIND. Stdout ends `HANDBACK ok|blocked|disabled|blind`; disabled never emits a green summary or `ok`.
- `goals-mirror.mjs render` stdout: the page markdown; the first line is the callout opener; `main at <sha>` appears exactly once. `publish` exits 1 before live operations.
- Sha line (shared T1/T2 contract): the page sha is the first match of `/\bmain at ([0-9A-Za-z]+)/` on the first line inside the page's first `<callout` … `</callout>` block. No match there means `goals mirror missing sha line`; a match anywhere else on the page does not count.
- The template writes file names in backticks (`` `docs/GOALS.md` ``, `` `docs/goals/card.md` ``) so Notion does not turn them into http links.
- T1's goals fixtures use the read-back shape, bold split around a link, e.g. `\t**Mirror of **[**GOALS.md**](http://GOALS.md)** … main at 889887a.**`, and include one fixture whose Status prose contains "main at abc1234" outside the callout.
- `templates/goals-page.md`: the render shape, with `{{sha}}`, `{{card}}`, `{{sections}}` placeholders; Render rules, and nothing else:
  1. The static text is copied verbatim into `templates/goals-page.md`: the mirror callout, the card header and footer, and the intro paragraph (reference `C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31\scratchpad\goals\goals-page.md` lines 1-5, 11-14, with `{{sha}}`). GOALS.md text above the first `## ` is not rendered.
  2. `{{card}}` is card.md's five lines, each prefixed with one TAB.
  3. Each `## X` becomes `# X {toggle="true"}`.
  4. Every other non-blank line of the section follows, TAB-prefixed, in source order. Blank lines are dropped.
  5. Every `YYYY-MM-DD` in section text becomes `M-D` with no leading zeros. Other dates are left as written.
  6. `Status: WORD. rest` becomes `<span color="C">**WORD**</span> rest`, with one trailing ` (…)` group at the end of the line removed.
  7. `\t<empty-block/>` closes each section.
  8. No pronoun rewriting: the page says "Ben" where GOALS.md does.

  The expected output `skills/decisions/scripts/fixtures/goals-page.expected.md` is the renderer's output over `fixtures/goals-src/` (committed copies of today's two source files), with `--sha test`. The T2 review lists every line where it differs from the reference. Differences (a) for `07-28`, (b) and (d) are accepted.

## Current active E contract (2026-09-23)

This section supersedes the historical territory/test plan below. `Done` is a submission
signal: checked means account choices/comments and clear it; unchecked is valid for an
empty or open page. A disabled handback always prints only `HANDBACK disabled` and no
green summary. The renderer is pure; `publish` always refuses before any operation.
For an attended update, render, fresh-read the stable Goals target, use the existing
writer's anchored targeted edit for agent-owned content, and verify readback. Gate 5 is
pending that live workflow. Use the existing model tiers to select a mid-tier native
provider runner. Focused tests cover parser/handback state, pure render/CLI/errors, and
publication refusal; no mutation-publisher tests remain.

## Historical territory plan — superseded by current active E contract

- T1 (Sonnet): `skills/decisions/scripts/decisions-read.mjs`, `decisions-read.test.mjs`, new `decisions-handback.mjs` + test. M1 and M3, plus the goals-page WARN check moved from the reader (F12), and Test 6 (`--config`).
- T2 (Sonnet): new `skills/decisions/scripts/goals-mirror.mjs` + test, `templates/goals-page.md`, fixtures, `.agents/project.json` (new file at repo root with the two ids and the existing `goal_card` default left implicit).
- T3 (Sonnet, small; may be the T2 builder after T2's gate): `skills/decisions/SKILL.md`, `docs/pane-setup.md` `## Releasing` section, `skills/decisions/templates/decision-item.md` (adds one sentence after its Reply section: "A replied pair is archived to Closed on the first hand-back pass after the reply date; an owner instruction (not a question) is done, logged in Closed and its line deleted."), `docs/specs/2026-09-20-decisions-reader.md` addendum pointing here.
- Reviewers: Opus, one per territory, attack briefs: (T1) a `Reply:` line must turn COMMENTED into REPLIED and nothing else; a REPLIED pair must never block; an owner note on the goals page must report; a page with zero items and `- [x] Done` last must be clean; Done mid-page must WARN; kill switch must exit 0 but still print. (T2) render must be byte-stable against the fixture; dirty-tree refusal; sha override; a GOALS.md section with no Status line must render UNKNOWN red and not crash. (T3) every instruction in the skill either names the script that checks it or ends with `(not checked)`, and no "in chat too" wording anywhere.
- Integrator: plain and sealed suites; `node skills/decisions/scripts/goals-mirror.mjs render --repo skills/decisions/scripts/fixtures/goals-src --sha test` matches `goals-page.expected.md` byte for byte; `render --repo . --sha test` exits 0 and contains `main at test` exactly once; `decisions-handback.mjs` against the fixtures exits as pinned.

## Historical numbered tests — superseded by current active E contract

1. reader: `**` line with no Reply is COMMENTED; with a `Reply: <date>` line under it is REPLIED; a second `**` line under the Reply is COMMENTED again.
2. handback: `--goals` with matching sha, no WARN; mismatched sha, exact WARN text; missing line, exact WARN text; two shas match when one is a prefix of the other.
3. reader: an owner note under a goals-page heading reports `UNATTACHED\tline N\t<text>\t(under <heading>)`; one inside the mirror callout reports `UNATTACHED\tline N\t<text>`.
4. handback: clean fixture exits 0 and prints `HANDBACK ok`; each single defect (comment, WARN, DUE, Done ticked with OPEN, Done not last, stale sha, UNATTACHED note on the goals page, UNATTACHED note inside the goals callout, TICKED item, Done absent, zero items with `- [ ] Done`) exits 1 and names it; BLIND exits 3; kill-switch file makes the blocked case exit 0 and still prints `HANDBACK blocked`.
5. mirror: render of the fixture repo equals `goals-page.expected.md` byte for byte; `--sha` override lands in the callout once; a section without Status renders UNKNOWN; publish refuses on a dirty source file (mock the git call). The fixture render, fed to `parseDocument`, gives zero decisions, zero warnings and zero unattached. render exits 1 and names the line when a source line would render as `- [`, `<summary`, a line starting `Default` that contains `:`, or a code fence. publish with a `--current` read carrying one `\*\*` note exits 1 and makes zero notion.js calls (mocked spawn).
6. project.json: `decisions-handback.mjs --config` prints `decisions_url` and `goals_parent_page` when set, one line per key; missing file prints nothing and exits 0; unreadable prints BLIND and exits 3.
7. skill text (T3, `skills/decisions/scripts/skill-text.test.mjs`): SKILL.md does not contain `in chat too`, and contains the literal strings `notion.js read`, `decisions-read.mjs`, `decisions-handback.mjs --decisions` and `goals-mirror.mjs publish`.

## NOT in this build

- No hook of any kind, no Stop behaviour, no timer. If the lead forgets the hand-back check, the hand-back message lacks the pasted line (M3), which the owner can see. Nothing else enforces it.
- No deletion of the page's Night log or Goals-ruling sections (owner's call, recorded on the page as a note from the lead, not a decision item).
- No BTO page ids; BTO's project.json is Ben's to fill.
- No change to notion.js.
- No change to goal-card.mjs caps (separate decision).

## Evidence for the record

Reader output on the live page before the repair, 2026-09-22 16:55 NY: 6 decisions seen (3 new items invisible), `WARN Done is not the last line`, 2 closed toggles without default lines, `DONE true` with items open. After the repair by hand (runner, same day): a fresh read at 17:40 NY through the reader gives `OPEN What done is tested against next`, `DECISIONS 1`, `DONE false`, exit 0, no WARN.

Gate 5 is pending: a mid-tier native-provider runner, selected through the existing model tiers, renders, fresh-reads the stable Goals target, uses the existing writer for targeted edits, verifies readback, and runs handback on fresh reads. No synthetic suite proves that installed-host flow.
