---
name: notion-writing
description: Read and write Notion pages/databases (rewrite docs, edit blocks, update titles, query DBs) and follow Ben's page rules. Use whenever the user shares an app.notion.com / notion.so link or asks to edit, rewrite, append to, or read a Notion page. Access is already configured — do NOT ask the user to set up an integration token or MCP.
---

# Writing to Notion

> This skill ships with the delegation plugin (`skills/notion-writing/`) and is mirrored to
> `~/.agents/skills/notion-writing`, so Claude and Codex sessions read the same text. It supersedes
> the user-level copy `~/.claude/skills/notion-writing`; removing that copy is a dotfiles (chezmoi)
> change that waits for Ben's word.

## 1. Authorship (universal rule — from `~/.claude/rules/10-hard-stops.md`)

NEVER let Notion content show a Claude byline.

Everything created or edited in Notion via the API must appear authored by "Ben Zhuk" —
never "Claude Code", "Claude", or any AI attribution, in authorship, content, titles, or
properties. If a page shows "Claude Code" as author, the integration name regressed —
flag it to Ben. Mechanics: `notion-writing` skill.

Notion's `created_by` is immutable and displays the integration's *current* name, so the integration must stay named "Ben Zhuk" in Notion settings. Set any explicit Author/people property to the real user Ben Zhuk (`6ba5c1d1-8992-4f27-8187-a7b79276929e`). `page-lint.mjs` refuses a byline in the body and, with `--title`, in the title (rule `no-byline`, which also names Codex, OpenAI and ChatGPT).

Access is **already configured** (`NOTION_TOKEN` env var, synced via claude.env). Do not ask the user to create an integration or share a page. WebFetch will NOT work on Notion links (auth wall); use the CLI below.

## 2. THE method: markdown-first via the CLI

Notion's API has native markdown endpoints that create or edit a whole deeply nested page in one request, toggleable headings, nested toggles and callouts included. `notion.js` wraps them with a hardened transport (timeouts, jittered backoff, async polling, upsert-by-title so re-runs never duplicate). Do not hand-write publisher scripts that build block trees. Ben, 2026-09-20: "NOOOOO we ran through this problem SO MANY TIMES." That was a per-block API walk to read a page; the markdown endpoint is the only allowed path, for reading and for writing.

The reader is `node "$HOME/.claude/scripts/notion.js"` on every host and shell. `$HOME` is defined in bash, zsh, pwsh 7 and Windows PowerShell 5.1; `~` is not expanded for node by Windows PowerShell 5.1 or cmd. The file comes from chezmoi. On a host without it, stop and report; there is no vendored copy. A Codex session first runs `node -e "process.stdout.write(process.env.NOTION_TOKEN ? 'set' : 'unset')"`. On `unset`, it stops and asks Ben to allow the variable in Codex's `shell_environment_policy`. It never reads or copies the token.

```bash
NJ="$HOME/.claude/scripts/notion.js"
node "$NJ" publish <parent-id> "<title>" doc.md   # upsert: replaces if a child page with that title exists, else creates
node "$NJ" read <page-id>                          # page → Notion-flavored markdown, 1 request
node "$NJ" edit <page-id> "old text" "new text" [--all] [--safe]
node "$NJ" append-md <page-id> section.md
node "$NJ" replace-md <page-id> doc.md [--force]
node "$NJ" replace-range <page-id> "start text...end text" new.md
node "$NJ" parent <page-id>                        # { id, parent: {type, id}, title }
node "$NJ" comments <page-id> [--json]             # or: comment <page-id> "text" | comment --reply <discussion-id> "text"
```

Content args accept a file path, `-` for stdin, or a literal string, EXCEPT `edit`'s positional old/new text, which are always literal strings (never a file path); use `--old-file`/`--new-file` (UTF-8, CRLF normalized to LF, one trailing newline stripped, tabs kept exactly) for anything multi-line or backslash-bearing. **Always write the doc to a .md file first** (shell quoting mangles inline markdown). `--force` allows edits that delete child pages/databases (default refuses). `publish --new` skips the upsert check. `--safe` requires the old text to occur exactly once (or at least once with `--all`) before anything is sent, refusing with exit 3 otherwise. Moving a page (changing its parent) is not possible through the Notion API; there is no `move` command and none should be built.

### The checker: `page-lint.mjs`, before every write

```bash
PL="$HOME/.agents/skills/notion-writing/scripts/page-lint.mjs"   # the mirror; in a plugin checkout: skills/notion-writing/scripts/page-lint.mjs
node "$PL" doc.md --kind <decisions|spec|brief|status|read|handoff|plain> [--title "<title>"] [--fragment]
```

