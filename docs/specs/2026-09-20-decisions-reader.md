# Decisions reader — spec (v2)

## Why this exists
The owner answers decisions on a Notion page. Agents read the page as markdown (one
request, done by the CALLER, not by this script) and must learn mechanically which
items he answered. A previous attempt grew to nine commands, state files, anchoring
and a sync step, and was scrapped. The approved design: the page is the only state
for open items. This script is a PURE PARSER: markdown in, a status list out. No
network, no state files, no Notion calls, no dependencies beyond Node's standard
library.

## Input
`node scripts/decisions-read.mjs [file] [--json] [--now <ISO>]` — reads the markdown
from the file, or from stdin when no file (or `-`) is given. `--json` switches to JSON
output. `--now <ISO instant>` sets the clock used for default deadlines (rule 10);
tests must pass this rather than relying on the system clock. The markdown is
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
   NOT a comment. Example of the shape an owner comment arrives in: `\t\t- [ ] \*\*
   which of these is cheaper to undo?`. Such a line is a comment, NOT an option, even
   though it carries a checkbox marker; it never counts as an option or as a tick.
4. A REPLY is a line whose text, after the same stripping as rule 3, starts with
   `Reply:` (case-sensitive) — this is how an agent marks an owner comment as
   answered. Within one decision, a comment is REPLIED if a `Reply:` line appears
   after it and before the next owner comment (or the end of the decision); only the
   nearest still-open comment can be closed this way, and once closed it stays closed
   — a later `Reply:` never reaches back past the next comment. A `Reply:` line is
   never an option or a comment, regardless of what marker it carries.
5. A DECISION is a title with at least one option (a checkbox line that is not an
   owner comment, a Done line, or a Reply line) attached to it. Titles with no
   options are grouping sections and are not reported as decisions — but see rule 9
   for what happens to comments and stray ticks under one.

   An item that closes loses its checkboxes: closed items are written as plain
   bullets. The reader cannot tell a historical ticked box from a live one, so a
   Closed section that keeps its checkboxes will be reported as an answered
   decision. A checkbox inside a callout that sits inside a decision is read as
   one of that decision's options, so callouts inside a decision must not
   contain checkboxes.
6. The page-level DONE line: ANY checkbox at column 0 (no leading whitespace at all)
   whose text is exactly `Done` (case-sensitive), wherever in the document it sits, is
   the page-level Done marker and is NEVER an option of any decision. (An INDENTED
   `Done` checkbox is unaffected by this rule and remains an ordinary option, as in
   v1.) `done` is read from the LAST such column-0 line found (`true`/`false`; `null`
   when none exist). If that last line is not the true last non-empty line of the
   document (ignoring trailing blank lines and trailing `<empty-block/>` lines), or if
   more than one column-0 Done line exists, this is a WARN (rule 11) — a page whose
   Done marker has drifted must never be silent.
7. Status of each decision, in priority order: `AMBIGUOUS` if two or more options are
   ticked; otherwise `TICKED` if exactly one is; otherwise `COMMENTED` if it has at
   least one owner comment that is NOT replied; otherwise `DUE` if it carries a valid
   default (rule 10) whose deadline has passed; otherwise `REPLIED` if it has one or
   more owner comments and all are replied; otherwise `OPEN`. A TICKED decision lists
   its still-unreplied comments alongside the ticked option (a tick never hides a
   still-live comment) — comments that have been replied are omitted from the detail
   but stay in the JSON with `replied: true`.
8. UNATTACHED: a ticked checkbox or an owner comment that appears before any title.
   Reported with its line number, never dropped.
9. A stray attached to a title that is NOT a decision (rule 5: a title with no real
   options) is ALSO reported as UNATTACHED, never silently dropped, carrying
   `"under": "<that title>"`: this covers (a) an owner comment under a heading that
   has no checkboxes of its own, and (b) a stray, non-canonical, TICKED Done line (see
   rule 6) whose nearest title ends up with zero real options. The canonical (last)
   Done line is exempt from (b) — it is the page-level marker, not a stray, even when
   the title nearest to it happens to have zero options (e.g. a Closed section written
   correctly as plain bullets, immediately before the final Done line).
