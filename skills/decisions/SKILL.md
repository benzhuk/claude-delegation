---
name: decisions
description: Use when something only the owner can decide comes up, when writing or reading the owner's decisions page, or when choosing between blocking on a question and recording it and moving on. NOT for peer asks between equal sessions — that is multi.
---

# Decisions — record it, keep moving

## The one idea

A session never blocks on the owner. It records the decision on the owner's decisions
page, keeps working on whatever else is dispatchable, and picks the answer up later.

## Writing an item

Shape: `templates/decision-item.md`, read with `scripts/decisions-read.mjs` (both
live in this skill's own folder, so the path is the same read from a checkout or a
mirrored copy). Every item goes in through the template shape. A bullet that is not a
`<details>` toggle with unticked options and a Default or No default line is not a
decision — the reader cannot see it (checked by `scripts/decisions-read.mjs`, rule 5).

One toggle per decision, a unique title, one or two lines of evidence, two to four
unticked options with the recommended one FIRST marked "(recommended)" (not checked).
Last plain line: `Default after <date> <time> <±UTC offset>: <option>` for a
reversible decision — use the offset in force on that date (`-04:00` New York in
summer, `-05:00` in winter), e.g. `Default after 2030-06-15 18:00 -04:00: cap at 200
items per run` — or `No default: <reason>` for anything irreversible, costly, or
that changes the owner's machines (checked by `scripts/decisions-read.mjs`, rule 10a).
Inside the item, no agent line starts with bold — some agent-written bold comes back
from Notion escaped exactly like an owner comment (not checked). Bold stays only in
the `<summary>` title (not checked).

In chat, give the link and the item title only. Never restate the options or the
recommendation in chat; a decision that exists only in chat is invisible to the
reader (not checked).

## Page rules

`scripts/decisions-read.mjs` reads a comment from a line starting with the escaped
`\*\*` Notion produces from the owner's typed asterisks — plain agent bold
(`**like this**`) is never one (checked by `scripts/decisions-read.mjs`). Never
re-type or quote the owner's line when answering it: a copied `\*\*` prefix forges a
second comment that never clears (not checked). Write and read the page through the
`notion-writing` skill: markdown endpoints only, one request per page, never a
whole-page replace, read fresh seconds before writing, a multi-line edit built from a
script with the old and new text loaded from files, not argv (not checked).

New items go inside the open section, never appended past the page-level `- [ ] Done`
line (`append-md` must not be used for this) (not checked). Whoever adds an item
unticks Done in the same pass; whoever closes the last open item ticks it back —
`scripts/decisions-handback.mjs` checks that DONE is `false` when DECISIONS is greater
than 0 and `true` when DECISIONS is 0 (an absent Done line blocks the hand-back).

Keep the page in two sections the owner reads, `# Waiting on you now` and `# Closed`;
status narrative and logs live in the repo (`docs/work`, `docs/ledger`), not on this
page (not checked). This build does not delete any existing extra section already on
the page — whether to remove one is the lead's call with the owner, not this skill's.

## Reading answers