- Exit 0 prints `page-lint: clean (<kind>)`. Exit 2 prints one line per violation, `page-lint: <rule-id> <file>:<line> <what to fix>`, and **stops the write**. Exit 1 is a usage error (unknown kind, missing file). It never writes and never calls Notion.
- Pick the kind by the page: `decisions` (a hand-written decisions page), `spec`, `brief`, `status`, `read` (prose samples, pilot results), `handoff`; `plain` when none fits.
- `publish`: lint the file you send, with `--title`. `replace-md`: lint the whole doc. `edit`: apply the edit to a scratch copy of the fresh read and lint that. `append-md` and `replace-range`: lint the fragment with `--fragment`, which switches off the page-level rules (`goal-callout`, `read-status`, `done-last`, `decision-block`, `prior-rounds`).
- Every publish through this skill leaves a `page-lint: clean (<kind>)` line in the writer's record or ledger, so the census can count them.
- Kill switch: `~/.agents/no-page-lint` makes the decisions render skip its call (fail-open, one stderr line). The checker itself has no switch and never fails open; a missing module is an error.

## 3. Docs are LIVING — always read fresh before planning or writing

Notion pages change at any moment: Ben and advisors edit them directly, and other sessions write to them too. Writes are last-writer-wins.

1. **`read` the page fresh BEFORE planning any change.** Never plan from a copy pulled earlier, from conversation context, or from memory.
2. **Anchor edits on the fresh bytes.** `old_str` for `edit` and the range for `replace-range` come from the just-read output, not retyped text.
3. **The re-read must be SECONDS before the write, not minutes (2026-08-18 incident).** A flow that diffed clean, then spent about 13 minutes building content before `replace-md`, overwrote Ben's live edits. Read, diff, write is atomic: if ANY work happens after the diff, read and diff AGAIN immediately before writing.
4. **Diff in both directions** against the version your rewrite was built on. His deletions are edits too (2026-09-18: "isn't part of the notion skill read before writing? you put back some stuff i deleted"). Anything added or removed in between must be carried into the new content.
5. **"No matches found" from `edit` usually means the page changed** (or smart-quote bytes); re-read and re-anchor, never blind-retry.
6. **After every write, verify no concurrent edits were destroyed**: diff the printed pre-write backup against your base. Real content in the backup that your base lacks is someone's edit you just overwrote; re-apply it with surgical edits (never another full replace).
7. **Run page-lint before every write** (section 2): exit 2 stops the write.
8. **After every write, read back and verify structure**: the `<details>` count, the `{toggle="true"}` count, and no escaped-to-top-level bullets, not only the text. `page-lint.mjs` does not check this. The decisions render has its own read-back compare (`decisions-render-publish.mjs`); every other page is checked by hand.
9. **Before you print any "waiting on you" footer, read the page back.** On 2026-09-20 a footer said "Decisions waiting" for an hour after Ben had answered everything.

Every command that mutates an existing page **snapshots it first** to `~/.local/state/notion-backups/<page-id>/<timestamp>.md` (property writes save `<ts>.props.json`; override with `NOTION_BACKUP_DIR`; a backup failure aborts the write; `--no-backup` skips). `edit`, `append-md`, `replace-range` and `replace-md` also re-read the page after writing and save an `<same-timestamp>.after.md` snapshot beside the pre-write one, then diff the two: for `edit`/`append-md`/`replace-range`, a removed line beyond what the command meant to remove prints `UNEXPECTED REMOVED:` and the command **exits 4** (the write already happened; both backup files and a restore command are named). Restore with `replace-md <page-id> <backup.md> --force`.

`search` is fuzzy and can return an unrelated page first. Never feed a search result's id into a write without checking its title is an exact match (`props <id>`). Prefer ids you already hold.

## 4. Ben's page rules, as numbered checks

Each rule carries its date and the words it comes from. `[rule-id]` is the `page-lint.mjs` rule that enforces it; "(not checked)" is a stated goal no script can test, and is not a rule.

