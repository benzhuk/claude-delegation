# Decisions reader — spec (v2, amended after round-2 review)

## Why this exists
The owner answers decisions on a Notion page. Agents read the page as markdown (one
request, done by the CALLER, not by this script) and must learn mechanically which
items he answered. A previous attempt grew to nine commands, state files, anchoring
and a sync step, and was scrapped. The approved design: the page is the only state
for open items. This script is a PURE PARSER: markdown in, a status list out. No
network, no state files, no Notion calls, no dependencies beyond Node's standard
library.

## Input
`node skills/decisions/scripts/decisions-read.mjs [file] [--json] [--now <ISO>]` — reads the markdown
from the file, or from stdin when no file (or `-`) is given. `--json` switches to JSON
output. `--now <ISO instant>` sets the clock used for default deadlines (rule 10);
tests must pass this rather than relying on the system clock. `--now` with a missing
value, or a value that does not parse as a timestamp, is BLIND (exit 3, rule 13) with
one stderr line naming the problem — it never silently falls back to the system clock,
since that would make a hook or a mistyped test believe nothing is due. The markdown is
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
   wins.) A CHECKBOX LINE is ALWAYS read as an option — or as the page-level Done
   (rule 6), or as an owner comment by the escaped-asterisk rule (rule 3) — FIRST: the
   reserved `Reply:` (rule 4) and `Default after ` (rule 10) markers are recognised
   only on a line that is NOT a checkbox, so a ticked option whose text happens to
   start with either reserved word is never swallowed as a marker.
3. An OWNER COMMENT is a line whose text, after leading whitespace and after an
   optional list or checkbox marker (`- `, `- [ ] `, `- [x] `), starts with the
   escaped form `\*\*`. A line starting with unescaped `**` is agent-written and is
   NOT a comment. Example of the shape an owner comment arrives in: `\t\t- [ ] \*\*
   which of these is cheaper to undo?`. Such a line is a comment, NOT an option, even
   though it carries a checkbox marker; it never counts as an option or as a tick.