`node ~/.claude/scripts/notion.js read <page-id> | node scripts/decisions-read.mjs`
(path per above; page id from `.agents/project.json`'s `decisions_url`, else from the
owner — never search, it's fuzzy). Exit 1: act, below. Exit 0: OPEN/REPLIED only —
nothing due. Exit 3: BLIND (empty read, bad fence, no titles) — stop, tell the owner,
change nothing (checked by `scripts/decisions-read.mjs`).

- AMBIGUOUS or UNATTACHED: report to the owner — never guess, never drop it
  (reported by `scripts/decisions-read.mjs`; UNATTACHED also blocks the hand-back via
  `scripts/decisions-handback.mjs`).
- TICKED: `scripts/decisions-read.mjs` reports the ticked option; act on it (not
  checked). An unreplied comment on the same item still needs a reply (next bullet) —
  a tick never cancels it (checked by `scripts/decisions-read.mjs`).
- An owner note (a line starting with the escaped `\*\*`, on either the decisions page
  or the goals page) is one of two kinds, told apart by what the lead does, never by
  parsing the owner's text:
  - An instruction: do it, or record why not. Write one plain bullet under
    `# Closed` (on the decisions page, even for a note found on the goals page)
    beginning `Your note, <M-D>: "<first 12 words of the note>…" — <what was done>`,
    and delete the owner's line (not checked).
  - A question: write `Reply: <YYYY-MM-DD> <answer>` directly under the owner's line
    — the numeric date is required, and this is what stops the next read reporting it
    again (checked by `scripts/decisions-read.mjs`, REPLY_RE). Both lines stay until
    the first hand-back pass whose date is after the Reply date — flagged as an
    `ARCHIVE` line by `scripts/decisions-handback.mjs` (non-blocking) — at which point
    the pair is archived: one plain bullet under `# Closed` beginning `Your question,
    <M-D>: "<first 12 words>…" — <the answer>`, and both lines are deleted from the
    open section (not checked). A follow-up from the owner under a reply is a new
    `\*\*` line and is COMMENTED again (checked by `scripts/decisions-read.mjs`).
- DUE: the item's `Default after …` deadline passed unanswered (reported by
  `scripts/decisions-read.mjs`). Apply the default, tell the owner in the same
  message, and close the item (not checked).
- WARN: the page is broken — Done missing, misplaced, indented, or duplicated, or a
  `Default` line off-shape (checked by `scripts/decisions-read.mjs`). Rewrite older
  wording into the required shape and fix before trusting anything else (not checked).
- REPLIED or OPEN: nothing to do.

## Closing

DELETE the item's toggle, checkboxes and all, and write ONE plain bullet in Closed:
title, what was chosen, the date, the OBSERVED result — never move or copy the toggle
(not checked). Closing an item deletes its toggle. A closed toggle left in Closed
keeps reporting TICKED or OPEN forever (checked by `scripts/decisions-read.mjs`, rule
5: closed items must be written as plain bullets).

## Handing the page back

Before giving the owner the decisions URL, run the hand-back check on fresh reads of
both pages (a read is two `notion.js read` calls, run through a Sonnet runner):

```
node ~/.claude/scripts/notion.js read <decisions-page-id> > /tmp/decisions.md
node ~/.claude/scripts/notion.js read <goals-page-id> > /tmp/goals.md
node skills/decisions/scripts/decisions-handback.mjs --decisions /tmp/decisions.md --goals /tmp/goals.md --repo .
```

Exit 0 only: give the owner the URL, on a read taken seconds earlier (checked by
`scripts/decisions-handback.mjs`). The check prints, just before `HANDBACK ok`, a
`Decisions waiting: <n>, notes logged today: <n>, goals mirror at <sha>` line — paste
it verbatim as the last line of the hand-back message, so the line cannot exist
unless the check ran (checked by `scripts/decisions-handback.mjs`).

## Keeping the goals mirror current

After a release changes `docs/GOALS.md` or `docs/goals/card.md`, publish the mirror
before the next hand-back:

```
node skills/decisions/scripts/goals-mirror.mjs publish --repo . --parent <goals_parent_page> --current <read>
```

`<goals_parent_page>` comes from `.agents/project.json`; `<read>` is a fresh
`notion.js read` of the existing Goals child page (or `none` when it does not exist
yet). The command refuses (exit 1) if the read carries any unresolved owner note, or
if a source file differs from its `origin/main` blob (checked by
`scripts/goals-mirror.mjs`). `docs/pane-setup.md`'s `## Releasing` section is where
this step lives in a release's own checklist.

## Sub-sessions

A sub-session sends its decision UP to the session that talks to the owner:
`note-send` with `--kind ASK --needs decision` (the `multi` skill). That session
batches simple ones into one pass, after everything dispatchable is dispatched (not
checked).