1. **Goals open a spec, brief, status or handoff page** `[goal-callout]`. The first top-level block is a callout with icon 🎯 of at most 15 non-empty lines, stating his goals in his meaning. Replace it, never append to it. 2026-09-22: "in the notion spec (and always) restate my goals for this entire architecture and infrastructure. it doesn't have to be my words, but read what i said and take my actual meaning."
2. **A read page with several rounds opens with a status callout and one pointer** `[read-status]`. Two sentences at most, then exactly one line starting `Read now:` that names the one or two toggles to read. 2026-09-03: "again, many toggles, i don't know which to read."
3. **All earlier rounds live in ONE toggle titled Prior rounds** `[prior-rounds]`. Sibling toggles may name at most one round; a round toggle is one whose title matches `round N` or `pass N`, at any depth. 2026-09-02: "from now on in the notions, move all prior rounds into a single toggle that i can collapse, so i know what the latest round(s) are that you want me to read."
4. **Never number or prefix headings or toggle titles** `[heading-prefix]`: no `1.`, `2)`, `A.`, `IV.`, `P1`, `Step 2`, `Phase 3`, `Part 4`. 2026-08-17, and the 2026-09-03 complaint "your notion is very hard to read. think about how to format and structure it better."
5. **A plain heading has no children** `[heading-children]`. Only `{toggle="true"}` headings nest; Notion flattens the rest to top level (the 2026-09-09 `replace-range` incident, section 8).
6. **A blank line at the bottom of every toggle** `[toggle-tail]`. 2026-08-20: end each toggle's children with one `<empty-block/>`, so when it is open the reader sees where it ends. Every `<details>` and every toggle heading.
7. **Before and after pairs use colored labels** `[before-after]`. 2026-08-17: `<span color="red">**BEFORE**</span>` and `<span color="green">**AFTER**</span>`; the color coding stays when a doc is simplified. Only a pair is checked, a lone `After:` is not.
8. **Options are checkboxes he ticks, never letters in prose** `[options-checkbox]`. 2026-09-28: "a, but this should been given to me as multiple choice for me to tick A", and in chat "In my options, give me multiple choice checkboxes".
9. **An open question is never inside a `<details>`** `[open-question-visible]`, on a hand-written decisions page (section 6, rulings 2 and 3 say which page that is). It sits directly under the `# Waiting on you now {toggle="true"}` heading toggle; only its detail nests. After his 2026-09-27 15:50 complaint: "what a mess! i can't make heads or tails of what i've decided and what's left and why".
10. **A hand-written decision item is one fixed block** `[decision-block]`. Under `# Waiting on you now {toggle="true"}` (children tab-indented), each `- [ ] **Question?**` has, in order: `**Why this is yours:**`, `**What waits on it:**`, `**Options, tick one:**` with two or more `- [ ] (A) ...` lines, `**My recommendation:**`, `**Given:**`, at most one `<details>` titled Background, `**Answer here:**`. Under `# Decided`, each `- [x] **Question**` carries `Your answer:` and a child `<details>` titled Original text that holds the original block verbatim. His tick and his text are evidence; prose never replaces them. One detail toggle and no reasoning sub-toggles (2026-09-27 15:50: "with sub-toggles for various sections of reasoning and factors to consider").
11. **The Done checkbox is the last block inside the "Waiting on you now" toggle** `[done-last]`; a legacy page with `- [ ] Done` as the last line at column 0 fails `top-level-toggle` until it is rewritten. 2026-10-01 moves it into the toggle (rule 14). 2026-09-20: "On notion the page level done is a checkbox called "Done" at the very end of the document, and gets reset every time you have more questions for me in that doc."
12. **No byline anywhere** `[no-byline]`, section 1.
13. **No em dashes and no arrows in prose** `[em-dash-arrow]`, not asked of `plain` pages. Taxonomy-fable's recorded organizing rule ("No em dashes, no parentheticals, no arrows"); no dated quote of Ben's own.
14. **A decisions page is toggles at the top level** `[top-level-toggle]`. Every top-level block is a toggle or a heading, never a loose paragraph, bullet, callout, checkbox or table; the few top-level toggles are named for what he looks for and detail nests inside. The shape, its reasons in his words and its section list are in `skills/decisions/references/page-shape.md`; the renderer is the only writer of the plugin's own page.

Every rule except `no-byline` leaves alone: fenced code; the subtree of a `<details>` whose summary contains Original text; his comment lines (they start with the escaped `\*\*`); and, for `em-dash-arrow` and `options-checkbox`, double-quoted text. His words stay verbatim.

### Stated goals (not checked)