10. DEFAULTS. Inside a decision, a line whose text (after the same stripping as rule
    3) starts with `Default after ` must have exactly this shape: `Default after
    YYYY-MM-DD HH:MM ±HH:MM: <option text>`, parsed into `default: { text, at }` (`at`
    as an ISO instant, computed from the given local date/time and its numeric UTC
    offset). The first such line inside a decision wins if more than one appears. A
    line starting `Default after ` that does not match this shape, or whose date/time
    is not a real calendar instant, is a WARN naming the line (rule 11) and is never
    an option. The current time for comparison comes from `--now <ISO>` when given
    (tests must use it), else the system clock; a decision otherwise OPEN or REPLIED
    whose current time is at or after its default's `at` is DUE (rule 7), and its
    detail is the default's text. A line starting with `No default` is ignored (no
    default set, no warning). Any other line starting with `Default` is likewise
    ignored — only the exact `Default after ` shape is inspected.
11. WARN: a document-level anomaly that is reported but never fails the parse — a
    drifted Done marker (rule 6) or a malformed default deadline (rule 10). Reported
    as `{ text, line }`; never dropped, always actionable (exit 1).
12. Lines inside a fenced code block (``` … ```), at any indentation, are ignored
    entirely. An unterminated fence means the rest of the document cannot be trusted:
    FAIL CLOSED, exit 3.
13. Exit codes: `0` = parsed, nothing for an agent to act on (every decision OPEN or
    REPLIED, nothing unattached, no warnings); `1` = parsed, something to act on (any
    AMBIGUOUS, TICKED, COMMENTED or DUE decision, any UNATTACHED entry, or any
    warning); `3` = blind (empty input, unreadable file, unterminated fence, or zero
    titles found). NEVER exit 2 (hook harnesses read 2 as "block") — including an
    internal crash (wrap main; a crash is exit 3 with a one-line stderr message).

## Output
Default: one line per decision, `STATUS<TAB>title<TAB>detail`, where detail is the
ticked option's text (plus any still-unreplied comments' text for TICKED, joined with
` | `), or the unreplied comments' text for COMMENTED, or the ticked texts joined with
` | ` for AMBIGUOUS, or the default's text for DUE, or empty for REPLIED/OPEN; then
`UNATTACHED<TAB>line N<TAB>text` lines; then `WARN<TAB>text` lines; then
`DECISIONS<TAB>n`; last line `DONE<TAB>true|false|absent`.

With `--json`:
```
{
  "decisions": [{
    "title", "status", "line",
    "options": [{ "text", "ticked", "line" }],
    "comments": [{ "text", "line", "replied" }],
    "default": { "text", "at" } | null
  }],
  "unattached": [{ "text", "line", "kind": "tick"|"comment", "under"? }],
  "warnings": [{ "text", "line" }],
  "decisionCount": n,
  "done": true | false | null
}
```
`under` is present only on an UNATTACHED entry produced by rule 9 (a stray attached to
a non-decision title); a stray before any title (rule 8) omits it. Comment text is
reported with the leading `\*\*` and any marker removed and trimmed. Line numbers are
1-based.

`DECISIONS`/`decisionCount` reports how many decisions were found, so a caller can
tell "legitimately nothing to act on" apart from a format drift that stopped
matching decisions at all. Zero decisions on a page that plainly has content (many
titles, long sections) means the export shape moved — this is not itself a reason
to fail closed, because a page whose items have all closed legitimately also has
zero decisions; the count exists so the caller can judge that against what it
already knows about the page.

## Changes from v1
v1's rule "a `Done` checkbox anywhere else [than the true last line] is an ordinary
option" is REPLACED by rule 6 above: a column-0 Done checkbox is never an option
regardless of position, and an out-of-place one now WARNs instead of silently
becoming a false option. Everything else in v1 (rules 1-3, 5, 8, 12, 13 above) is
unchanged. New in v2: replies (rule 4), default deadlines and the DUE status (rules 7,
10), reported strays under non-decision titles (rule 9), and document-level warnings
(rule 11).
