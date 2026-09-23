---
name: notion-writing
description: Read and write Notion pages/databases (rewrite docs, edit blocks, update titles, query DBs). Use whenever the user shares an app.notion.com / notion.so link or asks to edit, rewrite, append to, or read a Notion page. Access is already configured — do NOT ask the user to set up an integration token or MCP.
---

# Writing to Notion

> This copy ships with the delegation plugin (`skills/notion-writing/`). The
> `~/.claude/skills/notion-writing` copy retires once this plugin version is confirmed on
> all four machines — that removal is a chezmoi/dotfiles change, out of scope here.

## Authorship (universal rule — see ~/.claude/rules/10-hard-stops.md)

Docs must appear authored by **Ben Zhuk**, never "Claude Code". Notion's `created_by` is immutable and displays the integration's *current* name, so the integration must stay named "Ben Zhuk" in Notion settings. If a page shows "Claude Code" as author, tell Ben the integration name regressed. Set any explicit Author/people property to the real user Ben Zhuk (`6ba5c1d1-8992-4f27-8187-a7b79276929e`), and never write Claude/AI bylines into content.

Access is **already configured** (`NOTION_TOKEN` env var, an `ntn_...` token, synced via claude.env). Do not ask the user to create an integration or share a page. WebFetch will NOT work on Notion links (auth wall); use the CLI below.

## THE method: markdown-first via the CLI (2026-08-17)

Notion's API has **native markdown endpoints** that create or edit a whole deeply-nested page in **one request** — toggleable headings, nested toggles, callouts included. `~/.claude/scripts/notion.js` (this script itself is not moving — only this skill doc moved into the plugin) wraps them with a hardened transport (30s AbortController timeout, jittered backoff honoring Retry-After, retries on 409/429/5xx/timeouts, `allow_async`+polling for big payloads, upsert-by-title so re-runs never duplicate).

**Do NOT hand-write ad-hoc publisher scripts that build block trees and PATCH per-toggle** — that was the old pattern (75s and 100+ requests for a 20-section page, hangs, duplicate pages). The same page now publishes in ~8-10s with one command. Measured 2026-08-17: create 561-block page 10.9s; re-publish (upsert→replace) 3.3s; read 0.7s.

```bash
node ~/.claude/scripts/notion.js publish <parent-id> "<title>" doc.md   # upsert: replaces if a child page with that title exists, else creates
node ~/.claude/scripts/notion.js read <page-id>            # page → Notion-flavored markdown, 1 request
node ~/.claude/scripts/notion.js edit <page-id> "old text" "new text" [--all]
node ~/.claude/scripts/notion.js append-md <page-id> section.md
node ~/.claude/scripts/notion.js replace-md <page-id> doc.md [--force]
node ~/.claude/scripts/notion.js replace-range <page-id> "start text...end text" new.md
node ~/.claude/scripts/notion.js parent <page-id>          # { id, parent: {type, id}, title }
node ~/.claude/scripts/notion.js comments <page-id> [--json]   # or: comment <page-id> "text" | comment --reply <discussion-id> "text"
```

Content args accept a file path, `-` for stdin, or a literal string, EXCEPT `edit`'s positional old/new text, which are always literal strings (never a file path) — use `--old-file`/`--new-file` (UTF-8, CRLF normalized to LF, one trailing newline stripped, tabs kept exactly) for anything multi-line or backslash-bearing instead — mixing a positional string with the matching `--*-file` flag for the same side is an error. **Always write the doc to a .md file first** (shell quoting mangles inline markdown). `--force` allows edits that delete child pages/databases (default refuses). `publish --new` skips the upsert check. Add `--safe` to require the old text occur exactly once (or at least once with `--all`) before anything is sent, refusing (exit 3, nothing sent) otherwise — the same zero/multiple-match refusal also fires without `--safe` if the API itself rejects the write; note `--all` on a short, common old string weakens the post-write check to a direct simulated-vs-actual comparison rather than a per-line classification, so an `--all` edit still deserves the manual read-back in rule 7 below. `parent`/`comments`/`comment` cover what previously had no command at all (comments cannot be snapshotted or undone by this tool); moving a page (changing its parent) is **not possible through the Notion API** ("A page's parent cannot be changed") — there is no `move` command and none should be built.

## Docs are LIVING — always read fresh before planning or writing

Notion pages change at any moment: Ben and advisors edit them directly, and other Claude sessions write to them too. Writes are last-writer-wins — there is no compare-and-swap. Therefore:

1. **`read` the page fresh BEFORE planning any change.** Never plan edits from a copy pulled earlier in the session, from conversation context, or from memory of what you wrote before — that state may be stale.
2. **Anchor edits on the fresh bytes.** `old_str` for `edit` and the range for `replace-range` come from the just-read output, not retyped text.
3. **Re-read if time passed** between your read and the write (long generation, subagent work, a user break) — re-verify the anchors still exist before writing.
4. **"No matches found" from `edit` usually means the page changed** (or smart-quote bytes) — re-read and re-anchor; never blind-retry.
5. **Before `replace-md` on a page others touch**, diff the fresh `read` against the version your rewrite was based on — anything added in between must be carried into the new content, or it's silently destroyed (the pre-write backup makes this recoverable, not harmless).
6. **The re-read must be SECONDS before the write, not minutes (2026-08-18 incident).** A diff-then-build-then-publish flow clobbered Ben's live edits: the diff was clean when taken, but ~13 minutes of content-building passed before `replace-md`, and edits made in that window were overwritten. The read→diff→write sequence is atomic: if ANY work happens after the diff (script edits, regeneration, verification), read and diff AGAIN immediately before writing. Ben editing the doc live during a session is the NORMAL case, not the exception.
7. **After every `replace-md`, verify no concurrent edits were destroyed**: diff the just-taken pre-write backup (path is printed) against the base copy your content was built from. Any real content in the backup that your base lacks = someone's edits you just overwrote — extract them from that diff and re-apply them onto the live page NOW with surgical edits (never another full replace while merging). This check costs one diff and has caught real losses; treat it as part of the write, not optional.

## Automatic pre-write backups, and automatic post-write verification

Every command that mutates an existing page **snapshots it first** to `~/.local/state/notion-backups/<page-id>/<timestamp>.md` (property writes save `<ts>.props.json`; override dir with `NOTION_BACKUP_DIR`). Backup failure **aborts the write**; `--no-backup` skips. Restore content with `replace-md <page-id> <backup.md> --force`; restore a title/props from the `.props.json` via `update-props`. Backups are machine-local state — never chezmoi-add them. `edit`, `append-md`, `replace-range` and `replace-md` also **re-read the page after writing**, save that as an `<same-timestamp>.after.md` snapshot beside the pre-write one (same timestamp, so it always sorts BEFORE the pre-write `.md` file — "the newest backup" by filename is never the just-written state), and diff the two by line (summary always on stderr): for `edit`/`append-md`/`replace-range`, any removed line beyond what the command itself meant to remove prints as `UNEXPECTED REMOVED: ...` and the command **exits 4** (the write already happened — both backup files are named in the message along with a ready-to-run `replace-md ... --force` restore command, and it usually means the owner was editing concurrently); if the removed span couldn't be relocated in the snapshot (e.g. an ambiguous `replace-range` anchor), the lines print as `REMOVED (could not attribute, check them): ...` and the command exits 0, not 4, since it can't tell expected from unexpected there; `replace-md` prints the summary only and never exits 4. `--no-verify-write` skips the re-read; a failure of the re-read/diff itself is never reported as a failed write.

## Targeting the right page — search is fuzzy

`search` does workspace-wide fuzzy matching and can return an unrelated page FIRST (verified: a query for a fresh test page returned an existing doc). **Never feed a search result's id into a write without checking its title is an exact match** (`props <id>`). Prefer ids you already hold: the JSON printed by `publish`/`create`, or the URL Ben shared.

## Notion-flavored markdown syntax (what the endpoints accept)