- One line per item, always; the detail, background and history nest under it in a toggle (standing preference).
- Sentences of about twenty words, one idea each. No parentheticals, except option labels `(A)` and the render's `(recommended)`. No internal codes in headings or table cells; translate a code on first use. Tables over prose for state.
- An advisor-facing page opens with content and carries no methodology preamble (2026-08-17). A handoff brief for an outside reader carries no session process.
- The page is REBUILT from the record as current state, never accreted. A report that grows in the repo is fine; the page shows where things stand now.
- New questions go at the TOP of "Waiting on you now", never at the page bottom. An update to an open item goes inside its Background toggle, not as a new paragraph. An answered block moves to the top of "Decided" as one line.
- His comments arrive as lines starting `**` (escaped `\*\*` in a read). 2026-09-20: "in notions where I mark up, look for ** at the start of notion lines for my comments." A `**` line inside an item means it is answered, even with no tick. Reply under his line, indented, starting "Reply, HH:MM NYC:" on a hand-written page.
- Anything he reads, approves or spot-checks is a Notion page, and the message closes with its URL. 2026-09-16: "always give me notion docs not mds". 2026-09-09: "always link the notion or i forget." Prose samples are published and linked, never pasted into chat.
- An answer to him is not the record; the record is the page the reader will use. 2026-09-28: "Why not? Put this in the handoff doc!"
- A film named to him is named by its title, resolved from the database row in the same turn. Times are New York, read from the clock in the same turn.
- File names in backticks, or Notion turns `x.sh` and `x.md` into fake links.
- A handoff or plan follows his dictated order (2026-09-25): goals in his language, what has been done, what was measured, failures in running the workflows, failures in building, where the codebase stands, the exact plan, next steps.
- Keep the taxonomy Notion separate from the skills Notion (2026-09-20).

## 5. What the decisions render already owns

Not restated as page-lint rules; the render refuses these for the page it writes. Files are under `skills/decisions/scripts/`.

- Title shape "<Topic>: M/D H:MMAM Decisions": `decisions-title.mjs`, `TITLE_RE`.
- Bare autolink tokens (a bare `x.md` or `x.sh`, a bare `~`, a bare URL): `checkAutolinkLines` and `stripAutolinkExempt` in `decisions-render-core.mjs`.
- Bold-led lines and hex tokens: `checkProseLines`.
- Length: `buildNowSection` (3 to 5 sentences) and `buildSessionSection` (8 bullets of 200 characters).
- Malformed waiting items and the Done line: `checkWaitingItem` in the core and `finalizeDone` in `decisions-read.mjs`.
- No child pages on the render-owned page: by construction and Ben's word in `docs/specs/goals-one-line-1/spec-full.md`; nothing refuses one, the template never emits one.

The render calls the same checker once, at the end of `render()` in `decisions-render-core.mjs`, so `render`, `publish` and `publish --dry-run` all refuse a violation with exit 2. It runs kind `decisions` and skips `open-question-visible`, `decision-block` and `em-dash-arrow`, which the render's guards and its history template already own. It keeps `heading-prefix`, `heading-children`, `toggle-tail`, `before-after`, `options-checkbox`, `done-last`, `top-level-toggle` and `no-byline`.

## 6. Scope rulings