4. A REPLY is a line, other than a checkbox line (rule 2), whose text — after the same
   stripping as rule 3 — matches `Reply:` followed by optional whitespace and a date in
   `YYYY-MM-DD` form (a bare `Reply:` with no date does not count, so an owner typing
   the word by coincidence cannot clear his own comment) — this is how an agent marks an
   owner comment as answered. Within one decision, a comment is REPLIED if such a line
   appears after it and before the next owner comment (or the end of the decision);
   only the nearest still-open comment can be closed this way, and once closed it stays
   closed — a later `Reply:` never reaches back past the next comment. A `Reply:` line
   is never an option or a comment.
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
6. The page-level DONE line: ANY checkbox whose text is exactly `Done`
   (case-sensitive), AT ANY INDENTATION (column 0, tabs, or spaces) and wherever in
   the document it sits, is the page-level Done marker and is NEVER an option of any
   decision. `done` is read from the LAST such line found (`true`/`false`; `null` when
   none exist). Three independent anomalies, each its own WARN (rule 11), none of them
   silent: (a) the line is indented (not column 0) — `Done line is indented`; (b) the
   last such line is not the true last non-empty line of the document (ignoring
   trailing blank lines and trailing `<empty-block/>` lines) — `Done is not the last
   line`; (c) more than one such line exists — `more than one Done line`. A page that
   contains at least one real decision (rule 5) but no Done line at all is itself an
   anomaly (rule 11's `no Done line found`) — the skill leans on Done to assert
   "nothing open," so its total absence must not be silent either. A page with no real
   decisions (grouping titles only) needs no Done line and is not warned.
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
10. DEFAULTS. Inside a decision, a NON-CHECKBOX line (rule 2) whose text (after the
    same stripping as rule 3) starts with the word `Default` AND contains a `:` is
    inspected: if it does not start with `Default after `, or does not otherwise
    match this exact shape — `Default after YYYY-MM-DD HH:MM ±HH:MM: <option text>`
    — it is a WARN, `default line is not in the required shape` (rule 11), and it is
    never an option. The `:` requirement exists so that ordinary prose starting with
    the word "Default" (e.g. an evidence line like "Default behaviour today is to run
    uncapped…") is not mistaken for a deadline and does not raise a false WARN — a
    deadline line always carries `: <option>`. This still catches BOTH an
    older/malformed deadline phrasing entirely (e.g. an owner's pre-v2 "Default if
    unanswered by …: <option>" line) and a `Default after ` line whose shape is
    otherwise wrong. A well-shaped line is parsed into `default: { text, at }`
    (`at` as an ISO instant, computed from the given local date/time and its numeric
    UTC offset) — but the written date/time must be a REAL calendar instant: `Date`
    silently rolls an impossible one over (`2026-02-30` to March 2, `24:00` to the
    next day), so those are round-tripped against the written components and rejected
    (same WARN) rather than silently accepted with a shifted deadline. The first
    well-shaped line inside a decision wins if more than one appears. The current time
    for comparison comes from `--now <ISO>` when given (tests must use it), else the
    system clock; a decision otherwise OPEN or REPLIED whose current time is at or
    after its default's `at` is DUE (rule 7), and its detail is the default's text. A
    line starting with `No default` does not start with `Default`, so it is untouched
    by this rule — no default set, no warning; it is instead tracked to satisfy rule
    10a below. A `Deadline:` line, or any other deadline phrased without the word
    "Default" at all, is read as ordinary prose — it sets no default and by itself
    raises no WARN under this rule (it does under rule 10a).
10a. DEFAULT REQUIRED. The skill requires every decision to carry exactly one of a
    well-shaped default (rule 10) or an explicit `No default` line. This is
    mechanical, not left to an agent to notice: once a decision's parse is complete,
    if it has neither a parsed `default` NOR a line starting `No default` anywhere
    inside it, it is a WARN, `no default or "No default" line: <decision title>`
    (rule 11) — naming the title, so multiple such decisions on one page are each
    identifiable. This never changes the decision's `status`, and affects the exit
    code only the way any other WARN already does (rule 11/13). A title with zero
    options (a grouping heading, a Closed/archived section of plain bullets) is not a
    decision and is exempt — this check only runs over titles that already qualify as
    decisions under rule 5.
11. WARN: a document-level anomaly that is reported but never fails the parse — a
    drifted or missing Done marker (rule 6), a malformed default deadline (rule 10),
    or a decision missing both a default and a "No default" line (rule 10a).
    Reported as `{ text, line }`; never dropped, always actionable (exit 1).
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
`UNATTACHED<TAB>line N<TAB>text` lines (with a trailing `<TAB>(under <title>)` when rule
9 applies); then `WARN<TAB>text` lines; then `DECISIONS<TAB>n`; last line
`DONE<TAB>true|false|absent`.

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
option" is REPLACED by rule 6 above: a Done checkbox is never an option regardless of
position or indentation, and an out-of-place one now WARNs instead of silently
becoming a false option. Everything else in v1 (rules 1, 3, 5, 8, 12, 13 above) is
unchanged. New in v2: replies (rule 4), default deadlines and the DUE status (rules 7,
10), reported strays under non-decision titles (rule 9), and document-level warnings
(rule 11).

## Changes after round-2 review (same v2, amended)
The first v2 pass anchored the Done marker at column 0 only, checked `Reply:`/`Default
after ` prefixes ahead of the checkbox branch, accepted an impossible calendar date by
letting `Date` roll it over, only recognised the literal `Default after ` prefix (an
older phrasing WARN'd silently — never), and let `--now` fail two ways without telling
anyone (a missing value fell back to the system clock; an unparseable one silently
suppressed every DUE). All five are fixed above (rules 2, 6, 10, and the Input
section's `--now` note). Also new: the checkbox-first ordering rule (rule 2), the
narrowed `Reply:` + date shape (rule 4), the reported `under` in the plain-text output
(Output section), and the "no Done line at all" WARN (rule 6).

## Changes after the final review (same v2, one more amendment)
Round-3's broadened `/^Default\b/` check also fired on ordinary prose that merely
starts with the word "Default" (e.g. an evidence sentence), raising a false WARN on an
otherwise-clean decision. Rule 10 now also requires the line to contain a `:` before
it is treated as a deadline candidate — a real deadline line always has one
(`Default after …: <option>`), so this closes the false-WARN gap without reopening
the "silently ignored" gap round-2 (P5) fixed.

## Changes after the final review, round 2 (same v2, one more amendment)
A deadline phrased without the word "Default" at all (`Deadline: 2026-09-25, cap at
200`, or plain prose with no deadline marker whatsoever) set no default and raised no
WARN — an authoring-compliance gap the skill's own rule (exactly one of a default or a
"No default" line, on every item) already closed on paper but the parser never
enforced. New rule 10a makes it mechanical: any decision ending its parse with neither
is now a WARN naming the decision's title. This is additive only — it changes no
decision's `status`, and follows the same exit-code behavior every other WARN already
has (rule 13).

## Addendum, 2026-09-22

This reader stays a pure parser: no rule above changes. The owner-note handling
(instruction vs. question, act/log/delete vs. Reply/archive), the goals-mirror
renderer and staleness check, and the hand-back check that gates the URL going back
to the owner are specified separately in `docs/specs/2026-09-22-decisions-current.md`
— read that spec for anything past this file's own rules 1-13.