Children are indented **one TAB deeper** than their parent. Standard md works (`**bold**`, `*italic*`, `` `code` ``, `-` lists, ``` fences, `>` quotes), plus:

```markdown
# Section title {toggle="true"}          ← toggleable heading_1 (h2/h3 same)
	Everything tab-indented under it becomes its children.
	<details>
	<summary>**Group A**  (7 items)</summary>
		- item one
			nested detail under item one
		- item two
	</details>
<callout icon="🎯" color="gray_background">
	**Goal:** callout text.
</callout>
```

Gotchas: plain `#` headings can NOT have children (only `{toggle="true"}` ones); depth is unlimited (unlike the block API's 2-level-per-request cap); don't escape special chars inside code fences; `read` returns this same flavor, so read→edit→replace round-trips cleanly.

## Page structure style (user preference — always apply when authoring pages)

**Maximize sections and toggles, including toggles within toggles**: major sections = toggleable `heading_1`; within a section, group related items into `<details>` toggles (bold title + a count suffix like `  (7 · 4 covered)`); per-item detail nests inside the item so lists stay one line per item until expanded. Split any group bigger than ~10 items.

- **Blank line at the bottom of every toggle** (Ben, 2026-08-20): end each
  toggle's children with one empty paragraph block, so when a toggle is open the
  reader can see where it ends and the next toggle begins. Applies to every
  toggle level (toggleable headings and `<details>` alike), every page.

- **Colored labels for comparisons** (Ben, 2026-08-17): when a page shows paired
  before/after (or old/new, wrong/right) text, label the pair with colored bold
  spans — `<span color="red">**BEFORE**</span>` / `<span color="green">**AFTER**</span>`
  — the markdown endpoints accept `<span color="...">` inline and it round-trips
  through `read`. Ben finds the color coding genuinely helpful; don't drop it when
  simplifying a doc.
- **Never number or prefix headings** (Ben, 2026-08-17): no "1.", "P1", "Phase 2:"
  etc. in front of section headlines. The heading text stands alone.
- **Audience check (Ben, 2026-08-17)**: an advisor-facing doc (Modi et al.) opens
  directly with the content — no methodology preamble, no internal process
  (judges/contracts/model names/rejected drafts/char counts). Process detail belongs
  only in Ben-facing docs. Determine the audience before building.
- **Builder-facing work state**: keep the canonical state in the existing pair, rather
  than copying it into another status document. The [Goals-page template](../decisions/templates/goals-page.md)
  presents the current goal and subgoals; the [Decisions skill](../decisions/SKILL.md)
  owns decisions, `To Decide` items, `Done`, and comment accounting. Create a
  multiple-choice `To Decide` item only with its [decision-item template](../decisions/templates/decision-item.md).
  These are writing and hand-back conventions, not an automatic update or pickup.

## Surgical edits

- **Text-level find/replace across a page**: `edit` (exact match; add `--all` for multiple matches — without it, >1 match is a validation error, mapped to a clean `exit 3` refusal). Watch smart quotes `“ ” ’` and em dashes — pull the exact substring from `read` output rather than retyping it. For a multi-line edit, or anything with backslashes or tricky quoting, use `--old-file`/`--new-file` (each a plain UTF-8 file; CRLF is normalized to LF, tabs are kept exactly) instead of positional strings — do **not** hand-write a script that PATCHes the markdown endpoint directly, the CLI's own `edit` covers this now. Add `--safe` when you want the CLI to refuse (exit 3, nothing sent) instead of guessing when the old text isn't found exactly once.
- **Section rewrite**: `replace-range <page-id> "section heading...last text of section" new.md`.
  **Never on a section that starts at a toggleable heading (2026-09-09 incident):** `replace-range` keeps the start block's type but drops its toggle flag, so the heading comes back as a plain `#` and every tab-indented child lands as a top-level sibling (the section renders unfolded); starting the file with bare heading text avoids the `# #` prefix but not this. For a toggle section instead: fresh `read` → splice the new section (full `# Title {toggle="true"}` + tab-indented children) into the page markdown → `replace-md` the whole page → verify with `read | cat -A` that the children carry a leading tab → diff the pre-write backup against your base for concurrent edits.
- **Annotation-precise block surgery** (preserve per-run bold/links/colors while changing one word, edit callout icons, to_do checked state): the markdown path may reflow formatting — use the block API. `read-blocks <page-id> --ids` prints the tree with block ids; then `PATCH /blocks/{id}` with only `{ [type]: { rich_text } }` via a small .mjs using the same headers as notion.js. Blocks cannot be moved or type-changed via the API.
- **Databases**: `get-db`, `query-db`, `create-db-row`, `update-props` (unchanged, API version 2022-06-28 semantics).

## API facts (verified live 2026-08-17)

- Markdown endpoints: `POST /v1/pages` with `markdown` body; `GET/PATCH /v1/pages/{id}/markdown`. PATCH body is a discriminated union: `{type:"update_content", update_content:{content_updates:[{old_str,new_str,replace_all_matches}]}}` | `replace_content{new_str}` | `insert_content{content,position:{type:"end"}}` | `replace_content_range{content,content_range}`, each with optional `allow_deleting_content`. The CLI sends `Notion-Version: 2026-03-11` for these and `2022-06-28` elsewhere (keeps database query semantics; do not bump to 2025-09-03+ globally — databases→data_sources is a breaking migration).
- Big writes: `allow_async:true` → 202 `async_task` → poll `status_url` every `poll_after_seconds` until `succeeded`. The CLI does this automatically above ~8KB of markdown. A ~2,000-block page works in one call.
- Rate limit ~3 req/s average per integration; 429 carries Retry-After. 409 `conflict_error` = concurrent writes to the same page — the CLI retries it; still avoid parallel writes to the SAME page. Parallel calls on different pages are fine.
- Block-API limits (legacy path only): 100 blocks per children array, 2 nesting levels per request, 2000 chars per text.content, 500KB payload.

## Always verify

After writing, `read` the page back (1 request) and grep for what you changed. Watch substring false positives ("Modi" matches "com**modi**tizes"). A silent no-match in `edit` means smart-quote/em-dash bytes differ from what you typed.