1. **Child pages.** The packet keeps long material in child pages behind a `<page url="…">Title</page>` line; Ben's rule for the skills decisions page is no child pages. No child pages applies only to the render-owned page; hand-written pages may have them. `notion.js` refuses to delete a child page without `--force`: never pass `--force` on a page whose fresh read has a `<page` line.
2. **Decision-item shape.** The render-owned page (the plugin's own decisions page) uses `templates/decision-item.md` (question in the summary, options inside the toggle, `(recommended)` as a suffix), and writes only through `decisions-render.mjs` (see `skills/decisions/SKILL.md`; hand edits, `replace-md` and `publish` are banned there). A hand-written decisions page, such as the bto-workflows pages, uses the block in rule 10 and kind `decisions`.
3. **Two decisions layouts.** Render page: Goal card, Bearings, Components, Waiting on you now (items, What is going on, This session, comment callout, Done last), History, every one a toggle (`skills/decisions/references/page-shape.md` and `templates/decisions-page.md`, not restated here). Hand-written page: section 7.
4. **Goals on decisions pages.** Goals are linked from a decisions page (the Goals page, or a toggle), not required as a callout there. Rule 1 does not apply to `decisions`.
5. **Toggles.** "Maximize sections and toggles, toggles within toggles" is the standing preference for spec, brief and read pages. On a decision item it is one line, one Background toggle, no reasoning sub-toggles.
6. **Parentheticals.** "No parentheticals" has one sanctioned exception: option labels `(A)` and `(recommended)`.

## 7. Layouts by page kind

Pages he used and answered on without complaint are the three pages Ben used, listed in taxonomy-fable's 9/28 packet (kept out of this public repo): a handoff brief, a side-by-side examples page, and a decisions page.

- **decisions (hand-written)**: (every section below is a toggle at the top level, rule 14) `# 🎯 Goals {toggle="true"}` holding the goals link; `# How to read {toggle="true"}` saying how to read and where to answer; `# Waiting on you now {toggle="true"}` (its children tab-indented, newest question first, never a `<details>`); `# Decided {toggle="true"}` (newest first); Parked; Closed without a decision; Information only, by date; Standing asks not yet done; `- [ ] Done` is the last block inside the Waiting on you now toggle, unticked by whoever adds a question.
- **spec, brief, status**: 🎯 goals callout first; for a page he answers in, a second callout on how to read and where to answer; then open questions, always visible; then the rest in toggles, one line per item.
- **read** (prose samples, pilot results): status callout of two sentences; `Read now:` line naming one or two toggles; only the current round at top level; everything earlier in ONE collapsed toggle "Prior rounds".
- **handoff or plan**: goals, then state, then plan, then next steps (his 2026-09-25 order, section 4).
- **plain**: none of the above; the rules that apply to every page still do.

## 8. Notion-flavored markdown syntax and surgical edits

Children are indented **one TAB deeper** than their parent. Standard md works (`**bold**`, `*italic*`, `` `code` ``, `-` lists, ``` fences, `>` quotes), plus:

```markdown
# Section title {toggle="true"}          ← toggleable heading_1 (h2/h3 same)
	Everything tab-indented under it becomes its children.
	<details>
	<summary>**Group A**  (7 items)</summary>
		- item one
			nested detail under item one
		- item two
		<empty-block/>
	</details>
	<empty-block/>
<callout icon="🎯" color="gray_background">
	Goals text.
</callout>
```

Gotchas: plain `#` headings can NOT have children (only `{toggle="true"}` ones); depth is unlimited; don't escape special chars inside code fences; `read` returns this same flavor, so read, edit, replace round-trips cleanly.

- **`edit`**: exact-match text find/replace (`--all` for multiple matches). Pull the exact substring from `read`; watch smart quotes and em dashes. Never on a toggle heading.
- **`replace-range` never on a section that starts at a toggleable heading (2026-09-09 incident)**: it keeps the start block's type but drops its toggle flag, so the heading comes back as a plain `#` and every tab-indented child lands as a top-level sibling. Nor on a callout, nor to grow a list of several bullets. For a toggle section: fresh `read`, splice the new section (full `# Title {toggle="true"}` and tab-indented children) into the page markdown, `replace-md` the whole page, verify with `read | cat -A` that children carry a leading tab, and diff the pre-write backup against your base.
- For structural change: one whole-page `replace-md`. A `<page url="…">Title</page>` line in the markdown keeps a child page through a whole-page replace.
- **Annotation-precise block surgery** (per-run bold/links/colors, callout icons, to_do state) is the one place the block API is allowed: `read-blocks <page-id> --ids`, then a `PATCH /blocks/{id}` with only `{ [type]: { rich_text } }`. Blocks cannot be moved or type-changed.
- **Databases**: `get-db`, `query-db`, `create-db-row`, `update-props` (API version 2022-06-28 semantics).

### Builder-facing work state

Keep the canonical state in the existing pair rather than copying it into another status document. The [Goals-page template](../decisions/templates/goals-page.md) presents the current goal and subgoals; the [Decisions skill](../decisions/SKILL.md) owns decisions, `To Decide` items, `Done`, and comment accounting. For the plugin's own decisions page, create a `To Decide` item only with its [decision-item template](../decisions/templates/decision-item.md) (section 6, ruling 2). These are writing and hand-back conventions, not an automatic update or pickup.

## 9. API facts (verified live 2026-08-17)

- Markdown endpoints: `POST /v1/pages` with `markdown` body; `GET/PATCH /v1/pages/{id}/markdown`. The CLI sends `Notion-Version: 2026-03-11` for these and `2022-06-28` elsewhere; do not bump it globally (databases become data_sources in 2025-09-03+).
- Big writes: `allow_async:true` returns 202 with an `async_task` to poll; the CLI does this above about 8KB. A page of about 2,000 blocks works in one call.
- Rate limit about 3 requests per second per integration; 429 carries Retry-After; 409 is a concurrent write to the same page (retried). Avoid parallel writes to the SAME page.
- Block-API limits (legacy path only): 100 blocks per children array, 2 nesting levels per request, 2000 chars per text.content, 500KB payload.

## 10. Always verify

After writing, `read` the page back and grep for what you changed. Watch substring false positives ("Modi" matches "com**modi**tizes"). A silent no-match in `edit` means the smart-quote or em-dash bytes differ from what you typed.
