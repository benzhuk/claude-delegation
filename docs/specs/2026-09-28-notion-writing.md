# Lane 39, notion-writing: the plugin skill carries Ben's page rules, and one checker enforces the mechanical ones

Spec-session: 588290d9-ee43-400b-a808-cf44c407171c (skills-o, lead). Direction: skills-fable ASK skills-fable-lane-39-1 (`docs/notes/skills-fable-lane-39-1.md`, with taxonomy-fable's packet appended; "the packet" below means that appended packet and its section numbers). Base: 6275fa0 or later origin/main. Revision 1, written before the Opus red-team; the red-team's findings and the lead's rulings are appended as "Revision 2" below.

## Measure

Rework after acceptance: pages Ben retitles, rejects or asks to be rewritten. The packet's section 4 is the baseline: three rejected pages, and three used without complaint. Hours ask to accepted: a Codex lead publishes a page from the same skill without asking a Claude lead. The falsifiable line for the next census is: no page published through the skill after merge draws a structure complaint of the section 1 kind ("hard to read", "which toggle", "a mess") within 7 days, and at least one Codex session publishes through it.

## What already exists (verified on 6275fa0)

- `skills/notion-writing/SKILL.md` (122 lines) is already a plugin skill: 10628e4 folded it in, and `scripts/mirror-shared-skills.mjs:85` (`PLUGIN_SKILLS`) already mirrors it to `~/.agents/skills`. It differs from the dotfiles copy `~/.claude/skills/notion-writing/SKILL.md`. So the pinned direction's item 1 "mirrored" part is a test only, not a new entry.
- `skills/decisions/scripts/decisions-render-core.mjs` already refuses a wrong title shape, bare autolink tokens (`checkAutolinkLines`, `stripAutolinkExempt`), over-long prose (`checkProseLines`), malformed waiting items (`checkWaitingItem`) and child pages. `decisions-render.mjs` resolves `--reader <path-to-notion.js>` explicitly.
- `~/.claude/scripts/notion.js` is the one Notion client (publish, read, edit, append-md, replace-md, replace-range, backups). Not in this territory.

## Territory

- `skills/notion-writing/**`: SKILL.md rewritten, new `scripts/page-lint.mjs` and `scripts/page-lint.test.mjs`, and fixtures under `scripts/fixtures/`.
- `scripts/mirror-shared-skills.test.mjs`: one test that the mirrored skill carries a runnable `page-lint.mjs`. `mirror-shared-skills.mjs` itself changes only if that test shows the scripts dir is not mirrored.
- `skills/decisions/scripts/decisions-render.mjs`: one import and one call to page-lint on the composed page, plus its test in `decisions-render.test.mjs` or `decisions-render-publish.test.mjs`.
- `docs/census.md`: one section, "Notion writing: fed".
- NOT: `notion.js`; the dotfiles skill (chezmoi; its removal is a follow-up for Ben's word); `hooks/`; `work-record.mjs`; the janitor; the multi transport; the render's title, autolink, prose or waiting-item guards. Those stay the render's, and page-lint does not re-implement them.

## SKILL.md, in this order

1. **Authorship invariant**, verbatim from `~/.claude/rules/10-hard-stops.md` ("NEVER let Notion content show a Claude byline").
2. **The one method**: the `notion.js` CLI verbs.
   - The reader path is resolved per host by the same rule as the render's `--reader`. It is an explicit path, `~/.claude/scripts/notion.js` on Claude hosts. The skill states how a Codex session finds it. There is no vendored copy.
   - Never the per-block API for reading or writing (Ben, 2026-09-20: "NOOOOO we ran through this problem SO MANY TIMES").
3. **Living-doc rules**:
   - one `read` seconds before every write, and a both-direction diff (his deletions are edits);
   - the automatic backup;
   - after the write, a read-back that verifies structure (toggle count, `<details>` count, no escaped bullets), not only the text;
   - `page-lint.mjs` runs on the doc before every write, and exit 2 stops the write.
4. **Ben's page rules as numbered checks.** Each carries its date and the words it comes from (packet section 1), and names the page-lint rule id that enforces it. A rule no script can check is written as a stated goal in his words, marked "(not checked)".
5. **Rules the render already owns**, by file and function, not restated: title shape, bare autolink tokens, prose limits, waiting-item shape, no child pages on the decisions page.
6. **Layouts by page kind**: decisions, spec, brief, status, read, handoff. Each is a short skeleton taken from packet section 2, with the section 4 pages he used linked as examples.

## page-lint.mjs

Usage: `node page-lint.mjs <doc.md> [--kind decisions|spec|brief|status|read|handoff|plain]`, with `plain` as the default.
- Read-only: it never writes and never calls Notion.
- Exit 0 means clean. Exit 2 prints one line per violation: `page-lint: <rule-id> <file>:<line> <what, and how to fix>`.
- Exit 1 means a usage error.
- It runs on the markdown that will be sent (Notion-flavored: `<details>`, `<summary>`, `{toggle="true"}`, `<callout>`, `<empty-block/>`, `<span color=…>`).

Rules. Each names its kinds, and every rule is mechanical:

| id | kinds | rule | source |
|---|---|---|---|
| `goal-callout` | spec, brief, decisions, status, handoff | a goal callout (🎯) is among the first top-level blocks, at most 15 lines | 2026-09-22 "restate my goals"; packet §2 |
| `read-status` | read | a status callout within the first blocks, with at most two sentences, followed by exactly one line starting `Read now:` | 2026-09-02/03; packet §2 |
| `prior-rounds` | read, plain | at most one top-level toggle whose summary names a round or pass (`/\b(round|pass|v)\s*\d+/i`); earlier rounds nest inside one toggle titled "Prior rounds" | 2026-09-02 "move all prior rounds into a single toggle"; 09-03 "many toggles" |
| `heading-prefix` | all | no heading starts with a number, letter or roman ordinal (`1.`, `2)`, `A.`, `IV.`) or `Step/Phase/Part N` | skill rule 2026-08-17 |
| `toggle-tail` | all | every `<details>` and every `{toggle="true"}` heading section ends with an empty block before it closes | skill rule 2026-08-20 |
| `before-after` | all | when a line labels `Before:` / `After:` (or `BEFORE`/`AFTER`) as a pair, both labels are colored spans | skill rule 2026-08-17 |
| `options-checkbox` | decisions, plain | an option line `(A) …`, `(B) …` sits in a `- [ ]` / `- [x]` item, never in prose | 2026-09-28 "give me multiple choice checkboxes" |
| `open-question-visible` | decisions | an unticked question item under the waiting section is not inside a `<details>` | packet §2 "never inside a toggle" |
| `done-last` | decisions | the last non-empty line is `- [ ] Done` or `- [x] Done` (with its optional "last cleared" suffix, as the render prints it) | 2026-09-20 "a checkbox called Done at the very end" |
| `no-byline` | all | no byline or attribution line naming Claude, Claude Code, Anthropic or an AI (`/^\s*(by|author|written by|created by|generated (with|by))\b.*\b(claude|anthropic|ai)\b/i`, `🤖 Generated`), and no `Co-Authored-By` | hard stop |
| `em-dash-arrow` | all except `plain` | no em dash (—) and no arrow (→, ⇒, `->`) in prose outside code spans and fenced blocks | packet §2 "No em dashes, no parentheticals, no arrows" |

Stated goals, not checked: sentences of about twenty words; no internal codes in headings; film titles resolved from the database; tables over prose for state; the page rebuilt from the record, never accreted; new questions at the top of "Waiting on you"; replies under his `**` lines start with "Reply, HH:MM NYC:".

## The render calls page-lint

- `decisions-render.mjs` imports page-lint's exported `lintPage(text, { kind: 'decisions', skip: [...] })`. It calls it on the composed page after its own guards and before any write, for both `render` and `publish`.
- A violation is refused with exit 2 and page-lint's lines.
- `skip` lists the rules the render's own guards already cover. The red-team decides which rules overlap.
- Kill switch: when `~/.agents/no-page-lint` exists, the call is skipped fail-open, and one stderr line says so.
- The composed output is byte-identical to today's for the current sources. If today's page fails a rule, the red-team decides whether the rule, the kind or the render template is wrong. The render's templates are outside the territory, so a template change goes back to the lead.

## Acceptance

1. Unit tests: every rule red on a planted violation and green on its fix.
2. Section 4 pages: the three pages he used (a handoff brief, a side-by-side examples page, and a decisions page as rewritten 9/28 06:58) are read once with `notion.js read` into fixtures. page-lint with the fitting kind is green on each, or a rule is changed and the spec says why.
3. Mirror test: the mirrored skill under a sealed test home carries `page-lint.mjs`, and `node <mirror>/notion-writing/scripts/page-lint.mjs <fixture>` runs.
4. Render: `decisions-render.mjs render --repo .` on main's sources exits 0, with byte-identical output before and after. A planted violation in a scratch copy's session.md exits 2 naming the rule. The kill switch skips the call.
5. Live proof from a Codex session (`codex exec` runner or a Codex pane):
   - publish one page through the skill to a scratch parent page;
   - read it back;
   - page-lint green;
   - title and callout quoted in the record.
6. The decisions page is republished once from a main checkout after merge, subject to the lane 34 gate.
7. `docs/census.md` section "Notion writing: fed" names the checker, the kinds and the live-proof page.

Same lane flow and rules as the 2026-09-28 bundle: Sonnet builder, Opus review APPROVE on record, sealed suite on a second host, merge commit carrying the history bullet, then publish and close.

## Revision 2: the Opus red-team (2026-09-28, about 7:40 PM New York), all 14 findings applied

The red-team report stays in the lead's scratch (`<Scratch>/spec-redteam.md`) and is never committed. It quotes lines from Ben's BTO pages, and this repo is public. The builder reads it there for the exact patch text of each finding. What changes, binding over Revision 1 wherever they differ:

- **F1, fixtures.** The three pages he used are read into scratch only, never the repo. A committed `scripts/mask-fixture.mjs` produces masked skeletons: every word outside a fixed keyword list becomes a same-length `x` run, and markers, indentation, tags, punctuation and em dashes stay. Only those skeletons are committed. The record quotes each read's line count and sha256.
- **F2, call site.** The call is one import and one call in `decisions-render-core.mjs`, at the end of `render()`, after the `dropOwnerLines` check and before `return page`. That covers render, publish and `publish --dry-run`. `decisions-render.mjs` is unchanged.
  - `lintPage(text, { kind, skip, fragment })` is synchronous, returns `[{rule, line, message}]`, and throws on an unknown skip id.
  - `render()` throws `RefusedError` with all the lines.
  - `page-lint.mjs` imports nothing from the decisions skill.
  - The kill-switch path comes from `deps.pageLintKillSwitch ?? ~/.agents/no-page-lint`.
- **F3, verbatim exemption.** Every rule except `no-byline` ignores:
  - fenced code;
  - the subtree of a `<details>` whose `<summary>` contains `Original text`;
  - owner comment lines starting with the escaped `\*\*`;
  - double-quoted text, for em-dash-arrow and options-checkbox.
- **F4, render skip list.** `['open-question-visible', 'decision-block', 'done-last', 'em-dash-arrow']`. The render keeps heading-prefix, heading-children, toggle-tail, before-after, options-checkbox and no-byline. The render's ` — ` history template (core:457) is a follow-up, outside this lane.
- **F5, rule definitions.** Pinned exactly as in the report:
  - goal-callout: kinds are spec, brief, status and handoff, not decisions. The first top-level block is a 🎯 callout of at most 15 non-empty lines.
  - read-status: applies only when the page has 2 or more ROUND toggles.
  - `ROUND = /\b(round|pass)\s*\d+/i`, applied at any depth, with at most one distinct round number outside `Prior rounds`.
  - heading-prefix: the regex applies to headings and to `<summary>` text.
  - before-after: pairs only.
  - options-checkbox: a line-start `(X)` only.
  - done-last: skips `<empty-block/>`.
  - em-dash-arrow: skips `-->`, code and link targets.
  - All rules normalize CRLF and a BOM first.
- **F6, rules added.**
  - `heading-children`, for all kinds.
  - `decision-block`, kind decisions, using the packet §2 block exactly as the report lists it.
  - `--title "<title>"`, linted by no-byline and heading-prefix.
  - "No parentheticals" becomes a stated goal, not checked, with option labels as the sanctioned exception.
  - The optional `--readback` is declined for this lane. The skill says the post-write structure check is not checked by page-lint; the render has its own readback compare.
- **F7, no-byline.** The report's tested regex (AGENT, END, LEAD, BYLINE) replaces the spec's, and it names Codex, OpenAI and ChatGPT.
- **F8, citations.** SKILL §5 and the "already exists" list use the report's corrected citations:
  - `decisions-title.mjs` `TITLE_RE` for the title;
  - `buildNowSection` and `buildSessionSection` for the length limits;
  - `checkProseLines` for bold-led lines and hex.
  "No child pages" is Ben's word, applied by construction, not a guard.
- **F9, scope rulings in SKILL.md.** All six apply as the report rules them:
  - no child pages applies only to the render-owned page, and the skill says never pass `--force` on a page whose read has a `<page` line;
  - the render page uses the decisions template, and hand-written decisions pages use the packet §2 block;
  - both decisions layouts are named;
  - goals are linked from decisions pages, not required in a callout there;
  - a decision item has one detail toggle and no reasoning sub-toggles;
  - option labels are the parenthetical exception.
- **F10, reader.** The reader is `node "$HOME/.claude/scripts/notion.js"` on every host and shell. With no file present, stop and report; there is no vendored copy.
  - A Codex session first checks that `NOTION_TOKEN` reaches it, by running notion.js's own read of a known page. If the token is filtered out, the skill says how to pass it (Codex `shell_environment_policy`). The lead decides that config change; the builder does not make it.
  - No change to the mirror.
- **F11, fragments.** `--fragment` turns off goal-callout, read-status, done-last, decision-block and prior-rounds. For `edit`, lint the fresh read with the edit applied. For `append-md` and `replace-range`, lint the fragment with `--fragment`.
- **F12, acceptance pinned.**
  - Exact rule-id sets:
    - render (decisions, F4 skip) gives `[]`;
    - the side-by-side examples page (read) gives `['toggle-tail']`;
    - the handoff brief (handoff) gives `['toggle-tail']`;
    - the decisions page (decisions) gives `['done-last', 'em-dash-arrow']` with 19 em-dash-arrow hits (lead ruling, round 1b: the page predates enforcement and today's read has no Done line).
    - Any other result goes back to the lead.
  - The BTO fixture is the 9/28 06:58 post-write backup if found on this host, otherwise today's read.
  - Every rule gets a false-positive probe, from the report's list.
  - The mirror test asserts copy mode on win32 and runs the mirrored checker with `process.execPath`, using the `fakeEnv` pattern.
  - Render byte-identity is checked on one pinned source commit, comparing the base build with the branch build. The planted `- Written by Claude Code` in session.md gives exit 2 naming no-byline on render, `publish --dry-run` and injected-deps publish, and `replaceMd` is never called.
  - The live proof host is Windows, through `codex exec`, with the parent page named by the lead. The sent file and the read-back are both linted, with `--kind` stated.
  - Every publish through the skill leaves a `page-lint: clean (<kind>)` line in the writer's record or ledger, so the census can count them.
- **F13.** The CLI prints every violation. A missing module fails loudly (exit 1); only the kill switch fails open. An unknown `--kind` exits 1.
- **F14.** Sonnet builds, because the rules are pinned verbatim here and in the report. The Opus review checks them against the fixtures.
