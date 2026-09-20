# Decisions reader — spec

## Why this exists
The owner answers decisions on a Notion page. Agents read the page as markdown (one
request, done by the CALLER, not by this script) and must learn mechanically which
items he answered. A previous attempt grew to nine commands, state files, anchoring
and a sync step, and was scrapped. The approved design: the page is the only state
for open items. This script is a PURE PARSER: markdown in, a status list out. No
network, no state files, no Notion calls, no dependencies beyond Node's standard
library.

## Input
`node scripts/decisions-read.mjs [file]` — reads the markdown from the file, or from
stdin when no file (or `-`) is given. Flag `--json` for JSON output. The markdown is
Notion-flavored, as produced by Notion's markdown export: children are indented with
TABS; toggles appear either as `<details>` + `<summary>TITLE</summary>` … `</details>`,
or as toggleable headings `# TITLE {toggle="true"}` (levels 1-3); checkboxes are
`- [ ] text` / `- [x] text`; empty paragraphs are `<empty-block/>`; text the owner
typed containing asterisks arrives ESCAPED as `\*\*`, while bold written by agents
arrives as plain `**`.

## Rules
1. A TITLE is any `<summary>` line or toggleable heading, at any indentation depth.
   Normalize a title for display: strip surrounding `**`, strip a trailing count
   suffix in parentheses that starts with a digit (e.g. `  (7 · 4 covered)`), trim.
2. Every checkbox line and every OWNER COMMENT attaches to the NEAREST PRECEDING
   title, at any depth. (No indentation logic beyond that. Nearest preceding title
   wins.)
3. An OWNER COMMENT is a line whose text, after leading whitespace and after an
   optional list or checkbox marker (`- `, `- [ ] `, `- [x] `), starts with the
   escaped form `\*\*`. A line starting with unescaped `**` is agent-written and is
   NOT a comment. Real example of an owner comment line: `\t\t- [ ] \*\* what are the
   tradeoffs here? option 2 sounds…`. Such a line is a comment, NOT an option, even
   though it carries a checkbox marker; it never counts as an option or as a tick.
4. A DECISION is a title with at least one option (a checkbox line that is not an
   owner comment) attached to it. Titles with no options are grouping sections and
   are not reported.
5. The page-level DONE line: the LAST NON-EMPTY line of the document, ignoring
   trailing blank lines and trailing `<empty-block/>` lines, if it is a checkbox at
   column 0 whose text is exactly `Done` (case-sensitive). It is not an option of any
   decision. Report `done: true | false | null` (null when absent). A `Done` checkbox
   anywhere else is an ordinary option.
6. Status of each decision: `AMBIGUOUS` if two or more options are ticked; otherwise
   `TICKED` if exactly one is; otherwise `COMMENTED` if it has at least one owner
   comment; otherwise `OPEN`. A TICKED decision also lists its comments if any.
7. UNATTACHED: a ticked checkbox or an owner comment that appears before any title.
   Reported with its line number, never dropped.
8. Lines inside a fenced code block (``` … ```), at any indentation, are ignored
   entirely. An unterminated fence means the rest of the document cannot be trusted:
   FAIL CLOSED, exit 3.
9. Exit codes: `0` = parsed, nothing for an agent to act on (every decision OPEN,
   nothing unattached); `1` = parsed, something to act on (any TICKED, COMMENTED,
   AMBIGUOUS or UNATTACHED); `3` = blind (empty input, unreadable file, unterminated
   fence, or zero titles found). NEVER exit 2 (hook harnesses read 2 as "block") —
   including an internal crash (wrap main; a crash is exit 3 with a one-line stderr
   message).

## Output
Default: one line per decision, `STATUS<TAB>title<TAB>detail`, where detail is the
ticked option's text, or the comment text(s), or for AMBIGUOUS the ticked texts
joined with ` | `; then `UNATTACHED<TAB>line N<TAB>text` lines; last line
`DONE<TAB>true|false|absent`. With `--json`:
`{ "decisions": [{ "title", "status", "line", "options": [{ "text", "ticked", "line" }], "comments": [{ "text", "line" }] }], "unattached": [{ "text", "line", "kind": "tick"|"comment" }], "done": true|false|null }`.
Comment text is reported with the leading `\*\*` and any marker removed and trimmed.
Line numbers are 1-based.
